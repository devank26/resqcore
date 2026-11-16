import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

class TacticalSyncService {
  static const String _configuredBaseUrl = String.fromEnvironment('API_BASE_URL');
  static final List<String> candidateHosts = [
    if (_configuredBaseUrl.isNotEmpty) _configuredBaseUrl,
    'http://10.0.2.2:5000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ].toSet().toList();

  static String _activeHost = candidateHosts.first;
  static RealtimeChannel? _channel;
  static RealtimeChannel? _volunteerChannel;
  static Timer? _reconnectTimer;
  static Timer? _pollFallbackTimer;
  static bool _isConnected = false;
  static String _teamId = '';
  static String _role = '';
  static String _name = '';
  static void Function(Map<String, dynamic>)? _onEvent;

  static String get activeHost => _activeHost;
  static bool get isConnected => _isConnected;

  static Map<String, String> _headers({bool json = false}) {
    final headers = <String, String>{
      if (json) 'Content-Type': 'application/json',
    };
    try {
      final token = Supabase.instance.client.auth.currentSession?.accessToken;
      if (token != null && token.isNotEmpty) headers['Authorization'] = 'Bearer $token';
    } catch (_) {}
    return headers;
  }

  static Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    Object? lastError;
    for (final host in [_activeHost, ...candidateHosts].toSet()) {
      try {
        final uri = Uri.parse('$host/api$path');
        final request = http.Request(method, uri)..headers.addAll(_headers(json: body != null));
        if (body != null) request.body = jsonEncode(body);
        final streamed = await request.send().timeout(const Duration(seconds: 8));
        final response = await http.Response.fromStream(streamed);
        final decoded = response.body.isEmpty
            ? <String, dynamic>{}
            : jsonDecode(response.body) as Map<String, dynamic>;
        if (response.statusCode >= 200 && response.statusCode < 300) {
          _activeHost = host;
          return decoded;
        }
        if (response.statusCode == 401 || response.statusCode == 403 || response.statusCode == 404) {
          throw StateError(decoded['error']?.toString() ?? 'The request was not authorized.');
        }
        lastError = StateError(decoded['error']?.toString() ?? 'Backend request failed.');
      } catch (error) {
        if (error is StateError) rethrow;
        lastError = error;
      }
    }
    throw StateError(lastError?.toString() ?? 'Backend is unavailable.');
  }

  static Future<Map<String, dynamic>?> getStaffProfile() async {
    try {
      final result = await _request('GET', '/auth/me');
      return result['success'] == true ? result : null;
    } catch (_) {
      return null;
    }
  }

  static Future<bool> checkConnection() async {
    try {
      await _request('GET', '/health');
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<void> connectRealtime({
    required String teamId,
    required String role,
    required String name,
    required void Function(Map<String, dynamic> event) onEvent,
  }) async {
    disconnectRealtime();
    _teamId = teamId;
    _role = role;
    _name = name;
    _onEvent = onEvent;

    try {
      final client = Supabase.instance.client;
      final channel = client.channel('rescue-live-${client.auth.currentUser?.id ?? teamId}');
      _channel = channel;

      channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'incidents',
        callback: (payload) {
          if (payload.eventType == PostgresChangeEvent.delete) return;
          final row = _normalizeIncident(payload.newRecord);
          if (payload.eventType == PostgresChangeEvent.insert) {
            final event = row['isRescueSOS'] == true
                ? 'new_rescue_sos'
                : row['isCitizenSOS'] == true
                    ? 'new_citizen_sos'
                    : 'incident_reported';
            onEvent({
              'event': event,
              'data': event == 'new_rescue_sos' ? {'sosIncident': row, 'teamName': row['assignedTeam']} : {'incident': row},
            });
            return;
          }
          onEvent({
            'event': 'incident_status_changed',
            'data': {
              'incidentId': row['id'],
              'incident': row,
              'status': row['status'],
              'notes': row['substatus'] ?? row['responseDetail'],
            },
          });
        },
      );

      channel.onPostgresChanges(
        event: PostgresChangeEvent.insert,
        schema: 'public',
        table: 'messages',
        callback: (payload) {
          final row = _normalizeMessage(payload.newRecord, client.auth.currentUser?.id);
          onEvent({'event': 'new_chat_message', 'data': {'channel': row['channel'], 'message': row}});
        },
      );

      channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'teams',
        callback: (payload) {
          if (payload.eventType == PostgresChangeEvent.delete) return;
          final row = payload.newRecord;
          onEvent({
            'event': 'team_telemetry_update',
            'data': {
              'teamId': row['id'],
              'team': row,
              'lat': row['lat'],
              'lng': row['lng'],
              'battery': row['battery'],
              'status': row['status'],
            },
          });
        },
      );

      channel.onPostgresChanges(
        event: PostgresChangeEvent.insert,
        schema: 'public',
        table: 'alerts',
        callback: (payload) => onEvent({'event': 'emergency_broadcast', 'data': {'alert': payload.newRecord}}),
      );

      await channel.subscribe((status, error) {
        _isConnected = status == RealtimeSubscribeStatus.subscribed;
        if (status == RealtimeSubscribeStatus.channelError || status == RealtimeSubscribeStatus.timedOut) {
          _scheduleReconnect();
        }
      });

      if (!_isConnected) _startPollFallback(onEvent);
    } catch (_) {
      _isConnected = false;
      _startPollFallback(onEvent);
      _scheduleReconnect();
    }
  }

