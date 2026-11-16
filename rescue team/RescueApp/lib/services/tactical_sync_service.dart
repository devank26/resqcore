import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'platform_ws.dart';

class TacticalSyncService {
  static const String _envApiBaseUrl =
      String.fromEnvironment('API_BASE_URL', defaultValue: '');
  static const String _envRescueToken =
      String.fromEnvironment('RESCUE_TOKEN', defaultValue: '');

  static List<String> get candidateHosts {
    final trimmed = _envApiBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (trimmed.isNotEmpty) {
      return [trimmed];
    }
    if (kIsWeb) {
      return const [
        'http://localhost:5000',
        'http://127.0.0.1:5000',
      ];
    }
    return const [
      'http://10.0.2.2:5000',
      'http://localhost:5000',
      'http://127.0.0.1:5000',
    ];
  }

  static String _activeHost = candidateHosts.first;
  static String _authToken = _envRescueToken;
  static String? _teamId;
  static PlatformWebSocket? _webSocket;
  static Timer? _reconnectTimer;
  static Timer? _pollFallbackTimer;
  static bool _isConnected = false;

  static String get activeHost => _activeHost;
  static String get authToken => _authToken;
  static String? get activeTeamId => _teamId;
  static bool get isConnected => _isConnected;

  static void setAuthToken(String? token) {
    final cleaned = (token ?? '').trim();
    if (cleaned.isNotEmpty) {
      _authToken = cleaned;
    } else {
      _authToken = _envRescueToken;
    }
  }

  static void setTeamId(String? teamId) {
    final cleaned = (teamId ?? '').trim();
    _teamId = cleaned.isNotEmpty ? cleaned : null;
  }

  static Map<String, String> authHeaders({bool json = false}) {
    final headers = <String, String>{};
    if (json) {
      headers['Content-Type'] = 'application/json';
    }
    if (_authToken.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    if (_teamId != null && _teamId!.isNotEmpty) {
      headers['x-team-id'] = _teamId!;
    }
    return headers;
  }

  static List<String> get _hostsInOrder =>
      <String>{_activeHost, ...candidateHosts}.toList();

  static Future<http.Response?> _get(
    String path, {
    Duration timeout = const Duration(seconds: 3),
  }) async {
    for (final host in _hostsInOrder) {
      try {
        final response = await http
            .get(Uri.parse('$host$path'), headers: authHeaders())
            .timeout(timeout);
        if (response.statusCode == 200) {
          _activeHost = host;
          return response;
        }
      } catch (_) {}
    }
    return null;
  }

  static Future<http.Response?> _post(
    String path,
    String body, {
    Duration timeout = const Duration(seconds: 3),
    List<int> okStatuses = const [200, 201],
  }) async {
    for (final host in _hostsInOrder) {
      try {
        final response = await http
            .post(
              Uri.parse('$host$path'),
              headers: authHeaders(json: true),
              body: body,
            )
            .timeout(timeout);
        if (okStatuses.contains(response.statusCode)) {
          _activeHost = host;
          return response;
        }
      } catch (_) {}
    }
    return null;
  }

  /// Check connectivity and discover the active backend host
  static Future<bool> checkConnection() async {
    for (final host in candidateHosts) {
      try {
        final response = await http
            .get(Uri.parse('$host/api/health'))
            .timeout(const Duration(seconds: 2));
        if (response.statusCode == 200) {
          _activeHost = host;
          _isConnected = true;
          return true;
        }
      } catch (_) {
        // try next candidate
      }
    }
    _isConnected = false;
    return false;
  }

  /// Authenticate rescue operative with backend and receive canonical teamId + token
  static Future<Map<String, dynamic>?> loginRescueTeam({
    required String role,
    required String phone,
    required String name,
    String? teamName,
    String? callsign,
    String? teamId,
  }) async {
    final resolvedTeamName =
        (teamName != null && teamName.trim().isNotEmpty) ? teamName.trim() : name;
    final payload = jsonEncode({
      'role': 'rescue',
      'identifier': phone,
      'name': name,
      'teamName': resolvedTeamName,
      if (teamId != null && teamId.trim().isNotEmpty) 'teamId': teamId.trim(),
      if (callsign != null && callsign.trim().isNotEmpty) 'callsign': callsign.trim(),
      'specialization': role,
      'teamRole': role,
    });

    final response = await _post(
      '/api/auth/login',
      payload,
      timeout: const Duration(seconds: 4),
      okStatuses: const [200],
    );
    if (response != null) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (data['token'] is String && (data['token'] as String).isNotEmpty) {
        setAuthToken(data['token'] as String);
      }
      return data;
    }
    return null;
  }

