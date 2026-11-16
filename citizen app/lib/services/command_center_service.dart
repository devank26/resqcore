import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'account_storage_service.dart';
import 'platform_ws.dart';

class CommandCenterService {
  static const String _envApiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const String _envCitizenToken = String.fromEnvironment('CITIZEN_TOKEN');

  static String get baseUrl {
    final trimmed = _envApiBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (trimmed.isNotEmpty) return trimmed;
    if (kIsWeb) return 'http://localhost:5000';
    if (kDebugMode) return 'http://10.0.2.2:5000';
    return '';
  }

  static String _authToken = _envCitizenToken;
  static final Map<String, Timer> _activePollers = {};
  static PlatformWebSocket? _liveSocket;
  static Timer? _reconnectTimer;
  static Timer? _pollFallbackTimer;
  static bool _liveActive = false;

  static String get activeHost => baseUrl;
  static String get authToken => _authToken;

  static Future<void> restoreSession() async {
    final saved = await AccountStorageService.loadToken();
    if (saved.isNotEmpty) {
      _authToken = saved;
    }
  }

  static void setAuthToken(String token) {
    final cleaned = token.trim();
    _authToken = cleaned.isNotEmpty ? cleaned : _envCitizenToken;
  }

  /// Returns true when no token is held or an older generic 'usr-citizen' fallback JWT is stored.
  static bool authTokenNeedsUpgrade() {
    if (_authToken.trim().isEmpty) return true;
    try {
      final parts = _authToken.split('.');
      if (parts.length != 3) return false;
      final normalized = base64Url.normalize(parts[1]);
      final decoded = jsonDecode(utf8.decode(base64Url.decode(normalized)));
      if (decoded is Map<String, dynamic>) {
        final sub = (decoded['sub'] ?? decoded['id'] ?? '').toString();
        if (sub == 'usr-citizen') return true;
      }
    } catch (_) {}
    return false;
  }

  static Map<String, String> _authHeaders({bool json = false}) {
    final headers = <String, String>{};
    if (json) {
      headers['Content-Type'] = 'application/json';
    }
    if (_authToken.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    return headers;
  }

  static Map<String, dynamic> _tryDecodeMap(String raw) {
    if (raw.trim().isEmpty) return <String, dynamic>{};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
    } catch (_) {}
    return <String, dynamic>{};
  }