  static Map<String, dynamic> _normalizeIncident(Map<String, dynamic> row) {
    final coordinates = row['coordinates'] is Map ? Map<String, dynamic>.from(row['coordinates'] as Map) : <String, dynamic>{};
    return {
      ...row,
      'fullAddress': row['full_address'],
      'shortLocation': row['short_location'] ?? row['location'],
      'affectedCount': row['affected'],
      'responseSummary': row['response_summary'],
      'responseDetail': row['response_detail'],
      'fieldReport': row['field_report'],
      'contactNumber': row['contact_number'],
      'citizenName': row['citizen_name'],
      'assignedTeam': row['assigned_team'],
      'teamAssigned': row['assigned_team'],
      'teamId': row['team_id'],
      'sectorId': row['sector_id'],
      'isCitizenSOS': row['is_citizen_sos'],
      'isRescueSOS': row['is_rescue_sos'],
      'coordinates': coordinates,
      'createdAt': row['created_at'],
    };
  }

  static Map<String, dynamic> _normalizeMessage(Map<String, dynamic> row, String? userId) {
    final isSelf = row['created_by'] != null && row['created_by'] == userId;
    final sender = (row['sender'] ?? '').toString();
    return {
      ...row,
      'channel': row['channel_id'],
      'channelId': row['channel_id'],
      'initials': row['initials'],
      'locationTag': row['location_tag'],
      'attachmentUrl': row['attachment_url'],
      'isAlert': row['is_alert'],
      'isSelf': isSelf,
      'sender': isSelf && !sender.endsWith(' · You') ? '$sender · You' : sender,
      'time': DateTime.tryParse((row['created_at'] ?? '').toString())?.toLocal().toString() ?? 'Now',
    };
  }

  static void _scheduleReconnect() {
    if (_teamId.isEmpty || _onEvent == null || _reconnectTimer?.isActive == true) return;
    _reconnectTimer = Timer(const Duration(seconds: 5), () {
      connectRealtime(teamId: _teamId, role: _role, name: _name, onEvent: _onEvent!);
    });
  }

  static void _startPollFallback(void Function(Map<String, dynamic> event) onEvent) {
    if (_pollFallbackTimer?.isActive == true) return;
    _pollFallbackTimer = Timer.periodic(const Duration(seconds: 15), (_) async {
      final incidents = await fetchIncidents();
      if (incidents.isNotEmpty) onEvent({'event': 'incidents_sync', 'data': {'incidents': incidents}});
      final messages = await fetchChatMessages();
      if (messages.isNotEmpty) onEvent({'event': 'chat_sync', 'data': {'messages': messages}});
    });
  }

  static void disconnectRealtime() {
    stopWatchingVolunteers();
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _pollFallbackTimer?.cancel();
    _pollFallbackTimer = null;
    final channel = _channel;
    _channel = null;
    if (channel != null) {
      try { Supabase.instance.client.removeChannel(channel); } catch (_) {}
    }
    _isConnected = false;
  }

  static Future<List<Map<String, dynamic>>> fetchIncidents() async {
    try {
      final data = await _request('GET', '/incidents');
      final rows = data['incidents'];
      return rows is List ? rows.cast<Map<String, dynamic>>() : [];
    } catch (_) {
      return [];
    }
  }

  static Future<List<Map<String, dynamic>>> fetchTeams() async {
    try {
      final data = await _request('GET', '/teams');
      final rows = data['teams'];
      return rows is List ? rows.cast<Map<String, dynamic>>() : [];
    } catch (_) {
      return [];
    }
  }