  /// Verifies the active JWT against `/api/auth/me`.
  /// Returns `true` if valid, `false` if rejected (401), or `null` if backend is offline.
  static Future<bool?> verifySession() async {
    if (_authToken.isEmpty) return false;
    for (final host in _hostsInOrder) {
      try {
        final response = await http
            .get(Uri.parse('$host/api/auth/me'), headers: authHeaders())
            .timeout(const Duration(seconds: 3));
        _activeHost = host;
        if (response.statusCode == 200) return true;
        if (response.statusCode == 401) return false;
      } catch (_) {}
    }
    return null;
  }

  /// Connect to the Real-Time WebSocket stream
  static Future<void> connectRealtime({
    required String teamId,
    required String role,
    required String name,
    required void Function(Map<String, dynamic> event) onEvent,
  }) async {
    disconnectRealtime();

    final ok = await checkConnection();
    if (!ok) {
      _startPollFallback(onEvent);
      return;
    }

    final resolvedTeamId = teamId.trim().isNotEmpty ? teamId.trim() : (_teamId ?? '');
    if (resolvedTeamId.isNotEmpty) {
      _teamId = resolvedTeamId;
    }
    final baseWs = _activeHost
        .replaceFirst('http://', 'ws://')
        .replaceFirst('https://', 'wss://');
    final queryParams = <String>[
      if (_authToken.isNotEmpty) 'token=${Uri.encodeComponent(_authToken)}',
      if (resolvedTeamId.isNotEmpty) 'teamId=${Uri.encodeComponent(resolvedTeamId)}',
    ];
    final wsUri = queryParams.isNotEmpty ? '$baseWs/ws?${queryParams.join('&')}' : '$baseWs/ws';

    try {
      final headers = <String, String>{};
      if (_authToken.isNotEmpty) {
        headers['Authorization'] = 'Bearer $_authToken';
      }
      if (resolvedTeamId.isNotEmpty) {
        headers['x-team-id'] = resolvedTeamId;
      }
      _webSocket = await connectPlatformWebSocket(
        wsUri,
        headers: headers,
        timeout: const Duration(seconds: 4),
      );
      _isConnected = true;

      _webSocket?.send(jsonEncode({
        'type': 'register',
        'role': 'rescue_team',
        'name': name,
        'teamId': teamId,
        'timestamp': DateTime.now().toIso8601String(),
      }));

      _webSocket?.stream.listen(
        (data) {
          try {
            final parsed = jsonDecode(data.toString()) as Map<String, dynamic>;
            onEvent(parsed);
          } catch (_) {}
        },
        onError: (_) {
          _scheduleReconnect(
              teamId: teamId, role: role, name: name, onEvent: onEvent);
        },
        onDone: () {
          _scheduleReconnect(
              teamId: teamId, role: role, name: name, onEvent: onEvent);
        },
      );
    } catch (_) {
      _scheduleReconnect(
          teamId: teamId, role: role, name: name, onEvent: onEvent);
    }
  }

  static void _scheduleReconnect({
    required String teamId,
    required String role,
    required String name,
    required void Function(Map<String, dynamic> event) onEvent,
  }) {
    _isConnected = false;
    _reconnectTimer?.cancel();
    _startPollFallback(onEvent);

    _reconnectTimer = Timer(const Duration(seconds: 5), () {
      connectRealtime(teamId: teamId, role: role, name: name, onEvent: onEvent);
    });
  }

  static void _startPollFallback(
      void Function(Map<String, dynamic> event) onEvent) {
    if (_pollFallbackTimer != null && _pollFallbackTimer!.isActive) return;

    _pollFallbackTimer = Timer.periodic(const Duration(seconds: 4), (_) async {
      try {
        final incidents = await fetchIncidents();
        onEvent({
          'event': 'incidents_sync',
          'data': {'incidents': incidents}
        });
      } catch (_) {}
      try {
        final teams = await fetchTeams();
        onEvent({
          'event': 'teams_sync',
          'data': {'teams': teams}
        });
      } catch (_) {}
      try {
        final messages = await fetchChatMessages();
        onEvent({
          'event': 'chat_sync',
          'data': {'messages': messages}
        });
      } catch (_) {}
      try {
        final volunteers = await fetchVolunteers();
        if (volunteers != null) {
          onEvent({
            'event': 'volunteers_sync',
            'data': {'volunteers': volunteers}
          });
        }
      } catch (_) {}
    });
  }

