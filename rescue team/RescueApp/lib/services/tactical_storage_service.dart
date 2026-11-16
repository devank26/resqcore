import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Persists Rescue Team session, domain records, volunteers, and offline queue
/// across app reloads and restarts on both Web and native platforms.
class TacticalStorageService {
  static const String _kStateKey = 'resqcore_rescue_app_state_v1';
  static const String _kVolunteersKey = 'resqcore_rescue_volunteers_v1';
  static const String _kPendingOpsKey = 'resqcore_rescue_pending_ops_v1';

  static Future<void> saveState(Map<String, dynamic> state) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kStateKey, jsonEncode(state));
    } catch (_) {}
  }

  static Future<Map<String, dynamic>?> loadState() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_kStateKey);
      if (raw == null || raw.isEmpty) return null;
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
    } catch (_) {}
    return null;
  }

  static Future<void> clearState() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_kStateKey);
    } catch (_) {}
  }

  static Future<void> saveVolunteers(List<Map<String, dynamic>> volunteers) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kVolunteersKey, jsonEncode(volunteers));
    } catch (_) {}
  }

  static Future<List<Map<String, dynamic>>> loadVolunteers() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_kVolunteersKey);
      if (raw == null || raw.isEmpty) return [];
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        return decoded
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    } catch (_) {}
    return [];
  }

  static Future<List<Map<String, dynamic>>> loadPendingOps() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_kPendingOpsKey);
      if (raw == null || raw.isEmpty) return [];
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        return decoded
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    } catch (_) {}
    return [];
  }

  static Future<void> savePendingOps(List<Map<String, dynamic>> ops) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (ops.isEmpty) {
        await prefs.remove(_kPendingOpsKey);
      } else {
        await prefs.setString(_kPendingOpsKey, jsonEncode(ops));
      }
    } catch (_) {}
  }

  static Future<void> enqueuePendingOp(Map<String, dynamic> op) async {
    final ops = await loadPendingOps();
    ops.add(op);
    await savePendingOps(ops);
  }
}
