import 'dart:async';
import 'dart:convert';
import 'dart:io';

class CommandCenterService {
  // Configurable Command Center API hosts
  // 10.0.2.2 for Android Emulator, localhost for Desktop/Web
  static const List<String> candidateHosts = [
    'http://10.0.2.2:5000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ];

  static String _activeHost = candidateHosts.first;
  static final Map<String, Timer> _activePollers = {};

  static String get activeHost => _activeHost;

  /// Check connectivity with the ResQCore Command Center Backend
  static Future<bool> checkConnection() async {
    for (final host in candidateHosts) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 2);
        final request = await client.getUrl(Uri.parse('$host/api/health'));
        final response = await request.close();
        if (response.statusCode == 200) {
          _activeHost = host;
          return true;
        }
      } catch (_) {
        // try next candidate host
      }
    }
    return false;
  }

  /// Send Citizen Emergency SOS Report to Command Center in Real Time
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
  }) async {
    final lat = latitude ?? 30.3165;
    final lng = longitude ?? 78.0322;
    for (final host in candidateHosts) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request = await client.postUrl(Uri.parse('$host/api/citizen/sos'));
        request.headers.contentType = ContentType.json;

        final payload = jsonEncode({
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

        request.write(payload);
        final response = await request.close();
        if (response.statusCode == 200 || response.statusCode == 201) {
          final responseBody = await response.transform(utf8.decoder).join();
          _activeHost = host;
          return jsonDecode(responseBody) as Map<String, dynamic>;
        }
      } catch (e) {
        // Continue to try other host
      }
    }
    return null;
  }

  /// Poll real-time dispatch status for a request ID
  static Future<Map<String, dynamic>?> getRequestStatus(String requestId) async {
    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 2);
        final request = await client.getUrl(Uri.parse('$host/api/citizen/status/$requestId'));
        final response = await request.close();
        if (response.statusCode == 200) {
          _activeHost = host;
          final responseBody = await response.transform(utf8.decoder).join();
          return jsonDecode(responseBody) as Map<String, dynamic>;
        }
      } catch (_) {
        // try next host
      }
    }
    return null;
  }

  /// Fetch active alerts & advisories issued by Command Center
  static Future<List<Map<String, dynamic>>> fetchAlerts() async {
    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 2);
        final request = await client.getUrl(Uri.parse('$host/api/alerts'));
        final response = await request.close();
        if (response.statusCode == 200) {
          _activeHost = host;
          final responseBody = await response.transform(utf8.decoder).join();
          final data = jsonDecode(responseBody) as Map<String, dynamic>;
          final list = data['alerts'] as List<dynamic>?;
          if (list != null) {
            return list.cast<Map<String, dynamic>>();
          }
        }
      } catch (_) {
        // try next host
      }
    }
    return [];
  }

  /// Fetch all requests for a given citizen phone
  static Future<List<Map<String, dynamic>>> fetchMyRequests(String phoneNumber) async {
    for (final host in [_activeHost, ...candidateHosts]) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 2);
        final request = await client.getUrl(
          Uri.parse('$host/api/citizen/my-requests?phone=${Uri.encodeComponent(phoneNumber)}'),
        );
        final response = await request.close();
        if (response.statusCode == 200) {
          _activeHost = host;
          final responseBody = await response.transform(utf8.decoder).join();
          final data = jsonDecode(responseBody) as Map<String, dynamic>;
          final list = data['requests'] as List<dynamic>?;
          if (list != null) {
            return list.cast<Map<String, dynamic>>();
          }
        }
      } catch (_) {
        // try next host
      }
    }
    return [];
  }

  /// Start live tracking for a submitted request (polls backend every 3s)
  static void startTrackingRequest(String requestId, void Function(Map<String, dynamic> update) onUpdate) {
    stopTrackingRequest(requestId);

    _activePollers[requestId] = Timer.periodic(const Duration(seconds: 3), (timer) async {
      final res = await getRequestStatus(requestId);
      if (res != null && (res['request'] != null || res['incident'] != null)) {
        final data = (res['request'] ?? res['incident']) as Map<String, dynamic>;
        onUpdate(data);

        // If request reached terminal status, reduce poll frequency or stop
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
    for (final timer in _activePollers.values) {
      timer.cancel();
    }
    _activePollers.clear();
  }
}