  /// Check connectivity with the ResQCore Command Center Backend
  static Future<bool> checkConnection() async {
    final host = baseUrl;
    if (host.isEmpty) return false;
    try {
      final response = await http
          .get(Uri.parse('$host/api/health'))
          .timeout(const Duration(seconds: 3));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Authenticate or register a citizen account via backend /api/auth endpoints
  static Future<Map<String, dynamic>> authenticateCitizen({
    required String identifier,
    String? password,
    String? name,
    bool isRegister = false,
  }) async {
    final host = baseUrl;
    if (host.isEmpty) {
      return {'success': false, 'error': 'API_BASE_URL is not configured'};
    }

    final payloadMap = <String, dynamic>{
      'role': 'citizen',
      'identifier': identifier.trim(),
    };
    if (name != null && name.trim().isNotEmpty) {
      payloadMap['name'] = name.trim();
    }
    if (password != null && password.trim().isNotEmpty) {
      payloadMap['password'] = password.trim();
    }
    if (identifier.contains('@')) {
      payloadMap['email'] = identifier.trim();
    } else if (identifier.trim().isNotEmpty) {
      payloadMap['phone'] = identifier.trim();
    }

    final endpoints = isRegister
        ? ['/api/auth/register', '/api/auth/login']
        : ['/api/auth/login'];

    for (final ep in endpoints) {
      try {
        final response = await http
            .post(
              Uri.parse('$host$ep'),
              headers: _authHeaders(json: true),
              body: jsonEncode(payloadMap),
            )
            .timeout(const Duration(seconds: 5));
        final data = _tryDecodeMap(response.body);

        if (response.statusCode == 200 || response.statusCode == 201) {
          final tok = (data['token'] ?? '').toString().trim();
          if (tok.isNotEmpty) {
            setAuthToken(tok);
            await AccountStorageService.saveToken(tok);
          }
          return {'success': true, ...data};
        }

        // If /api/auth/register isn't mounted (404), fall back to /api/auth/login
        if (response.statusCode == 404 && ep == '/api/auth/register') {
          continue;
        }

        return {
          'success': false,
          'error': (data['error'] ?? 'Authentication failed (${response.statusCode})')
              .toString(),
        };
      } catch (e) {
        return {'success': false, 'error': 'Unable to reach server: $e'};
      }
    }

    return {'success': false, 'error': 'Authentication failed'};
  }

  /// Send Citizen Emergency SOS Report to Command Center in Real Time.
  /// Blocks SOS when GPS coordinates or baseUrl are missing.
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
    List<Map<String, dynamic>>? resources,
  }) async {
    if (latitude == null || longitude == null) {
      return {'success': false, 'error': 'GPS coordinates are required to send SOS'};
    }
    final host = baseUrl;
    if (host.isEmpty) {
      return {'success': false, 'error': 'API_BASE_URL is not configured'};
    }

    try {
      final bodyMap = <String, dynamic>{
        'id': id,
        'title': title,
        'type': type,
        'location': location,
        'fullAddress': fullAddress,
        'description': description,
        'contactNumber': contactNumber,
        'citizenName': citizenName,
        'coordinates': {
          'lat': latitude,
          'lng': longitude,
          'latitude': latitude,
          'longitude': longitude,
        },
        'severity': severity,
      };
      if (resources != null && resources.isNotEmpty) {
        bodyMap['resources'] = resources;
      }

      final response = await http
          .post(
            Uri.parse('$host/api/citizen/sos'),
            headers: _authHeaders(json: true),
            body: jsonEncode(bodyMap),
          )
          .timeout(const Duration(seconds: 5));
      final decoded = _tryDecodeMap(response.body);
      if (response.statusCode == 200 || response.statusCode == 201) {
        return decoded;
      }
      return {
        'success': false,
        'error': (decoded['error'] ?? 'Failed with HTTP ${response.statusCode}').toString(),
      };
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Fetch available dispatchable resource catalog from Command Center backend
  static Future<List<Map<String, dynamic>>> fetchResources() async {
    final host = baseUrl;
    if (host.isEmpty) return [];
    try {
      final response = await http
          .get(Uri.parse('$host/api/resources'), headers: _authHeaders())
          .timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        final data = _tryDecodeMap(response.body);
        final list = data['resources'] as List<dynamic>?;
        if (list != null) {
          return list
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
      }
    } catch (_) {}
    return [];
  }

  /// Fetch real-time dispatch status for a request ID
  static Future<Map<String, dynamic>?> getRequestStatus(String requestId) async {
    final host = baseUrl;
    if (host.isEmpty) return null;
    try {
      final response = await http
          .get(Uri.parse('$host/api/citizen/status/$requestId'), headers: _authHeaders())
          .timeout(const Duration(seconds: 3));
      if (response.statusCode == 200) {
        return jsonDecode(response.body) as Map<String, dynamic>;
      }
    } catch (_) {}
    return null;
  }

  /// Fetch chat thread between the citizen and the rescue team assigned to [incidentId]
  static Future<Map<String, dynamic>> fetchIncidentChat(String incidentId) async {
    final host = baseUrl;
    if (host.isEmpty) {
      return const {'success': false, 'error': 'Command Center host not configured'};
    }
    try {
      final response = await http
          .get(
            Uri.parse('$host/api/incidents/${Uri.encodeComponent(incidentId)}/chat'),
            headers: _authHeaders(),
          )
          .timeout(const Duration(seconds: 4));
      final data = _tryDecodeMap(response.body);
      if (response.statusCode == 200) {
        return data;
      }
      return {
        'success': false,
        'status': response.statusCode,
        'error': (data['error'] ?? 'Failed to load chat (${response.statusCode})').toString(),
      };
    } catch (e) {
      return {'success': false, 'networkError': true, 'error': e.toString()};
    }
  }

  /// Send a chat message from the citizen to the rescue team assigned to [incidentId]
  static Future<Map<String, dynamic>> sendIncidentChat({
    required String incidentId,
    required String text,
    String? id,
    String? sender,
    String? locationTag,
  }) async {
    final host = baseUrl;
    if (host.isEmpty) {
      return const {'success': false, 'error': 'Command Center host not configured'};
    }
    try {
      final response = await http
          .post(
            Uri.parse('$host/api/incidents/${Uri.encodeComponent(incidentId)}/chat'),
            headers: _authHeaders(json: true),
            body: jsonEncode({
              if (id != null && id.isNotEmpty) 'id': id,
              'text': text,
              if (sender != null && sender.isNotEmpty) 'sender': sender,
              if (locationTag != null && locationTag.isNotEmpty) 'locationTag': locationTag,
            }),
          )
          .timeout(const Duration(seconds: 5));
      final data = _tryDecodeMap(response.body);
      if (response.statusCode == 200 || response.statusCode == 201) {
        return data;
      }
      return {
        'success': false,
        'status': response.statusCode,
        'error': (data['error'] ?? 'Failed to send message (${response.statusCode})').toString(),
      };
    } catch (e) {
      return {'success': false, 'networkError': true, 'error': e.toString()};
    }
  }

  static bool lastAlertsFetchSucceeded = false;
  static bool lastRequestsFetchSucceeded = false;

  /// Fetch active alerts & advisories issued by Command Center
  static Future<List<Map<String, dynamic>>> fetchAlerts() async {
    lastAlertsFetchSucceeded = false;
    final host = baseUrl;
    if (host.isEmpty) return [];
    try {
      final response = await http
          .get(Uri.parse('$host/api/alerts'), headers: _authHeaders())
          .timeout(const Duration(seconds: 3));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final list = data['alerts'] as List<dynamic>?;
        if (list != null) {
          lastAlertsFetchSucceeded = true;
          return list.cast<Map<String, dynamic>>();
        }
      }
    } catch (_) {}
    return [];
  }

  /// Fetch all requests for a given citizen phone/user
  static Future<List<Map<String, dynamic>>> fetchMyRequests(String phoneNumber) async {
    lastRequestsFetchSucceeded = false;
    final host = baseUrl;
    if (host.isEmpty) return [];
    try {
      final query = phoneNumber.trim().isNotEmpty
          ? '?phone=${Uri.encodeComponent(phoneNumber.trim())}'
          : '';
      final response = await http
          .get(Uri.parse('$host/api/citizen/my-requests$query'), headers: _authHeaders())
          .timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final list = data['requests'] as List<dynamic>?;
        if (list != null) {
          lastRequestsFetchSucceeded = true;
          return list.cast<Map<String, dynamic>>();
        }
      }
    } catch (_) {}
    return [];
  }