  static Future<List<Map<String, dynamic>>> fetchShelters() async {
    try {
      final data = await _request('GET', '/shelters');
      final rows = data['shelters'];
      return rows is List ? rows.cast<Map<String, dynamic>>() : [];
    } catch (_) {
      return [];
    }
  }

  static Future<List<Map<String, dynamic>>> fetchVolunteers({String? status, String? sectorId}) async {
    final params = <String, String>{
      if (status != null && status != 'All') 'status': status,
      if (sectorId != null && sectorId.isNotEmpty) 'sector_id': sectorId,
    };
    final query = params.isEmpty ? '' : '?${Uri(queryParameters: params).query}';
    try {
      final data = await _request('GET', '/volunteers$query');
      final rows = data['volunteers'];
      return rows is List ? rows.cast<Map<String, dynamic>>() : [];
    } catch (_) {
      return [];
    }
  }

  static Future<Map<String, dynamic>?> registerVolunteer({required String name, required String phone, required List<String> skills}) async {
    try {
      return await _request('POST', '/volunteers/register', body: {'name': name, 'phone': phone, 'skills': skills});
    } catch (_) {
      return null;
    }
  }

  static Future<bool> updateVolunteerStatus(String volunteerId, String status) async {
    try {
      await _request('PUT', '/volunteers/${Uri.encodeComponent(volunteerId)}', body: {'status': status});
      return true;
    } catch (_) {
      return false;
    }
  }

  static void watchVolunteers(void Function() onChange) {
    stopWatchingVolunteers();
    try {
      final client = Supabase.instance.client;
      final channel = client.channel('volunteers-live-${client.auth.currentUser?.id ?? _teamId}');
      _volunteerChannel = channel;
      channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'volunteers',
        callback: (_) => onChange(),
      ).subscribe();
    } catch (_) {}
  }

  static void stopWatchingVolunteers() {
    final channel = _volunteerChannel;
    _volunteerChannel = null;
    if (channel != null) {
      try { Supabase.instance.client.removeChannel(channel); } catch (_) {}
    }
  }

  static Future<List<Map<String, dynamic>>> fetchChatMessages({String channel = 'command:all'}) async {
    try {
      final data = await _request('GET', '/chat/messages?channel=${Uri.encodeQueryComponent(channel)}');
      final messages = data['messages'];
      if (messages is List) return messages.cast<Map<String, dynamic>>();
      if (messages is Map) {
        return messages.values.whereType<List>().expand((items) => items.cast<Map<String, dynamic>>()).toList();
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  static Future<bool> sendChatMessage({
    required String sender,
    required String role,
    required String text,
    String? channel,
    String? locationTag,
  }) async {
    try {
      await _request('POST', '/chat/send', body: {
        'sender': sender,
        'role': role,
        'text': text,
        'channel': channel,
        'locationTag': locationTag,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<Map<String, dynamic>?> reportIncident({
    required String title,
    required String location,
    required String severity,
    required String description,
    required String teamName,
    String reporter = 'Rescue Team Operative',
    double lat = 30.5562,
    double lng = 79.5670,
  }) async {
    try {
      return await _request('POST', '/incidents/report', body: {
        'title': title,
        'location': location,
        'severity': severity,
        'description': description,
        'teamName': teamName,
        'reporter': reporter,
        'coordinates': {'latitude': lat, 'longitude': lng, 'lat': lat, 'lng': lng},
      });
    } catch (_) {
      return null;
    }
  }

  static Future<bool> triggerSos({
    required String teamId,
    required String teamName,
    required String operatorName,
    String location = 'Tactical Sector Pin',
    double lat = 30.5562,
    double lng = 79.5670,
    String? notes,
  }) async {
    try {
      await _request('POST', '/teams/sos', body: {
        'teamId': teamId,
        'teamName': teamName,
        'operatorName': operatorName,
        'location': location,
        'coordinates': {'lat': lat, 'lng': lng, 'latitude': lat, 'longitude': lng},
        'notes': notes ?? 'Immediate tactical distress beacon triggered.',
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> updateIncidentStatus({
    required String incidentId,
    required String status,
    String? teamName,
    String? notes,
  }) async {
    try {
      await _request('POST', '/incidents/update', body: {
        'incidentId': incidentId,
        'status': status,
        'teamName': teamName,
        'notes': notes,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> sendTelemetry({
    required String teamId,
    required double lat,
    required double lng,
    required int battery,
    String status = 'Deployed',
  }) async {
    try {
      await _request('POST', '/teams/telemetry', body: {'teamId': teamId, 'lat': lat, 'lng': lng, 'battery': battery, 'status': status});
      return true;
    } catch (_) {
      return false;
    }
  }
}
