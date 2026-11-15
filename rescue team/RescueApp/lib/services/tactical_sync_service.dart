import 'dart:async';
import 'dart:convert';
import 'dart:io';

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
    return const [
      'http://10.0.2.2:5000',
      'http://localhost:5000',
      'http://127.0.0.1:5000',
    ];
  }

  static String _activeHost = candidateHosts.first;
  static String _authToken = _envRescueToken;
  static String? _teamId;
  static WebSocket? _webSocket;
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

  static void applyAuthHeader(HttpClientRequest request) {
    if (_authToken.isNotEmpty) {
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $_authToken');
    }
    if (_teamId != null && _teamId!.isNotEmpty) {
      request.headers.set('x-team-id', _teamId!);
    }
  }

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

  /// Authenticate rescue operative with backend and receive canonical teamId + token
  static Future<Map<String, dynamic>?> loginRescueTeam({
    required String role,
    required String phone,
    required String name,
    String? teamName,
    String? callsign,
  }) async {
    final resolvedTeamName =
        (teamName != null && teamName.trim().isNotEmpty) ? teamName.trim() : name;
    final payload = jsonEncode({
      'role': 'rescue',
      'identifier': phone,
      'name': name,
      'teamName': resolvedTeamName,
      if (callsign != null && callsign.trim().isNotEmpty) 'callsign': callsign.trim(),
      'specialization': role,
      'teamRole': role,
    });

    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 4);
        final request = await client.postUrl(Uri.parse('$host/api/auth/login'));
        request.headers.contentType = ContentType.json;
        applyAuthHeader(request);
        request.write(payload);
        final response = await request.close();
        final body = await response.transform(utf8.decoder).join();
        if (response.statusCode == 200) {
          _activeHost = host;
          final data = jsonDecode(body) as Map<String, dynamic>;
          if (data['token'] is String && (data['token'] as String).isNotEmpty) {
            setAuthToken(data['token'] as String);
          }
          return data;
        }
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
      final headers = <String, dynamic>{};
      if (_authToken.isNotEmpty) {
        headers[HttpHeaders.authorizationHeader] = 'Bearer $_authToken';
      }
      if (resolvedTeamId.isNotEmpty) {
        headers['x-team-id'] = resolvedTeamId;
      }
      _webSocket = await WebSocket.connect(wsUri, headers: headers)
          .timeout(const Duration(seconds: 4));
      _isConnected = true;

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
        client.connectionTimeout = const Duration(seconds: 3);
        final request = await client.getUrl(Uri.parse('$host/api/incidents'));
        applyAuthHeader(request);
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

  /// Fetch registered rescue teams from Backend
  static Future<List<Map<String, dynamic>>> fetchTeams() async {
    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request = await client.getUrl(Uri.parse('$host/api/teams'));
        applyAuthHeader(request);
        final response = await request.close();
        if (response.statusCode == 200) {
          _activeHost = host;
          final responseBody = await response.transform(utf8.decoder).join();
          final data = jsonDecode(responseBody) as Map<String, dynamic>;
          final list = data['teams'] as List<dynamic>?;
          if (list != null) {
            return list.cast<Map<String, dynamic>>();
          }
        }
      } catch (_) {}
    }
    return [];
  }

  /// Fetch relief shelters from Backend
  static Future<List<Map<String, dynamic>>> fetchShelters() async {
    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request = await client.getUrl(Uri.parse('$host/api/shelters'));
        applyAuthHeader(request);
        final response = await request.close();
        if (response.statusCode == 200) {
          _activeHost = host;
          final responseBody = await response.transform(utf8.decoder).join();
          final data = jsonDecode(responseBody) as Map<String, dynamic>;
          final list = data['shelters'] as List<dynamic>?;
          if (list != null) {
            return list.cast<Map<String, dynamic>>();
          }
        }
      } catch (_) {}
    }
    return [];
  }

  /// Fetch tactical chat messages from Backend
  static Future<List<Map<String, dynamic>>> fetchChatMessages(
      {String channel = 'all'}) async {
    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request = await client
            .getUrl(Uri.parse('$host/api/chat/messages?channel=$channel'));
        applyAuthHeader(request);
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
      } catch (_) {}
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

    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request = await client.postUrl(Uri.parse('$host/api/chat/send'));
        request.headers.contentType = ContentType.json;
        applyAuthHeader(request);
        request.write(payload);
        final response = await request.close();
        if (response.statusCode == 200 || response.statusCode == 201) {
          _activeHost = host;
          return true;
        }
      } catch (_) {}
    }

    if (_webSocket != null && _webSocket?.readyState == WebSocket.open) {
      try {
        _webSocket?.add(jsonEncode({
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

    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request =
            await client.postUrl(Uri.parse('$host/api/incidents/report'));
        request.headers.contentType = ContentType.json;
        applyAuthHeader(request);
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
        applyAuthHeader(request);
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

    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request =
            await client.postUrl(Uri.parse('$host/api/incidents/update'));
        request.headers.contentType = ContentType.json;
        applyAuthHeader(request);
        request.write(payload);
        final response = await request.close();
        if (response.statusCode == 200) {
          _activeHost = host;
          return true;
        }
      } catch (_) {}
    }
    if (_webSocket != null && _webSocket?.readyState == WebSocket.open) {
      try {
        _webSocket?.add(
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

    if (_webSocket != null && _webSocket?.readyState == WebSocket.open) {
      try {
        _webSocket
            ?.add(jsonEncode({'type': 'telemetry', 'data': jsonDecode(payload)}));
        return true;
      } catch (_) {}
    }

    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 2);
        final request =
            await client.postUrl(Uri.parse('$host/api/teams/telemetry'));
        request.headers.contentType = ContentType.json;
        applyAuthHeader(request);
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