  /// Live updates via WebSocket (/ws) with automatic reconnect & polling only as fallback
  static void startLiveUpdates({
    required void Function(String event, Map<String, dynamic> data) onEvent,
    void Function()? onPollTick,
  }) {
    _liveActive = true;
    _connectLiveSocket(onEvent, onPollTick);
  }

  static Future<void> _connectLiveSocket(
    void Function(String event, Map<String, dynamic> data) onEvent,
    void Function()? onPollTick,
  ) async {
    if (!_liveActive) return;
    final host = baseUrl;
    if (host.isEmpty) return;

    _reconnectTimer?.cancel();
    try {
      final wsBase = host.startsWith('https://')
          ? host.replaceFirst('https://', 'wss://')
          : host.replaceFirst('http://', 'ws://');
      final tokenQ = _authToken.isNotEmpty ? '?token=${Uri.encodeComponent(_authToken)}' : '';
      final headers = <String, String>{};
      if (_authToken.isNotEmpty) {
        headers['Authorization'] = 'Bearer $_authToken';
      }

      final ws = await connectPlatformWebSocket(
        '$wsBase/ws$tokenQ',
        headers: headers,
        timeout: const Duration(seconds: 4),
      );
      _liveSocket = ws;

      // Cancel fallback polling once WebSocket is connected
      _pollFallbackTimer?.cancel();
      _pollFallbackTimer = null;

      ws.stream.listen(
        (raw) {
          try {
            final decoded = jsonDecode(raw as String);
            if (decoded is Map<String, dynamic>) {
              final event = (decoded['event'] ?? decoded['type'] ?? '').toString();
              final data = decoded['data'] is Map<String, dynamic>
                  ? decoded['data'] as Map<String, dynamic>
                  : decoded;
              if (event.isNotEmpty) onEvent(event, data);
            }
          } catch (_) {}
        },
        onDone: () {
          _liveSocket = null;
          if (_liveActive) {
            _startFallbackPolling(onPollTick);
            _reconnectTimer = Timer(
                const Duration(seconds: 4), () => _connectLiveSocket(onEvent, onPollTick));
          }
        },
        onError: (_) {
          _liveSocket = null;
          if (_liveActive) {
            _startFallbackPolling(onPollTick);
            _reconnectTimer = Timer(
                const Duration(seconds: 4), () => _connectLiveSocket(onEvent, onPollTick));
          }
        },
      );
      return;
    } catch (_) {
      if (_liveActive) {
        _startFallbackPolling(onPollTick);
        _reconnectTimer = Timer(
            const Duration(seconds: 5), () => _connectLiveSocket(onEvent, onPollTick));
      }
    }
  }

  static void _startFallbackPolling(void Function()? onPollTick) {
    if (onPollTick == null) return;
    if (_pollFallbackTimer != null && _pollFallbackTimer!.isActive) return;
    _pollFallbackTimer = Timer.periodic(const Duration(seconds: 6), (_) {
      onPollTick();
    });
  }

  static void stopLiveUpdates() {
    _liveActive = false;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _pollFallbackTimer?.cancel();
    _pollFallbackTimer = null;
    try {
      _liveSocket?.close();
    } catch (_) {}
    _liveSocket = null;
  }

  /// Start fallback tracking for a specific request only when WebSocket isn't open
  static void startTrackingRequest(
    String requestId,
    void Function(Map<String, dynamic> update) onUpdate,
  ) {
    stopTrackingRequest(requestId);

    _activePollers[requestId] = Timer.periodic(const Duration(seconds: 5), (timer) async {
      if (_liveSocket != null && _liveSocket!.isOpen) {
        return;
      }
      final res = await getRequestStatus(requestId);
      if (res != null && (res['request'] != null || res['incident'] != null)) {
        final data = (res['request'] ?? res['incident']) as Map<String, dynamic>;
        onUpdate(data);

        final status = (data['status'] ?? '').toString().toLowerCase();
        if (status == 'resolved' || status == 'completed') {
          timer.cancel();
          _activePollers.remove(requestId);
        }
      }
    });
  }

  static void stopTrackingRequest(String requestId) {
    if (_activePollers.containsKey(requestId)) {
      _activePollers[requestId]?.cancel();
      _activePollers.remove(requestId);
    }
  }

  static void stopAllTracking() {
    stopLiveUpdates();
    for (final timer in _activePollers.values) {
      timer.cancel();
    }
    _activePollers.clear();
  }
}
