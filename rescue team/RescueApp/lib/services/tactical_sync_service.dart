import 'dart:async';
import 'dart:convert';
import 'dart:io';

class TacticalSyncService {
  static const List<String> candidateHosts = [
    'http://10.0.2.2:5000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ];

  static String _activeHost = candidateHosts.first;
  static WebSocket? _webSocket;
  static Timer? _reconnectTimer;
  static Timer? _pollFallbackTimer;
  static bool _isConnected = false;

  static String get activeHost => _activeHost;
  static bool get isConnected => _isConnected;

  /// Check connectivity and discover the active backend host
  static Future<bool> checkConnection() async {
    for (final host in candidateHosts) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 2);
        final request = await client.getUrl(Uri.parse('$host/api/health'));
        final response = await request.close();
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
      // Start polling fallback if backend is momentarily unreachable
      _startPollFallback(onEvent);
      return;
    }

    final wsUri = _activeHost.replaceFirst('http://', 'ws://').replaceFirst('https://', 'wss://') + '/ws';

    try {
      _webSocket = await WebSocket.connect(wsUri).timeout(const Duration(seconds: 4));
      _isConnected = true;
      print('[RescueApp Sync] Connected to Real-Time WebSocket: $wsUri');

      // Send registration payload
      _webSocket?.add(jsonEncode({
        'type': 'register',
        'role': 'rescue_team',
        'name': name,
        'teamId': teamId,
        'timestamp': DateTime.now().toIso8601String(),
      }));

      _webSocket?.listen(
        (data) {
          try {
            final parsed = jsonDecode(data.toString()) as Map<String, dynamic>;
            onEvent(parsed);
          } catch (e) {
            print('[RescueApp Sync] WS Parse error: $e');
          }
        },
        onError: (err) {
          print('[RescueApp Sync] WS Error: $err');
          _scheduleReconnect(teamId: teamId, role: role, name: name, onEvent: onEvent);
        },
        onDone: () {
          print('[RescueApp Sync] WS Connection closed');
          _scheduleReconnect(teamId: teamId, role: role, name: name, onEvent: onEvent);
        },
      );
    } catch (e) {
      print('[RescueApp Sync] WS Connect error: $e');
      _scheduleReconnect(teamId: teamId, role: role, name: name, onEvent: onEvent);
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

  static void _startPollFallback(void Function(Map<String, dynamic> event) onEvent) {
    if (_pollFallbackTimer != null && _pollFallbackTimer!.isActive) return;

    _pollFallbackTimer = Timer.periodic(const Duration(seconds: 4), (_) async {
      try {
        final incidents = await fetchIncidents();
        if (incidents.isNotEmpty) {
          onEvent({'event': 'incidents_sync', 'data': {'incidents': incidents}});
        }
      } catch (_) {}
      try {
        final messages = await fetchChatMessages();
        if (messages.isNotEmpty) {
          onEvent({'event': 'chat_sync', 'data': {'messages': messages}});
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
    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 2);
        final request = await client.getUrl(Uri.parse('$host/api/incidents'));
        final response = await request.close();
        if (response.statusCode == 200) {
          _activeHost = host;
          final responseBody = await response.transform(utf8.decoder).join();
          final data = jsonDecode(responseBody) as Map<String, dynamic>;
          final list = data['incidents'] as List<dynamic>?;
          if (list != null) {
            return list.cast<Map<String, dynamic>>();
          }
        }
      } catch (_) {}
    }
    return [];
  }

  /// Fetch tactical chat messages from Backend
  static Future<List<Map<String, dynamic>>> fetchChatMessages({String channel = 'all'}) async {
    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 2);
        final request = await client.getUrl(Uri.parse('$host/api/chat/messages?channel=$channel'));
        final response = await request.close();
        if (response.statusCode == 200) {
          _activeHost = host;
          final responseBody = await response.transform(utf8.decoder).join();
          final data = jsonDecode(responseBody) as Map<String, dynamic>;
          final messagesObj = data['messages'];

          if (messagesObj is List) {
            return messagesObj.cast<Map<String, dynamic>>();
          } else if (messagesObj is Map) {
            final List<Map<String, dynamic>> flat = [];
            for (final list in messagesObj.values) {
              if (list is List) {
                flat.addAll(list.cast<Map<String, dynamic>>());
              }
            }
            return flat;
          }
        }
      } catch (_) {}
    }
    return [];
  }

  /// Send tactical chat message to Command Center & other teams
  static Future<bool> sendChatMessage({
    required String sender,
    required String role,
    required String text,
    String? channel,
    String? locationTag,
  }) async {
    final payload = jsonEncode({
      'channel': channel ?? 'ernakulam-command',
      'sender': sender,
      'role': role,
      'text': text,
      'locationTag': locationTag,
      'initials': sender.isNotEmpty ? sender[0].toUpperCase() : 'RT',
    });

    // Try WebSocket first
    if (_webSocket != null && _webSocket?.readyState == WebSocket.open) {
      try {
        _webSocket?.add(jsonEncode({
          'type': 'chat_message',
          'data': jsonDecode(payload),
        }));
        return true;
      } catch (_) {}
    }

    // Fallback to HTTP
    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request = await client.postUrl(Uri.parse('$host/api/chat/send'));
        request.headers.contentType = ContentType.json;
        request.write(payload);
        final response = await request.close();
        if (response.statusCode == 200 || response.statusCode == 201) {
          _activeHost = host;
          return true;
        }
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
    double lat = 30.5562,
    double lng = 79.5670,
  }) async {
    final payload = jsonEncode({
      'title': title,
      'location': location,
      'severity': severity,
      'description': description,
      'teamName': teamName,
      'reporter': reporter,
      'coordinates': {'latitude': lat, 'longitude': lng, 'lat': lat, 'lng': lng},
    });

    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request = await client.postUrl(Uri.parse('$host/api/incidents/report'));
        request.headers.contentType = ContentType.json;
        request.write(payload);
        final response = await request.close();
        if (response.statusCode == 200 || response.statusCode == 201) {
          _activeHost = host;
          final responseBody = await response.transform(utf8.decoder).join();
          return jsonDecode(responseBody) as Map<String, dynamic>;
        }
      } catch (_) {}
    }
    return null;
  }

  /// Trigger emergency SOS distress beacon from field unit
  static Future<bool> triggerSos({
    required String teamId,
    required String teamName,
    required String operatorName,
    String location = 'Tactical Sector Pin',
    double lat = 30.5562,
    double lng = 79.5670,
    String? notes,
  }) async {
    final payload = jsonEncode({
      'teamId': teamId,
      'teamName': teamName,
      'operatorName': operatorName,
      'location': location,
      'coordinates': {'lat': lat, 'lng': lng, 'latitude': lat, 'longitude': lng},
      'notes': notes ?? 'Immediate tactical distress beacon triggered.',
    });

    // Try WS first
    if (_webSocket != null && _webSocket?.readyState == WebSocket.open) {
      try {
        _webSocket?.add(jsonEncode({'type': 'sos', 'data': jsonDecode(payload)}));
      } catch (_) {}
    }

    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request = await client.postUrl(Uri.parse('$host/api/teams/sos'));
        request.headers.contentType = ContentType.json;
        request.write(payload);
        final response = await request.close();
        if (response.statusCode == 200 || response.statusCode == 201) {
          _activeHost = host;
          return true;
        }
      } catch (_) {}
    }
    return false;
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

    // Try WS first
    if (_webSocket != null && _webSocket?.readyState == WebSocket.open) {
      try {
        _webSocket?.add(jsonEncode({'type': 'update_status', 'data': jsonDecode(payload)}));
      } catch (_) {}
    }

    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request = await client.postUrl(Uri.parse('$host/api/incidents/update'));
        request.headers.contentType = ContentType.json;
        request.write(payload);
        final response = await request.close();
        if (response.statusCode == 200) {
          _activeHost = host;
          return true;
        }
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

    if (_webSocket != null && _webSocket?.readyState == WebSocket.open) {
      try {
        _webSocket?.add(jsonEncode({'type': 'telemetry', 'data': jsonDecode(payload)}));
        return true;
      } catch (_) {}
    }

    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 2);
        final request = await client.postUrl(Uri.parse('$host/api/teams/telemetry'));
        request.headers.contentType = ContentType.json;
        request.write(payload);
        final response = await request.close();
        if (response.statusCode == 200) {
          _activeHost = host;
          return true;
        }
      } catch (_) {}
    }
    return false;
  }
}
