import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user_profile.dart';

/// Persists citizen accounts locally using SharedPreferences with
/// file-based and in-memory fallbacks so storage operations never throw or block.
class AccountStorageService {
  static const String _kAccountsKey = 'resqcore_accounts';
  static final List<UserProfile> _memoryCache = [];

  static File? _getFallbackFile() {
    try {
      final tmp = Directory.systemTemp.path;
      return File('$tmp/resqcore_accounts.json');
    } catch (_) {
      return null;
    }
  }

  // ── Write ────────────────────────────────────────────────────────────────

  /// Saves [profile] to local storage.
  /// If an account with the same phone or email already exists it is replaced;
  /// otherwise the profile is appended.
  static Future<void> saveAccount(UserProfile profile) async {
    // 1. Always update memory cache
    final memIdx = _memoryCache.indexWhere((a) =>
        (profile.phoneNumber.isNotEmpty && a.matchesPhone(profile.phoneNumber)) ||
        (profile.email.isNotEmpty && a.matchesEmail(profile.email)));

    if (memIdx >= 0) {
      _memoryCache[memIdx] = profile;
    } else {
      _memoryCache.add(profile);
    }

    // 2. Persist to SharedPreferences
    try {
      final prefs = await SharedPreferences.getInstance();
      final accounts = await _loadFromPrefs(prefs);
      final idx = accounts.indexWhere((a) =>
          (profile.phoneNumber.isNotEmpty && a.matchesPhone(profile.phoneNumber)) ||
          (profile.email.isNotEmpty && a.matchesEmail(profile.email)));

      if (idx >= 0) {
        accounts[idx] = profile;
      } else {
        accounts.add(profile);
      }

      await prefs.setString(
        _kAccountsKey,
        jsonEncode(accounts.map((a) => a.toJson()).toList()),
      );
    } catch (e) {
      debugPrint('SharedPreferences.saveAccount note: $e');
    }

    // 3. Persist to fallback JSON file
    try {
      final file = _getFallbackFile();
      if (file != null) {
        await file.writeAsString(
          jsonEncode(_memoryCache.map((a) => a.toJson()).toList()),
        );
      }
    } catch (e) {
      debugPrint('Fallback file write note: $e');
    }
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  /// Returns all saved accounts.
  static Future<List<UserProfile>> loadAll() async {
    // Try SharedPreferences first
    try {
      final prefs = await SharedPreferences.getInstance();
      final accounts = await _loadFromPrefs(prefs);
      if (accounts.isNotEmpty) {
        _syncToMemory(accounts);
        return List.unmodifiable(_memoryCache);
      }
    } catch (e) {
      debugPrint('SharedPreferences.loadAll note: $e');
    }

    // Try fallback JSON file
    try {
      final file = _getFallbackFile();
      if (file != null && await file.exists()) {
        final raw = await file.readAsString();
        if (raw.isNotEmpty) {
          final List<dynamic> list = jsonDecode(raw) as List<dynamic>;
          final parsed = list
              .map((e) => UserProfile.fromJson(e as Map<String, dynamic>))
              .toList();
          _syncToMemory(parsed);
          return List.unmodifiable(_memoryCache);
        }
      }
    } catch (e) {
      debugPrint('Fallback file read note: $e');
    }

    return List.unmodifiable(_memoryCache);
  }

  static void _syncToMemory(List<UserProfile> loaded) {
    for (final acc in loaded) {
      final idx = _memoryCache.indexWhere((a) =>
          (acc.phoneNumber.isNotEmpty && a.matchesPhone(acc.phoneNumber)) ||
          (acc.email.isNotEmpty && a.matchesEmail(acc.email)));
      if (idx >= 0) {
        _memoryCache[idx] = acc;
      } else {
        _memoryCache.add(acc);
      }
    }
  }

  /// Finds an account by phone number. Returns null if not found.
  static Future<UserProfile?> findByPhone(String phone) async {
    if (phone.trim().isEmpty) return null;
    final accounts = await loadAll();
    try {
      return accounts.firstWhere((a) => a.matchesPhone(phone));
    } catch (_) {
      return null;
    }
  }

  /// Finds an account by email address. Returns null if not found.
  static Future<UserProfile?> findByEmail(String email) async {
    if (email.trim().isEmpty) return null;
    final accounts = await loadAll();
    try {
      return accounts.firstWhere((a) => a.matchesEmail(email));
    } catch (_) {
      return null;
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  /// Removes the account matching [profile] from storage.
  static Future<void> deleteAccount(UserProfile profile) async {
    _memoryCache.removeWhere((a) =>
        a.matchesPhone(profile.phoneNumber) || a.matchesEmail(profile.email));

    try {
      final prefs = await SharedPreferences.getInstance();
      final accounts = await _loadFromPrefs(prefs);
      accounts.removeWhere((a) =>
          a.matchesPhone(profile.phoneNumber) || a.matchesEmail(profile.email));
      await prefs.setString(
        _kAccountsKey,
        jsonEncode(accounts.map((a) => a.toJson()).toList()),
      );
    } catch (_) {}

    try {
      final file = _getFallbackFile();
      if (file != null) {
        await file.writeAsString(
          jsonEncode(_memoryCache.map((a) => a.toJson()).toList()),
        );
      }
    } catch (_) {}
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  static Future<List<UserProfile>> _loadFromPrefs(SharedPreferences prefs) async {
    final raw = prefs.getString(_kAccountsKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final List<dynamic> list = jsonDecode(raw) as List<dynamic>;
      return list
          .map((e) => UserProfile.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }
}
