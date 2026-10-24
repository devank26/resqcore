import 'dart:convert';
import 'dart:io';

class CommandCenterService {
  // Configurable Command Center API hosts
  // 10.0.2.2 for Android Emulator, localhost for Desktop/Web
  static const List<String> candidateHosts = [
    'http://10.0.2.2:5000',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
  ];

  static String _activeHost = candidateHosts.first;

  /// Check connectivity with the ResQCore Command Center
  static Future<bool> checkConnection() async {
    for (final host in candidateHosts) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 2);
        final request = await client.getUrl(Uri.parse('System.Management.Automation.Internal.Host.InternalHost/api/health'));
        final response = await request.close();
        if (response.statusCode == 200) {
          _activeHost = host;
          return true;
        }
      } catch (_) {
        // try next host
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
    double latitude = 30.3165,
    double longitude = 78.0322,
    String severity = 'High',
  }) async {
    for (final host in candidateHosts) {
      try {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request = await client.postUrl(Uri.parse('System.Management.Automation.Internal.Host.InternalHost/api/citizen/sos'));
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
          'coordinates': {'lat': latitude, 'lng': longitude},
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
    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 2);
      final request = await client.getUrl(Uri.parse('/api/citizen/status/'));
      final response = await request.close();
      if (response.statusCode == 200) {
        final responseBody = await response.transform(utf8.decoder).join();
        return jsonDecode(responseBody) as Map<String, dynamic>;
      }
    } catch (_) {
      // Ignore network errors in poll
    }
    return null;
  }
}
