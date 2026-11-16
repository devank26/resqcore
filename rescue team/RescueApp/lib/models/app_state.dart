import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'incident.dart';
import 'team_member.dart';
import 'chat_message.dart';
import 'shelter_model.dart';
import '../services/tactical_sync_service.dart';

class AppState extends ChangeNotifier {
  String _userRole = 'Commander';
  String _userName = 'Devank (HQ Commander)';
  String _userPhone = '+91 98110 44201';
  String _teamId = '';
  bool _isAuthenticated = false;
  bool _isDemoMode = false;
  int _activeTabIndex = 0;
  bool _nightOpsEnabled = true;
  bool _sosActive = false;

  // Live GPS telemetry & chat sync timers
  Timer? _telemetryTimer;
  double _currentLat = 30.5593;
  double _currentLng = 79.5644;
  int _currentBattery = 85;

  double get currentLat => _currentLat;
  double get currentLng => _currentLng;
  int get currentBattery => _currentBattery;

  List<Incident> _incidents = Incident.mockIncidents();
  List<RescueTeam> _teams = RescueTeam.mockTeams();
  List<ChatMessage> _messages = ChatMessage.mockMessages();
  List<Shelter> _shelters = Shelter.mockShelters();
  List<Evacuee> _evacuees = Evacuee.mockEvacuees();

  // Getters
  String get userRole => _userRole;
  String get userName => _userName;
  String get userPhone => _userPhone;
  bool get isAuthenticated => _isAuthenticated;
  bool get isDemoMode => _isDemoMode;
  int get activeTabIndex => _activeTabIndex;
  bool get nightOpsEnabled => _nightOpsEnabled;
  bool get sosActive => _sosActive;

  List<Incident> get incidents => _incidents;
  List<RescueTeam> get teams => _teams;
  List<ChatMessage> get messages => _messages;
  List<Shelter> get shelters => _shelters;
  List<Evacuee> get evacuees => _evacuees;

  int get affectedTotal => _incidents.fold(0, (total, incident) => total + incident.affectedCount);
  int get rescuedTotal => _evacuees.where((e) => e.status == 'Rescued').length * 47 + 1;
  int get missingTotal => _evacuees.where((e) => e.status == 'Missing').length * 7;

  // Actions
  void setDemoRole(String role, String phone, String name) {
    _userRole = role;
    _teamId = '';
    _userPhone = phone;
    _userName = name;
    _isAuthenticated = true;
    _isDemoMode = true; // DEMO MODE ACTIVE - Offline simulated mode untouched
    notifyListeners();
  }

  void loginLive({required String role, required String teamId, required String email, required String name}) {
    _userRole = role;
    _teamId = teamId;
    _userPhone = email;
    _userName = name;
    _isAuthenticated = true;
    _isDemoMode = false;
    _incidents = [];
    _teams = [];
    _messages = [];
    _shelters = [];
    _evacuees = [];
    _initBackendSync();
    notifyListeners();
  }

  void logout() {
    final wasLive = !_isDemoMode;
    _isAuthenticated = false;
    _isDemoMode = false;
    _teamId = '';
    if (wasLive) {
      try { Supabase.instance.client.auth.signOut(); } catch (_) {}
    }
    _telemetryTimer?.cancel();
    _telemetryTimer = null;
    TacticalSyncService.disconnectRealtime();
    notifyListeners();
  }

  void setTabIndex(int index) {
    _activeTabIndex = index;
    notifyListeners();
  }

  void toggleNightOps() {
    _nightOpsEnabled = !_nightOpsEnabled;
    notifyListeners();
  }

  void triggerSos() {
    _sosActive = true;
    final alertMsg = ChatMessage(
      id: 'SOS-${DateTime.now().millisecondsSinceEpoch}',
      sender: 'DISPATCH ALERT',
      initials: 'SOS',
      role: 'EMERGENCY BEACON',
      time: 'Just now',
      text: 'EMERGENCY SOS ACTIVATED by $_userName at GPS 30.3165° N, 78.0322° E (Dehradun). Team Alpha dispatched!',
      isAlert: true,
      isBot: true,
    );
    _messages.insert(0, alertMsg);

    if (!_isDemoMode) {
      // Dispatch immediately with best available GPS
      Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high).then((pos) {
        TacticalSyncService.triggerSos(
          teamId: _teamId,
          teamName: _userRole,
          operatorName: _userName,
          location: 'GPS: ${pos.latitude.toStringAsFixed(4)}°N, ${pos.longitude.toStringAsFixed(4)}°E',
          lat: pos.latitude,
          lng: pos.longitude,
          notes: 'EMERGENCY SOS ACTIVATED by $_userName ($_userRole)',
        );
      }).catchError((_) {
        TacticalSyncService.triggerSos(
          teamId: _teamId,
          teamName: _userRole,
          operatorName: _userName,
          location: 'Dehradun / Joshimath Sector',
          notes: 'EMERGENCY SOS ACTIVATED by $_userName ($_userRole)',
        );
      });
    }

