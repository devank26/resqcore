import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

class CommandCenterService {
  static const String _configuredBaseUrl = String.fromEnvironment('API_BASE_URL');
  static final List<String> candidateHosts = [
    if (_configuredBaseUrl.isNotEmpty) _configuredBaseUrl,
    'http://10.0.2.2:5000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ].toSet().toList();

  static String _activeHost = candidateHosts.first;
  static final Map<String, Timer> _statusPollers = {};
  static final Map<String, SupabaseClient> _trackingClients = {};
  static final Map<String, RealtimeChannel> _trackingChannels = {};
  static RealtimeChannel? _publicAlertsChannel;
  static void Function(Map<String, dynamic>)? _onPublicAlert;

  static String get activeHost => _activeHost;

  static Map<String, String> _headers({String? trackingToken}) {
    final headers = <String, String>{};
    try {
      final token = Supabase.instance.client.auth.currentSession?.accessToken;
      if (token != null && token.isNotEmpty) headers['Authorization'] = 'Bearer $token';
    } catch (_) {}
    if (trackingToken != null) headers['X-Incident-Tracking-Token'] = trackingToken;
    return headers;
  }

  static Future<Map<String, dynamic>?> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    String? trackingToken,
  }) async {
    for (final host in [_activeHost, ...candidateHosts].toSet()) {
      try {
        final request = http.Request(method, Uri.parse('$host/api$path'))
          ..headers.addAll(_headers(trackingToken: trackingToken));
        if (body != null) {
          request.headers['Content-Type'] = 'application/json';
          request.body = jsonEncode(body);
        }
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
          debugPrint('[ResQCore] API denied request ($method $path): ${response.statusCode}');
          return null;
        }
      } catch (_) {}
    }
    return null;
  }

  static Future<bool> checkConnection() async => await _request('GET', '/health') != null;

  static Future<Map<String, dynamic>?> sendEmergencyReport({
    required String id,
    required String title,
    required String type,
    required String location,
    required String fullAddress,
    required String description,
    required String contactNumber,
    required String citizenName,
    double? latitude,
    double? longitude,
    String severity = 'High',
  }) {
    final lat = latitude ?? 30.3165;
    final lng = longitude ?? 78.0322;
    return _request('POST', '/citizen/sos', body: {
      'id': id,
      'title': title,
      'type': type,
      'location': location,
      'fullAddress': fullAddress,
      'description': description,
      'contactNumber': contactNumber,
      'citizenName': citizenName,
      'coordinates': {'lat': lat, 'lng': lng, 'latitude': lat, 'longitude': lng},
      'severity': severity,
    });
  }

  static Future<Map<String, dynamic>?> getRequestStatus(String requestId, {String? trackingToken}) async {
    if (trackingToken == null || trackingToken.isEmpty) return null;
    return _request('GET', '/citizen/status/${Uri.encodeComponent(requestId)}', trackingToken: trackingToken);
  }

  static Future<List<Map<String, dynamic>>> fetchAlerts() async {
    final data = await _request('GET', '/citizen/alerts');
    final rows = data?['alerts'];
    return rows is List ? rows.cast<Map<String, dynamic>>() : [];
  }

  static Future<List<Map<String, dynamic>>> fetchMyRequests(String phoneNumber) async {
    final data = await _request('GET', '/citizen/my-requests');
    final rows = data?['requests'];
    return rows is List ? rows.cast<Map<String, dynamic>>() : [];
  }

  static Future<void> startTrackingRequest(
    String requestId, {
    required String trackingToken,
    required void Function(Map<String, dynamic> update) onUpdate,
  }) async {
    stopTrackingRequest(requestId);
    try {
      final tokenResponse = await _request('POST', '/citizen/realtime-token', body: {
        'incidentId': requestId,
        'trackingToken': trackingToken,
      });
      final realtimeToken = tokenResponse?['token']?.toString();
      final supabaseUrl = const String.fromEnvironment('SUPABASE_URL');
      final publishableKey = const String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
      if (realtimeToken == null || supabaseUrl.isEmpty || publishableKey.isEmpty) {
        _startStatusFallback(requestId, trackingToken, onUpdate);
        return;
      }

      final client = SupabaseClient(supabaseUrl, publishableKey);
      await client.realtime.setAuth(realtimeToken);
      final channel = client.channel('citizen:$requestId');
      _trackingClients[requestId] = client;
      _trackingChannels[requestId] = channel;

      channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'incident_tracking_updates',
        callback: (payload) {
          if (payload.eventType == PostgresChangeEvent.delete) return;
          onUpdate(_normalizeTrackingUpdate(payload.newRecord));
        },
      );
      await channel.subscribe((status, error) {
        if (status == RealtimeSubscribeStatus.channelError || status == RealtimeSubscribeStatus.timedOut) {
          _startStatusFallback(requestId, trackingToken, onUpdate);
        }
      });
    } catch (_) {
      _startStatusFallback(requestId, trackingToken, onUpdate);
    }
  }

  static Map<String, dynamic> _normalizeTrackingUpdate(Map<String, dynamic> row) => {
    ...row,
    'id': row['incident_id'],
    'assignedTeam': row['assigned_team'],
    'responseSummary': row['response_summary'],
    'responseDetail': row['response_detail'],
    'substatus': row['response_detail'],
    'updatedAt': row['updated_at'],
  };

  static void _startStatusFallback(
    String requestId,
    String trackingToken,
    void Function(Map<String, dynamic> update) onUpdate,
  ) {
    if (_statusPollers[requestId]?.isActive == true) return;
    _statusPollers[requestId] = Timer.periodic(const Duration(seconds: 12), (_) async {
      final response = await getRequestStatus(requestId, trackingToken: trackingToken);
      final update = response?['request'] ?? response?['incident'];
      if (update is Map<String, dynamic>) onUpdate(update);
      final status = update is Map ? (update['status'] ?? '').toString().toLowerCase() : '';
      if (status == 'resolved' || status == 'completed') stopTrackingRequest(requestId);
    });
  }

  static void watchPublicAlerts(void Function(Map<String, dynamic> alert) onAlert) {
    stopWatchingPublicAlerts();
    try {
      final supabase = Supabase.instance.client;
      _onPublicAlert = onAlert;
      _publicAlertsChannel = supabase.channel('citizen:public-alerts');
      _publicAlertsChannel!
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'public_alerts',
            callback: (payload) => _onPublicAlert?.call(payload.newRecord),
          )
          .subscribe();
    } catch (_) {}
  }

  static void stopWatchingPublicAlerts() {
    final channel = _publicAlertsChannel;
    _publicAlertsChannel = null;
    _onPublicAlert = null;
    if (channel != null) {
      try { Supabase.instance.client.removeChannel(channel); } catch (_) {}
    }
  }

  static void stopTrackingRequest(String requestId) {
    _statusPollers.remove(requestId)?.cancel();
    final channel = _trackingChannels.remove(requestId);
    final client = _trackingClients.remove(requestId);
    if (channel != null && client != null) {
      try { client.removeChannel(channel); } catch (_) {}
      client.dispose();
    }
  }

  static void stopAllTracking() {
    for (final requestId in _statusPollers.keys.toList()) {
      stopTrackingRequest(requestId);
    }
  }
}