  static void disconnectRealtime() {
    _reconnectTimer?.cancel();
    _pollFallbackTimer?.cancel();
    try {
      _webSocket?.close();
    } catch (_) {}
    _webSocket = null;
    _isConnected = false;
  }

  /// Fetch active incidents from Backend
  static Future<List<Map<String, dynamic>>> fetchIncidents() async {
    final response = await _get('/api/incidents');
    if (response != null) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final list = data['incidents'] as List<dynamic>?;
      if (list != null) {
        return list.cast<Map<String, dynamic>>();
      }
    }
    return [];
  }

  /// Fetch registered rescue teams from Backend
  static Future<List<Map<String, dynamic>>> fetchTeams() async {
    final response = await _get('/api/teams');
    if (response != null) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final list = data['teams'] as List<dynamic>?;
      if (list != null) {
        return list.cast<Map<String, dynamic>>();
      }
    }
    return [];
  }

  /// Create a new rescue team in the backend database
  static Future<Map<String, dynamic>> createTeam({
    required String name,
    String? callsign,
    String specialization = 'SAR',
    int responders = 4,
    String? sector,
    String? commanderName,
    String? commanderPhone,
    String? frequency,
    String status = 'Available',
    double? lat,
    double? lng,
  }) async {
    final payloadMap = <String, dynamic>{
      'name': name.trim(),
      'specialization': specialization.trim().isNotEmpty ? specialization.trim() : 'SAR',
      'responders': responders,
      'status': status,
      if (callsign != null && callsign.trim().isNotEmpty) 'callsign': callsign.trim(),
      if (sector != null && sector.trim().isNotEmpty) 'sector': sector.trim(),
      if (commanderName != null && commanderName.trim().isNotEmpty)
        'commanderName': commanderName.trim(),
      if (commanderPhone != null && commanderPhone.trim().isNotEmpty)
        'commanderPhone': commanderPhone.trim(),
      if (frequency != null && frequency.trim().isNotEmpty)
        'frequency': frequency.trim(),
      if (lat != null && lng != null) 'coordinates': {'lat': lat, 'lng': lng},
    };
    final body = jsonEncode(payloadMap);

    for (final host in _hostsInOrder) {
      try {
        final response = await http
            .post(
              Uri.parse('$host/api/teams'),
              headers: authHeaders(json: true),
              body: body,
            )
            .timeout(const Duration(seconds: 4));
        _activeHost = host;
        final decoded = response.body.trim().isNotEmpty
            ? jsonDecode(response.body) as Map<String, dynamic>
            : <String, dynamic>{};
        if (response.statusCode == 200 || response.statusCode == 201) {
          return {'success': true, 'team': decoded['team']};
        }
        return {
          'success': false,
          'status': response.statusCode,
          'error': (decoded['error'] ?? 'Failed to create team (${response.statusCode})').toString(),
          'networkError': false,
        };
      } catch (_) {}
    }
    return {
      'success': false,
      'error': 'Backend unreachable',
      'networkError': true,
    };
  }

  /// Fetch relief shelters from Backend
  static Future<List<Map<String, dynamic>>> fetchShelters() async {
    final response = await _get('/api/shelters');
    if (response != null) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final list = data['shelters'] as List<dynamic>?;
      if (list != null) {
        return list.cast<Map<String, dynamic>>();
      }
    }
    return [];
  }

  /// Fetch registered volunteers from Backend
  static Future<List<Map<String, dynamic>>?> fetchVolunteers() async {
    final response = await _get('/api/volunteers');
    if (response != null) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return (data['volunteers'] as List<dynamic>? ?? [])
          .map((e) => e as Map<String, dynamic>)
          .toList();
    }
    return null;
  }

  static Future<Map<String, dynamic>> _postWithResult(
    String path,
    Map<String, dynamic> payloadMap,
    String fallbackError,
  ) async {
    final body = jsonEncode(payloadMap);
    for (final host in _hostsInOrder) {
      try {
        final response = await http
            .post(
              Uri.parse('$host$path'),
              headers: authHeaders(json: true),
              body: body,
            )
            .timeout(const Duration(seconds: 4));
        _activeHost = host;
        final decoded = response.body.trim().isNotEmpty
            ? jsonDecode(response.body) as Map<String, dynamic>
            : <String, dynamic>{};
        if (response.statusCode == 200 || response.statusCode == 201) {
          return {'success': true, ...decoded};
        }
        return {
          'success': false,
          'status': response.statusCode,
          'error': (decoded['error'] ?? '$fallbackError (${response.statusCode})')
              .toString(),
          'networkError': false,
        };
      } catch (_) {}
    }
    return {
      'success': false,
      'error': 'Backend unreachable',
      'networkError': true,
    };
  }

  /// Register a volunteer with Backend
  static Future<Map<String, dynamic>?> registerVolunteer({
    required String name,
    required String phone,
    required List<String> skills,
    String status = 'Available',
  }) async {
    final payload = jsonEncode({
      'name': name,
      'phone': phone,
      'skills': skills,
      'status': status,
    });
    final response = await _post(
      '/api/volunteers/register',
      payload,
      okStatuses: const [200, 201],
    );
    if (response != null) {
      try {
        return jsonDecode(response.body) as Map<String, dynamic>;
      } catch (_) {
        return {'success': true};
      }
    }
    return null;
  }

  /// Assign an active/available volunteer to the team's active incident mission
  static Future<Map<String, dynamic>> assignVolunteer({
    required String volunteerId,
    required String incidentId,
    String? teamId,
    String? teamName,
  }) {
    final payload = <String, dynamic>{
      'incidentId': incidentId,
      if (teamId != null && teamId.trim().isNotEmpty) 'teamId': teamId.trim(),
      if (teamName != null && teamName.trim().isNotEmpty)
        'teamName': teamName.trim(),
    };
    return _postWithResult(
      '/api/volunteers/${Uri.encodeComponent(volunteerId)}/assign',
      payload,
      'Failed to assign volunteer',
    );
  }

  /// Release a volunteer back to Available status
  static Future<Map<String, dynamic>> unassignVolunteer({
    required String volunteerId,
    String? teamId,
    String? teamName,
  }) {
    final payload = <String, dynamic>{
      if (teamId != null && teamId.trim().isNotEmpty) 'teamId': teamId.trim(),
      if (teamName != null && teamName.trim().isNotEmpty)
        'teamName': teamName.trim(),
    };
    return _postWithResult(
      '/api/volunteers/${Uri.encodeComponent(volunteerId)}/unassign',
      payload,
      'Failed to release volunteer',
    );
  }

  /// Fetch tactical chat messages from Backend
  static Future<List<Map<String, dynamic>>> fetchChatMessages(
      {String channel = 'all'}) async {
    final response = await _get('/api/chat/messages?channel=$channel');
    if (response != null) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final messagesObj = data['messages'];

      if (messagesObj is List) {
        return messagesObj.cast<Map<String, dynamic>>();
      } else if (messagesObj is Map) {
        final List<Map<String, dynamic>> flat = [];
        for (final entry in messagesObj.entries) {
          final ch = entry.key.toString();
          final list = entry.value;
          if (list is List) {
            for (final raw in list) {
              if (raw is Map<String, dynamic>) {
                final item = Map<String, dynamic>.from(raw);
                item['channel'] ??= ch;
                flat.add(item);
              }
            }
          }
        }
        flat.sort((a, b) => (a['createdAt'] ?? a['timestamp'] ?? '')
            .toString()
            .compareTo((b['createdAt'] ?? b['timestamp'] ?? '').toString()));
        return flat;
      }
    }
    return [];
  }

  /// Send tactical chat message to Command Center & other teams
  static Future<bool> sendChatMessage({
    String? id,
    required String sender,
    required String role,
    required String text,
    String? channel,
    String? locationTag,
  }) async {
    final resolvedChannel =
        (channel != null && channel.trim().isNotEmpty) ? channel.trim() : 'command-net';
    final trimmedInitials = sender
        .trim()
        .split(RegExp(r'\s+'))
        .where((s) => s.isNotEmpty)
        .take(2)
        .map((s) => s[0].toUpperCase())
        .join();
    final mapPayload = <String, dynamic>{
      if (id != null && id.isNotEmpty) 'id': id,
      'channel': resolvedChannel,
      'sender': sender,
      'role': role,
      'text': text,
      if (locationTag != null && locationTag.isNotEmpty) 'locationTag': locationTag,
      'initials': trimmedInitials.isNotEmpty ? trimmedInitials : 'RT',
    };
    final payload = jsonEncode(mapPayload);

    final response = await _post('/api/chat/send', payload);
    if (response != null) {
      return true;
    }

    if (_webSocket != null && _webSocket!.isOpen) {
      try {
        _webSocket?.send(jsonEncode({
          'type': 'chat_message',
          'data': mapPayload,
        }));
        return true;
      } catch (_) {}
    }
    return false;
  }

  /// Report a new incident from field reconnaissance
  static Future<Map<String, dynamic>?> reportIncident({
    required String title,
    required String location,
    required String severity,
    required String description,
    required String teamName,
    String reporter = 'Rescue Team Operative',
    double? lat,
    double? lng,
  }) async {
    final bodyMap = <String, dynamic>{
      'title': title,
      'location': location,
      'severity': severity,
      'description': description,
      'teamName': teamName,
      if (_teamId != null && _teamId!.isNotEmpty) 'teamId': _teamId,
      'reporter': reporter,
    };
    if (lat != null && lng != null) {
      bodyMap['coordinates'] = {
        'latitude': lat,
        'longitude': lng,
        'lat': lat,
        'lng': lng,
      };
    }
    final payload = jsonEncode(bodyMap);

    final response = await _post('/api/incidents/report', payload);
    if (response != null) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    return null;
  }

  /// Trigger emergency SOS distress beacon from field unit
  static Future<bool> triggerSos({
    required String teamId,
    required String teamName,
    required String operatorName,
    required String location,
    double? lat,
    double? lng,
    String? notes,
  }) async {
    final bodyMap = <String, dynamic>{
      'teamId': teamId,
      'teamName': teamName,
      'operatorName': operatorName,
      'location': location,
      'notes': notes ?? 'Immediate tactical distress beacon triggered.',
    };
    if (lat != null && lng != null) {
      bodyMap['coordinates'] = {
        'lat': lat,
        'lng': lng,
        'latitude': lat,
        'longitude': lng,
      };
    }
    final payload = jsonEncode(bodyMap);

    if (_webSocket != null && _webSocket!.isOpen) {
      try {
        _webSocket?.send(jsonEncode({'type': 'sos', 'data': jsonDecode(payload)}));
      } catch (_) {}
    }

    final response = await _post('/api/teams/sos', payload);
    return response != null;
  }

  /// Update incident status (e.g. 'Responding', 'On site', 'Resolved')
  static Future<bool> updateIncidentStatus({
    required String incidentId,
    required String status,
    String? teamName,
    String? notes,
  }) async {
    final payload = jsonEncode({
      'incidentId': incidentId,
      'status': status,
      'teamName': teamName,
      'notes': notes,
    });

    final response = await _post(
      '/api/incidents/update',
      payload,
      okStatuses: const [200],
    );
    if (response != null) {
      return true;
    }
    if (_webSocket != null && _webSocket!.isOpen) {
      try {
        _webSocket?.send(
            jsonEncode({'type': 'update_status', 'data': jsonDecode(payload)}));
        return true;
      } catch (_) {}
    }
    return false;
  }

  /// Send team GPS and battery telemetry to backend
  static Future<bool> sendTelemetry({
    required String teamId,
    required double lat,
    required double lng,
    required int battery,
    String status = 'Deployed',
  }) async {
    final payload = jsonEncode({
      'teamId': teamId,
      'lat': lat,
      'lng': lng,
      'battery': battery,
      'status': status,
    });

    if (_webSocket != null && _webSocket!.isOpen) {
      try {
        _webSocket
            ?.send(jsonEncode({'type': 'telemetry', 'data': jsonDecode(payload)}));
        return true;
      } catch (_) {}
    }

    final response = await _post(
      '/api/teams/telemetry',
      payload,
      timeout: const Duration(seconds: 2),
      okStatuses: const [200],
    );
    return response != null;
  }
}