    notifyListeners();
  }

  void cancelSos() {
    _sosActive = false;
    notifyListeners();
  }

  void addMessage(String text, {String? locationTag}) {
    if (text.trim().isEmpty) return;
    final newMsg = ChatMessage(
      id: 'MSG-${DateTime.now().millisecondsSinceEpoch}',
      sender: _userName,
      initials: _userName.isNotEmpty ? _userName[0].toUpperCase() : 'ME',
      role: _userRole,
      time: 'Just now',
      text: text,
      locationTag: locationTag,
      isMe: true,
    );
    _messages.add(newMsg);

    if (!_isDemoMode) {
      TacticalSyncService.sendChatMessage(
        sender: _userName,
        role: _userRole,
        text: text,
        locationTag: locationTag,
      );
    }

    notifyListeners();
  }

  void reportIncident({
    required String title,
    required String location,
    required String severity,
    required String description,
    String? photoAssetPath,
  }) {
    final newIncident = Incident(
      id: 'INC-${_incidents.length + 101}',
      title: title,
      location: location,
      timestamp: 'Today · Just now',
      severity: severity,
      status: 'Active',
      teamAssigned: 'En route / Assigning',
      eta: '10 min',
      affectedCount: 12,
      coordinates: '30.5562° N, 79.5670° E',
      description: description,
      substatus: 'Immediate triage in progress',
      photoAssetPath: photoAssetPath ?? 'assets/images/scenarios/earthquake_rubble_collapse.png',
    );
    _incidents.insert(0, newIncident);

    if (!_isDemoMode) {
      TacticalSyncService.reportIncident(
        title: title,
        location: location,
        severity: severity,
        description: description,
        teamName: _userRole,
        reporter: _userName,
      );
    }

    notifyListeners();
  }

  void updateIncidentStatus(String incidentId, String status, {String? notes}) {
    final index = _incidents.indexWhere((i) => i.id == incidentId);
    if (index != -1) {
      final existing = _incidents[index];
      _incidents[index] = existing.copyWith(
        status: status,
        substatus: notes ?? (status == 'Resolved' ? 'Completed · Cleared by field team' : existing.substatus),
      );
    }

    if (!_isDemoMode) {
      TacticalSyncService.updateIncidentStatus(
        incidentId: incidentId,
        status: status,
        teamName: _userRole,
        notes: notes,
      );
    }

    notifyListeners();
  }

  // --- Realtime backend synchronization ---
  Future<void> _initBackendSync() async {
    if (_isDemoMode || _teamId.isEmpty) return;

    try {
      final remoteIncidents = await TacticalSyncService.fetchIncidents();
      _incidents = remoteIncidents.map(Incident.fromJson).toList();
      final remoteTeams = await TacticalSyncService.fetchTeams();
      _teams = remoteTeams.map(RescueTeam.fromJson).toList();
      final remoteShelters = await TacticalSyncService.fetchShelters();
      _shelters = remoteShelters.map((row) => Shelter(
        id: (row['id'] ?? '').toString(),
        name: (row['name'] ?? 'Shelter').toString(),
        location: (row['location'] ?? '').toString(),
        capacity: (row['capacity'] as num?)?.toInt() ?? 0,
        occupied: (row['occupied'] as num?)?.toInt() ?? 0,
        distance: '',
        amenities: '',
      )).toList();
      final remoteMessages = await TacticalSyncService.fetchChatMessages(channel: 'team:$_teamId');
      _messages = remoteMessages.map((row) => ChatMessage.fromJson(row, currentUserName: _userName)).toList();
      notifyListeners();
    } catch (error) {
      debugPrint('[RescueApp Sync] Initial data sync failed: $error');
    }

    TacticalSyncService.connectRealtime(
      teamId: _teamId,
      role: _userRole,
      name: _userName,
      onEvent: _handleRealtimeEvent,
    );

    _telemetryTimer?.cancel();
    _telemetryTimer = Timer.periodic(const Duration(seconds: 30), (_) => _sendGpsTelemetry());
    _sendGpsTelemetry();
  }

  void _handleRealtimeEvent(Map<String, dynamic> event) {
    if (_isDemoMode) return;

    final eventType = event['event']?.toString() ?? event['type']?.toString();
    final data = (event['data'] ?? event) as Map<String, dynamic>;

    if (eventType == 'incidents_sync') {
      final rows = data['incidents'];
      if (rows is List) {
        _incidents = rows.map((row) => Incident.fromJson(Map<String, dynamic>.from(row as Map))).toList();
        notifyListeners();
      }
      return;
    }

    if (eventType == 'chat_sync') {
      final rows = data['messages'];
      if (rows is List) {
        final existingIds = _messages.map((message) => message.id).toSet();
        for (final raw in rows) {
          final message = ChatMessage.fromJson(Map<String, dynamic>.from(raw as Map), currentUserName: _userName);
          if (!existingIds.contains(message.id)) _messages.add(message);
        }
        notifyListeners();
      }
      return;
    }

    if (eventType == 'new_citizen_sos' || eventType == 'incident_reported') {
      try {
        final rawInc = (data['incident'] ?? data) as Map<String, dynamic>;
        final inc = Incident.fromJson(rawInc);

        // Prepend incident
        if (!_incidents.any((i) => i.id == inc.id)) {
          _incidents.insert(0, inc);
        }

        // Add tactical notification message
        _messages.add(
          ChatMessage(
            id: 'NOTIF-${DateTime.now().millisecondsSinceEpoch}',
            sender: 'COMMAND DISPATCH',
            initials: 'HQ',
            role: 'HIGH PRIORITY',
            time: 'Just now',
            text: '🚨 NEW EMERGENCY SOS: ${inc.title} at ${inc.location}. Affected: ${inc.affectedCount}. Standby for team dispatch.',
            isAlert: true,
            isBot: true,
          ),
        );
        notifyListeners();
      } catch (err) {
        print('[RescueApp Sync] Error handling new SOS: $err');
      }
    } else if (eventType == 'incident_assigned') {
      try {
        final targetId = (data['incidentId'] ?? data['incident']?['id'])?.toString();
        final teamName = (data['teamName'] ?? data['incident']?['assignedTeam'])?.toString() ?? 'Assigned Unit';
        final eta = (data['eta'] ?? data['incident']?['eta'])?.toString() ?? '10 min';

        final idx = _incidents.indexWhere((i) => i.id == targetId);
        if (idx != -1) {
          _incidents[idx] = _incidents[idx].copyWith(
            teamAssigned: teamName,
            eta: eta,
            substatus: '$teamName dispatched · ETA $eta',
          );
        }

        _messages.add(
          ChatMessage(
            id: 'DISP-${DateTime.now().millisecondsSinceEpoch}',
            sender: 'COMMAND DISPATCH',
            initials: 'HQ',
            role: 'DISPATCH ORDER',
            time: 'Just now',
            text: '📋 DISPATCH ORDER: Incident $targetId assigned to $teamName · ETA $eta.',
            isAlert: true,
            isBot: true,
          ),
        );
        notifyListeners();
      } catch (err) {
        print('[RescueApp Sync] Error handling dispatch: $err');
      }
    } else if (eventType == 'incident_status_changed') {
      try {
        final targetId = data['incidentId']?.toString();
        final newStatus = data['status']?.toString() ?? 'Active';
        final notes = data['notes']?.toString();

        final idx = _incidents.indexWhere((i) => i.id == targetId);
        if (idx != -1) {
          _incidents[idx] = _incidents[idx].copyWith(
            status: newStatus.toLowerCase() == 'resolved' ? 'Resolved' : 'Active',
            substatus: notes ?? 'Status updated to $newStatus',
          );
          notifyListeners();
        }
      } catch (_) {}
    } else if (eventType == 'new_chat_message') {
      try {
        final msgData = (data['message'] ?? data) as Map<String, dynamic>;
        final msg = ChatMessage.fromJson(msgData, currentUserName: _userName);

        final idx = _messages.indexWhere((m) =>
          m.id == msg.id ||
          (m.isMe && m.text == msg.text && (m.sender == msg.sender || msg.sender.contains(m.sender)))
        );

        if (idx == -1) {
          _messages.add(msg);
          notifyListeners();
        } else if (_messages[idx].id.startsWith('MSG-')) {
          _messages[idx] = msg;
          notifyListeners();
        }
      } catch (err) {
        print('[RescueApp Sync] Error handling chat: $err');
      }
    } else if (eventType == 'chat_sync') {
      try {
        final rawList = (data['messages'] as List<dynamic>? ?? []);
        bool changed = false;
        for (final raw in rawList) {
          final msg = ChatMessage.fromJson(raw as Map<String, dynamic>, currentUserName: _userName);
          if (!_messages.any((m) => m.id == msg.id || (m.isMe && m.text == msg.text))) {
            _messages.add(msg);
            changed = true;
          }
        }
        if (changed) notifyListeners();
      } catch (_) {}
    } else if (eventType == 'emergency_broadcast') {
      try {
        final alertText = data['message']?.toString() ?? data['alert']?['subtitle']?.toString() ?? 'Advisory';
        final recipients = data['recipients']?.toString() ?? 'ALL UNITS';

        _messages.add(
          ChatMessage(
            id: 'BCAST-${DateTime.now().millisecondsSinceEpoch}',
            sender: 'HQ EMERGENCY BROADCAST',
            initials: 'SEOC',
            role: 'COMMAND BROADCAST',
            time: 'Just now',
            text: '📢 COMMAND BROADCAST TO $recipients: $alertText',
            isAlert: true,
            isBot: true,
          ),
        );
        notifyListeners();
      } catch (_) {}
    } else if (eventType == 'incidents_sync') {
      try {
        final rawList = data['incidents'] as List<dynamic>?;
        if (rawList != null) {
          for (final raw in rawList) {
            final inc = Incident.fromJson(raw as Map<String, dynamic>);
            final idx = _incidents.indexWhere((i) => i.id == inc.id);
            if (idx != -1) {
              _incidents[idx] = inc;
            } else {
              _incidents.insert(0, inc);
            }
          }
          notifyListeners();
        }
      } catch (_) {}
    } else if (eventType == 'team_telemetry_update') {
      try {
        final lat = (data['lat'] as num?)?.toDouble();
        final lng = (data['lng'] as num?)?.toDouble();
        final battery = (data['battery'] as num?)?.toInt() ?? 100;
        final status = data['status']?.toString() ?? 'Deployed';

        if (lat != null && lng != null && _teams.isNotEmpty) {
          final t = _teams.first;
          final updatedMembers = t.members.map((m) {
            return TeamMember(
              id: m.id,
              name: m.name,
              role: m.role,
              specialty: m.specialty,
              batteryLevel: battery,
              status: status,
              distance: '0.1 km',
              gpsCoords: '${lat.toStringAsFixed(4)}° N, ${lng.toStringAsFixed(4)}° E',
              avatarUrl: m.avatarUrl,
              bloodGroup: m.bloodGroup,
            );
          }).toList();

          _teams[0] = RescueTeam(
            id: t.id,
            name: t.name,
            sector: t.sector,
            callsign: t.callsign,
            frequency: t.frequency,
            commanderName: t.commanderName,
            commanderPhone: t.commanderPhone,
            commanderExperience: t.commanderExperience,
            commanderBloodGroup: t.commanderBloodGroup,
            commanderAvatar: t.commanderAvatar,
            syncedCount: t.syncedCount,
            totalCount: t.totalCount,
            status: status,
            members: updatedMembers,
          );
          notifyListeners();
        }
      } catch (err) {
        print('[RescueApp Sync] Telemetry parse error: $err');
      }
    }
  }

  /// Sends real GPS + battery telemetry to backend every 30 seconds
  Future<void> _sendGpsTelemetry() async {
    if (_isDemoMode || !_isAuthenticated) return;
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      ).timeout(const Duration(seconds: 5));
      _currentLat = pos.latitude;
      _currentLng = pos.longitude;

      // Update local team Alpha members with this live position
      if (_teams.isNotEmpty) {
        final t = _teams.first;
        final updatedMembers = t.members.map((m) {
          return TeamMember(
            id: m.id,
            name: m.name,
            role: m.role,
            specialty: m.specialty,
            batteryLevel: _currentBattery,
            status: _sosActive ? 'SOS Active' : 'Active On-Site',
            distance: 'Current Device',
            gpsCoords: '${pos.latitude.toStringAsFixed(4)}° N, ${pos.longitude.toStringAsFixed(4)}° E',
            avatarUrl: m.avatarUrl,
            bloodGroup: m.bloodGroup,
          );
        }).toList();

        _teams[0] = RescueTeam(
          id: t.id,
          name: t.name,
          sector: t.sector,
          callsign: t.callsign,
          frequency: t.frequency,
          commanderName: t.commanderName,
          commanderPhone: t.commanderPhone,
          commanderExperience: t.commanderExperience,
          commanderBloodGroup: t.commanderBloodGroup,
          commanderAvatar: t.commanderAvatar,
          syncedCount: t.syncedCount,
          totalCount: t.totalCount,
          status: _sosActive ? 'SOS Active' : 'OPR-READY',
          members: updatedMembers,
        );
        notifyListeners();
      }

      await TacticalSyncService.sendTelemetry(
        teamId: _teamId,
        lat: pos.latitude,
        lng: pos.longitude,
        battery: _currentBattery,
        status: _sosActive ? 'SOS Active' : 'Deployed',
      );
      print('[AppState GPS] Telemetry: ${pos.latitude.toStringAsFixed(4)}, ${pos.longitude.toStringAsFixed(4)}');
    } catch (_) {
      // GPS unavailable — send last known coordinates
      try {
        await TacticalSyncService.sendTelemetry(
          teamId: _teamId,
          lat: _currentLat,
          lng: _currentLng,
          battery: _currentBattery,
          status: _sosActive ? 'SOS Active' : 'Deployed',
        );
      } catch (__) {}
    }
  }
}
