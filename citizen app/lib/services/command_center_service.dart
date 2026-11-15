import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'account_storage_service.dart';

class CommandCenterService {
  static const String _envApiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const String _envCitizenToken = String.fromEnvironment('CITIZEN_TOKEN');

  static String get baseUrl {
    final trimmed = _envApiBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (trimmed.isNotEmpty) return trimmed;
    if (kDebugMode) return 'http://10.0.2.2:5000';
    return '';
  }

  static String _authToken = _envCitizenToken;
  static final Map<String, Timer> _activePollers = {};
  static WebSocket? _liveSocket;
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

  static void _applyAuth(HttpClientRequest request) {
    if (_authToken.isNotEmpty) {
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $_authToken');
    }
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
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 3);
      final request = await client.getUrl(Uri.parse('$host/api/health'));
      final response = await request.close();
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
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 5);
        final request = await client.postUrl(Uri.parse('$host$ep'));
        request.headers.contentType = ContentType.json;
        _applyAuth(request);
        request.write(jsonEncode(payloadMap));
        final response = await request.close();
        final raw = await response.transform(utf8.decoder).join();
        final data = _tryDecodeMap(raw);

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
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 5);
      final request = await client.postUrl(Uri.parse('$host/api/citizen/sos'));
      request.headers.contentType = ContentType.json;
      _applyAuth(request);

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

      request.write(jsonEncode(bodyMap));
      final response = await request.close();
      final responseBody = await response.transform(utf8.decoder).join();
      final decoded = _tryDecodeMap(responseBody);
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
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 4);
      final request = await client.getUrl(Uri.parse('$host/api/resources'));
      _applyAuth(request);
      final response = await request.close();
      if (response.statusCode == 200) {
        final responseBody = await response.transform(utf8.decoder).join();
        final data = _tryDecodeMap(responseBody);
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
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 3);
      final request = await client.getUrl(Uri.parse('$host/api/citizen/status/$requestId'));
      _applyAuth(request);
      final response = await request.close();
      if (response.statusCode == 200) {
        final responseBody = await response.transform(utf8.decoder).join();
        return jsonDecode(responseBody) as Map<String, dynamic>;
      }
    } catch (_) {}
    return null;
  }

  /// Fetch active alerts & advisories issued by Command Center
  static Future<List<Map<String, dynamic>>> fetchAlerts() async {
    final host = baseUrl;
    if (host.isEmpty) return [];
    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 3);
      final request = await client.getUrl(Uri.parse('$host/api/alerts'));
      _applyAuth(request);
      final response = await request.close();
      if (response.statusCode == 200) {
        final responseBody = await response.transform(utf8.decoder).join();
        final data = jsonDecode(responseBody) as Map<String, dynamic>;
        final list = data['alerts'] as List<dynamic>?;
        if (list != null) {
          return list.cast<Map<String, dynamic>>();
        }
      }
    } catch (_) {}
    return [];
  }

  /// Fetch all requests for a given citizen phone/user
  static Future<List<Map<String, dynamic>>> fetchMyRequests(String phoneNumber) async {
    final host = baseUrl;
    if (host.isEmpty) return [];
    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 4);
      final query = phoneNumber.trim().isNotEmpty
          ? '?phone=${Uri.encodeComponent(phoneNumber.trim())}'
          : '';
      final request = await client.getUrl(Uri.parse('$host/api/citizen/my-requests$query'));
      _applyAuth(request);
      final response = await request.close();
      if (response.statusCode == 200) {
        final responseBody = await response.transform(utf8.decoder).join();
        final data = jsonDecode(responseBody) as Map<String, dynamic>;
        final list = data['requests'] as List<dynamic>?;
        if (list != null) {
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
      final headers = <String, dynamic>{};
      if (_authToken.isNotEmpty) {
        headers[HttpHeaders.authorizationHeader] = 'Bearer $_authToken';
      }

      final ws = await WebSocket.connect('$wsBase/ws$tokenQ', headers: headers)
          .timeout(const Duration(seconds: 4));
      _liveSocket = ws;

      // Cancel fallback polling once WebSocket is connected
      _pollFallbackTimer?.cancel();
      _pollFallbackTimer = null;

      ws.listen(
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
      if (_liveSocket != null && _liveSocket!.readyState == WebSocket.open) {
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
