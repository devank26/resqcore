import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'incident.dart';
import 'team_member.dart';
import 'chat_message.dart';
import 'shelter_model.dart';
import '../services/tactical_sync_service.dart';

class AppState extends ChangeNotifier {
  static const MethodChannel _batteryChannel =
      MethodChannel('com.resqcore.rescue/battery');

  String _userRole = 'rescue';
  String _userName = '';
  String _userPhone = '';
  String? _teamId;
  String _teamName = '';
  bool _isAuthenticated = false;
  bool _isDemoMode = false;
  int _activeTabIndex = 0;
  bool _nightOpsEnabled = true;
  bool _sosActive = false;

  // Live GPS telemetry & chat sync timers
  Timer? _telemetryTimer;
  Timer? _chatSyncTimer;
  double? _currentLat;
  double? _currentLng;
  int _currentBattery = 100;
  bool _gpsPermissionRequested = false;
  bool _locationPermissionDenied = false;
  String? _locationStatusMessage;

  double get currentLat => _currentLat ?? 0.0;
  double get currentLng => _currentLng ?? 0.0;
  int get currentBattery => _currentBattery;
  bool get locationPermissionDenied => _locationPermissionDenied;
  String? get locationStatusMessage => _locationStatusMessage;

  List<Incident> _incidents = [];
  List<RescueTeam> _teams = [];
  List<ChatMessage> _messages = [];
  String _activeChatChannel = 'command-net';
  int _chatMsgSeq = 0;
  List<Shelter> _shelters = [];
  List<Evacuee> _evacuees = [];

  // Getters
  String get userRole => _userRole;
  String get userName => _userName;
  String get userPhone => _userPhone;
  String get teamId => _teamId ?? '';
  String get teamName => _teamName.isNotEmpty ? _teamName : _userName;
  bool get isAuthenticated => _isAuthenticated;
  bool get isDemoMode => _isDemoMode;
  int get activeTabIndex => _activeTabIndex;
  bool get nightOpsEnabled => _nightOpsEnabled;
  bool get sosActive => _sosActive;

  List<Incident> get incidents => _incidents;
  List<Incident> get assignedIncidents => _incidents
      .where((i) =>
          i.status != 'Resolved' &&
          i.isAssignedTo(
            teamId: _teamId,
            teamName: _teamName,
            userName: _userName,
          ))
      .toList();
  Incident? get activeAssignedIncident =>
      assignedIncidents.isNotEmpty ? assignedIncidents.first : null;
  List<RescueTeam> get teams => _teams;
  List<ChatMessage> get messages => _messages;
  String get activeChatChannel => _activeChatChannel;
  String? get directTeamChannel =>
      (_teamId != null && _teamId!.isNotEmpty) ? 'team-$_teamId' : null;
  List<ChatMessage> get activeChannelMessages => _isDemoMode
      ? _messages
      : _messages
          .where((m) => m.isBot || m.channel == _activeChatChannel)
          .toList();
  List<Shelter> get shelters => _shelters;
  List<Evacuee> get evacuees => _evacuees;

  int get affectedTotal => _isDemoMode
      ? 247
      : _incidents.fold<int>(0, (sum, i) => sum + i.affectedCount);
  int get rescuedTotal => _isDemoMode
      ? _evacuees.where((e) => e.status == 'Rescued').length * 47 + 1
      : _evacuees.where((e) => e.status == 'Rescued').length;
  int get missingTotal => _isDemoMode
      ? _evacuees.where((e) => e.status == 'Missing').length * 7
      : _evacuees.where((e) => e.status == 'Missing').length;

  // Actions
  void setDemoRole(String role, String phone, String name) {
    _userRole = role;
    _userPhone = phone;
    _userName = name;
    _teamId = 'TEAM-ALPHA';
    _teamName = 'Team Alpha';
    _currentLat = 30.5593;
    _currentLng = 79.5644;
    _locationPermissionDenied = false;
    _locationStatusMessage = null;
    _incidents = Incident.mockIncidents();
    _teams = RescueTeam.mockTeams();
    _messages = ChatMessage.mockMessages();
    _shelters = Shelter.mockShelters();
    _evacuees = Evacuee.mockEvacuees();
    _isAuthenticated = true;
    _isDemoMode = true; // DEMO MODE ACTIVE - Offline simulated mode untouched
    notifyListeners();
  }

  void login(String role, String phone, {String? name, String? teamName}) {
    final cleanPhone = phone.trim();
    final initialName = (name ?? '').trim().isNotEmpty
        ? name!.trim()
        : (cleanPhone.isNotEmpty ? 'Unit $cleanPhone' : 'Rescue Operative');
    final cleanTeam = (teamName ?? '').trim();
    _userRole = role;
    _userPhone = cleanPhone;
    _userName = initialName;
    _teamId = null;
    _teamName = cleanTeam.isNotEmpty ? cleanTeam : initialName;
    _currentLat = null;
    _currentLng = null;
    _locationPermissionDenied = false;
    _locationStatusMessage = null;
    _incidents = [];
    _teams = [];
    _messages = [];
    _activeChatChannel = 'command-net';
    _shelters = [];
    _evacuees = [];
    _isAuthenticated = true;
    _isDemoMode = false;
    notifyListeners();
    _authenticateAndSync();
  }

  Future<void> _authenticateAndSync() async {
    if (_isDemoMode || !_isAuthenticated) return;
    try {
      final auth = await TacticalSyncService.loginRescueTeam(
        role: _userRole,
        phone: _userPhone,
        name: _userName,
        teamName: _teamName,
      );
      if (auth != null) {
        final userObj = auth['user'] as Map<String, dynamic>?;
        final teamObj = auth['team'] as Map<String, dynamic>?;
        final returnedTeamId =
            (auth['teamId'] ?? userObj?['teamId'] ?? teamObj?['id'])?.toString();
        final returnedTeamName = teamObj?['name']?.toString();
        final returnedRole =
            (auth['role'] ?? userObj?['role'])?.toString();
        final returnedName = userObj?['name']?.toString();

        if (returnedTeamId != null && returnedTeamId.isNotEmpty) {
          _teamId = returnedTeamId;
        }
        if (returnedTeamName != null && returnedTeamName.isNotEmpty) {
          _teamName = returnedTeamName;
        }
        if (returnedRole != null && returnedRole.isNotEmpty) {
          _userRole = returnedRole;
        }
        if (returnedName != null && returnedName.isNotEmpty) {
          _userName = returnedName;
        }
        notifyListeners();
      }
    } catch (_) {}
    TacticalSyncService.setTeamId(_teamId);
    await _initBackendSync();
  }

  void logout() {
    _isAuthenticated = false;
    _isDemoMode = false;
    _teamId = null;
    _teamName = '';
    _activeChatChannel = 'command-net';
    TacticalSyncService.setTeamId(null);
    _incidents = [];
    _teams = [];
    _messages = [];
    _activeChatChannel = 'command-net';
    _shelters = [];
    _evacuees = [];
    _telemetryTimer?.cancel();
    _telemetryTimer = null;
    _chatSyncTimer?.cancel();
    _chatSyncTimer = null;
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
      text: _isDemoMode
          ? 'EMERGENCY SOS ACTIVATED by $_userName at GPS 30.3165° N, 78.0322° E (Dehradun). Team Alpha dispatched!'
          : 'EMERGENCY SOS ACTIVATED by $_userName ($_userRole). Distress beacon transmitted to Command Center.',
      isAlert: true,
      isBot: true,
    );
    _messages.insert(0, alertMsg);

    if (!_isDemoMode) {
      Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high).then((pos) {
        _currentLat = pos.latitude;
        _currentLng = pos.longitude;
        TacticalSyncService.triggerSos(
          teamId: teamId,
          teamName: _userRole,
          operatorName: _userName,
          location: 'GPS: ${pos.latitude.toStringAsFixed(4)}°N, ${pos.longitude.toStringAsFixed(4)}°E',
          lat: pos.latitude,
          lng: pos.longitude,
          notes: 'EMERGENCY SOS ACTIVATED by $_userName ($_userRole)',
        );
      }).catchError((_) {
        TacticalSyncService.triggerSos(
          teamId: teamId,
          teamName: _userRole,
          operatorName: _userName,
          location: _currentLat != null && _currentLng != null
              ? 'GPS: ${_currentLat!.toStringAsFixed(4)}°N, ${_currentLng!.toStringAsFixed(4)}°E'
              : 'Live GPS unavailable',
          lat: _currentLat,
          lng: _currentLng,
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

  void setChatChannel(String channel) {
    final trimmed = channel.trim();
    if (trimmed.isEmpty || trimmed == _activeChatChannel) return;
    _activeChatChannel = trimmed;
    notifyListeners();
  }

  void addMessage(String text, {String? locationTag, String? channel}) {
    final cleanText = text.trim();
    if (cleanText.isEmpty) return;
    final targetChannel =
        (channel != null && channel.trim().isNotEmpty) ? channel.trim() : _activeChatChannel;
    final initials = _userName
        .trim()
        .split(RegExp(r'\s+'))
        .where((s) => s.isNotEmpty)
        .take(2)
        .map((s) => s[0].toUpperCase())
        .join();
    final newMsg = ChatMessage(
      id: 'MSG-${DateTime.now().millisecondsSinceEpoch}-${++_chatMsgSeq}',
      channel: targetChannel,
      sender: _userName,
      senderId: _teamId != null ? 'usr-$_teamId' : 'env-rescue',
      senderRole: 'rescue',
      initials: initials.isNotEmpty ? initials : 'RT',
      role: _userRole,
      time: 'Just now',
      text: cleanText,
      locationTag: locationTag,
      isMe: true,
    );
    _messages.add(newMsg);

    if (!_isDemoMode) {
      TacticalSyncService.sendChatMessage(
        id: newMsg.id,
        channel: targetChannel,
        sender: _userName,
        role: _userRole,
        text: cleanText,
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
    final coordsText = (_currentLat != null && _currentLng != null)
        ? '${_currentLat!.toStringAsFixed(4)}° N, ${_currentLng!.toStringAsFixed(4)}° E'
        : 'Awaiting GPS lock';
    final newIncident = Incident(
      id: 'INC-${_incidents.length + 101}',
      title: title,
      location: location,
      timestamp: 'Today · Just now',
      severity: severity,
      status: 'Active',
      teamAssigned: _userName,
      eta: 'Pending',
      affectedCount: 0,
      coordinates: _isDemoMode ? '30.5562° N, 79.5670° E' : coordsText,
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
        teamName: _userName,
        reporter: _userName,
        lat: _currentLat,
        lng: _currentLng,
      );
    }

    notifyListeners();
  }

  void updateIncidentStatus(String incidentId, String status, {String? notes}) {
    final normalizedBucket =
        status.toLowerCase() == 'resolved' ? 'Resolved' : 'Active';
    final index = _incidents.indexWhere((i) => i.id == incidentId);
    if (index != -1) {
      final existing = _incidents[index];
      _incidents[index] = existing.copyWith(
        status: normalizedBucket,
        backendStatus: status,
        substatus: notes ??
            (normalizedBucket == 'Resolved'
                ? 'Completed · Cleared by field team'
                : 'Status updated to $status'),
      );
    }

    if (!_isDemoMode) {
      TacticalSyncService.updateIncidentStatus(
        incidentId: incidentId,
        status: status,
        teamName: _teamName.isNotEmpty ? _teamName : _userName,
        notes: notes,
      );
    }

    notifyListeners();
  }

  // --- Real-Time Backend Synchronization ---
  Future<void> _initBackendSync() async {
    if (_isDemoMode) return;

    // 1. Initial Incidents Fetch
    try {
      final remoteIncidents = await TacticalSyncService.fetchIncidents();
      if (remoteIncidents.isNotEmpty) {
        final List<Incident> parsed = [];
        final existingIds = _incidents.map((i) => i.id).toSet();

        for (final item in remoteIncidents) {
          final inc = Incident.fromJson(item);
          if (!existingIds.contains(inc.id)) {
            parsed.add(inc);
            existingIds.add(inc.id);
          } else {
            // Update existing status
            final idx = _incidents.indexWhere((i) => i.id == inc.id);
            if (idx != -1) {
              _incidents[idx] = inc;
            }
          }
        }
        _incidents = [...parsed, ..._incidents];
        notifyListeners();
      }
    } catch (e) {
      print('[RescueApp Sync] Incidents sync error: $e');
    }

    // 2. Initial Chat Messages Fetch
    try {
      final remoteMsgs = await TacticalSyncService.fetchChatMessages();
      if (remoteMsgs.isNotEmpty) {
        final existingIds = _messages.map((m) => m.id).toSet();
        final List<ChatMessage> parsed = [];

        for (final item in remoteMsgs) {
          final msg = ChatMessage.fromJson(
            item,
            currentUserName: _userName,
            currentUserRole: 'rescue',
            currentTeamId: _teamId ?? '',
          );
          if (!existingIds.contains(msg.id)) {
            parsed.add(msg);
            existingIds.add(msg.id);
          }
        }
        _messages = [..._messages, ...parsed];
        notifyListeners();
      }
    } catch (e) {
      print('[RescueApp Sync] Chat sync error: $e');
    }

    // 2.5 Fetch Teams & Shelters from Backend
    try {
      final remoteTeams = await TacticalSyncService.fetchTeams();
      _teams = remoteTeams.map((t) {
        final coords = t['coordinates'] as Map<String, dynamic>?;
        final lat = (coords?['lat'] as num?)?.toDouble();
        final lng = (coords?['lng'] as num?)?.toDouble();
        final gpsStr = (lat != null && lng != null)
            ? '${lat.toStringAsFixed(4)}° N, ${lng.toStringAsFixed(4)}° E'
            : 'Awaiting GPS';
        final id = (t['id'] ?? '').toString();
        final name = (t['name'] ?? 'Rescue Unit').toString();
        return RescueTeam(
          id: id,
          name: name,
          sector: (t['sector'] ?? t['specialty'] ?? 'Field Sector').toString(),
          callsign: (t['callsign'] ?? id).toString(),
          frequency: (t['frequency'] ?? 'VHF 156.8').toString(),
          commanderName: (t['lead'] ?? t['commanderName'] ?? _userName).toString(),
          commanderPhone: (t['phone'] ?? _userPhone).toString(),
          commanderExperience: 'Active Field Unit',
          commanderBloodGroup: 'N/A',
          commanderAvatar: '',
          syncedCount: (t['personnel'] as num?)?.toInt() ?? 1,
          totalCount: (t['personnel'] as num?)?.toInt() ?? 1,
          status: (t['status'] ?? 'Deployed').toString(),
          members: [
            TeamMember(
              id: '$id-lead',
              name: (t['lead'] ?? name).toString(),
              role: (t['specialty'] ?? 'Field Operative').toString(),
              specialty: (t['specialty'] ?? 'SAR').toString(),
              batteryLevel: (t['battery'] as num?)?.toInt() ?? 100,
              status: (t['status'] ?? 'Deployed').toString(),
              distance: 'Live',
              gpsCoords: gpsStr,
              avatarUrl: '',
              bloodGroup: 'N/A',
            ),
          ],
        );
      }).toList();
      notifyListeners();
    } catch (_) {}

    try {
      final remoteShelters = await TacticalSyncService.fetchShelters();
      _shelters = remoteShelters.map((s) {
        return Shelter(
          id: (s['id'] ?? '').toString(),
          name: (s['name'] ?? 'Relief Shelter').toString(),
          location: (s['sector'] ?? s['location'] ?? '').toString(),
          capacity: (s['capacity'] as num?)?.toInt() ?? 100,
          occupied: (s['occupied'] as num?)?.toInt() ?? 0,
          distance: 'Active',
          amenities: (s['amenities'] ?? 'Medical, Food, Water').toString(),
          hasMedical: true,
        );
      }).toList();
      notifyListeners();
    } catch (_) {}

    // 3. Connect Real-Time WebSocket Event Stream
    TacticalSyncService.connectRealtime(
      teamId: teamId,
      role: _userRole,
      name: _userName,
      onEvent: (event) {
        _handleRealtimeEvent(event);
      },
    );

    // 4. Start GPS telemetry loop — sends real position to backend every 30s
    _telemetryTimer?.cancel();
    _telemetryTimer = Timer.periodic(const Duration(seconds: 30), (_) => _sendGpsTelemetry());
    _sendGpsTelemetry(); // Send immediately on connect

    // 5. Start real-time chat background sync loop (every 5 seconds)
    _chatSyncTimer?.cancel();
    _chatSyncTimer = Timer.periodic(const Duration(seconds: 5), (_) => _syncChatMessages());
  }

  /// Syncs chat messages periodically from the backend for guaranteed real-time delivery
  Future<void> _syncChatMessages() async {
    if (_isDemoMode || !_isAuthenticated) return;
    try {
      final remoteMsgs = await TacticalSyncService.fetchChatMessages();
      if (remoteMsgs.isNotEmpty) {
        bool changed = false;
        for (final item in remoteMsgs) {
          final msg = ChatMessage.fromJson(
            item,
            currentUserName: _userName,
            currentUserRole: 'rescue',
            currentTeamId: _teamId ?? '',
          );
          final exists = _messages.any((m) => m.id == msg.id);
          if (!exists) {
            _messages.add(msg);
            changed = true;
          }
        }
        if (changed) {
          notifyListeners();
        }
      }
    } catch (_) {}
  }

  void _handleRealtimeEvent(Map<String, dynamic> event) {
    if (_isDemoMode) return;

    final eventType = event['event']?.toString() ?? event['type']?.toString();
    final data = (event['data'] ?? event) as Map<String, dynamic>;

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
    } else if (eventType == 'incident_verified') {
      try {
        final rawInc = (data['incident'] ?? data) as Map<String, dynamic>;
        final inc = Incident.fromJson(rawInc);
        final idx = _incidents.indexWhere((i) => i.id == inc.id);
        if (idx != -1) {
          _incidents[idx] = inc;
        } else {
          _incidents.insert(0, inc);
        }
        notifyListeners();
      } catch (err) {
        print('[RescueApp Sync] Error handling incident_verified: $err');
      }
    } else if (eventType == 'incident_assigned') {
      try {
        final targetId = (data['incidentId'] ?? data['incident']?['id'])?.toString();
        final assignedTid = (data['teamId'] ?? data['incident']?['assignedTeamId'])?.toString();
        final teamName = (data['teamName'] ?? data['incident']?['assignedTeam'])?.toString() ?? 'Assigned Unit';
        final eta = (data['eta'] ?? data['incident']?['eta'])?.toString() ?? '10 min';

        Incident? updatedInc;
        if (data['incident'] is Map<String, dynamic>) {
          updatedInc = Incident.fromJson(data['incident'] as Map<String, dynamic>);
        }

        final idx = _incidents.indexWhere((i) => i.id == targetId);
        if (updatedInc != null) {
          if (idx != -1) {
            _incidents[idx] = updatedInc;
          } else {
            _incidents.insert(0, updatedInc);
          }
        } else if (idx != -1) {
          _incidents[idx] = _incidents[idx].copyWith(
            teamAssigned: teamName,
            assignedTeamId: assignedTid,
            backendStatus: 'Responding',
            status: 'Active',
            eta: eta,
            substatus: '$teamName dispatched · ETA $eta',
          );
          updatedInc = _incidents[idx];
        }

        final isForMe = (assignedTid != null && assignedTid.isNotEmpty && assignedTid == _teamId) ||
            (updatedInc != null &&
                updatedInc.isAssignedTo(
                  teamId: _teamId,
                  teamName: _teamName,
                  userName: _userName,
                )) ||
            teamName.toLowerCase() == _teamName.trim().toLowerCase();

        _messages.add(
          ChatMessage(
            id: 'DISP-${DateTime.now().millisecondsSinceEpoch}',
            sender: 'COMMAND DISPATCH',
            initials: 'HQ',
            role: isForMe ? 'ASSIGNED TO YOUR TEAM' : 'DISPATCH ORDER',
            time: 'Just now',
            text: isForMe
                ? '🚨 MISSION ASSIGNED TO YOUR UNIT ($teamName): Incident $targetId (${updatedInc?.title ?? ''}) · ETA $eta. Open Mission Details now.'
                : '📋 DISPATCH ORDER: Incident $targetId assigned to $teamName · ETA $eta.',
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
        final rawInc = data['incident'];
        if (rawInc is Map<String, dynamic>) {
          final parsed = Incident.fromJson(rawInc);
          final idx = _incidents.indexWhere((i) => i.id == parsed.id);
          if (idx != -1) {
            _incidents[idx] = parsed;
          } else {
            _incidents.insert(0, parsed);
          }
          notifyListeners();
          return;
        }
        final targetId = data['incidentId']?.toString();
        final newStatus = data['status']?.toString() ?? 'Active';
        final notes = data['notes']?.toString();

        final idx = _incidents.indexWhere((i) => i.id == targetId);
        if (idx != -1) {
          _incidents[idx] = _incidents[idx].copyWith(
            status: newStatus.toLowerCase() == 'resolved' ? 'Resolved' : 'Active',
            backendStatus: newStatus,
            substatus: notes ?? 'Status updated to $newStatus',
          );
          notifyListeners();
        }
      } catch (_) {}
    } else if (eventType == 'new_chat_message') {
      try {
        final rawMsg = (data['message'] ?? data) as Map<String, dynamic>;
        final msgData = Map<String, dynamic>.from(rawMsg);
        if (data['channel'] != null) {
          msgData['channel'] ??= data['channel'];
        }
        final msg = ChatMessage.fromJson(
          msgData,
          currentUserName: _userName,
          currentUserRole: 'rescue',
          currentTeamId: _teamId ?? '',
        );

        final exists = _messages.any((m) => m.id == msg.id);
        if (!exists) {
          _messages.add(msg);
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
          final msg = ChatMessage.fromJson(
            raw as Map<String, dynamic>,
            currentUserName: _userName,
            currentUserRole: 'rescue',
            currentTeamId: _teamId ?? '',
          );
          if (!_messages.any((m) => m.id == msg.id)) {
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

  Future<void> _refreshBatteryLevel() async {
    try {
      final level = await _batteryChannel.invokeMethod<int>('getBatteryLevel');
      if (level != null && level >= 0 && level <= 100) {
        _currentBattery = level;
      }
    } catch (_) {
      // Platform channel unavailable on non-Android hosts
    }
  }

  /// Sends real GPS + battery telemetry to backend every 30 seconds
  Future<void> _sendGpsTelemetry() async {
    if (_isDemoMode || !_isAuthenticated) return;
    if (teamId.isEmpty) return;

    await _refreshBatteryLevel();

    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        _locationPermissionDenied = true;
        _locationStatusMessage = 'Location services disabled.';
        notifyListeners();
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied && !_gpsPermissionRequested) {
        _gpsPermissionRequested = true;
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        _locationPermissionDenied = true;
        _locationStatusMessage = permission == LocationPermission.deniedForever
            ? 'Location permission permanently denied in system settings.'
            : 'Location permission denied.';
        notifyListeners();
        return;
      }

      _locationPermissionDenied = false;
      _locationStatusMessage = null;

      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      ).timeout(const Duration(seconds: 5));
      _currentLat = pos.latitude;
      _currentLng = pos.longitude;

      final telemetryStatus = _sosActive
          ? 'SOS'
          : (assignedIncidents.isNotEmpty ? 'Deployed' : 'Available');

      if (_teams.isNotEmpty) {
        final idx = _teams.indexWhere((t) => t.id == teamId);
        final targetIdx = idx != -1 ? idx : 0;
        final t = _teams[targetIdx];
        final updatedMembers = t.members.map((m) {
          return TeamMember(
            id: m.id,
            name: m.name,
            role: m.role,
            specialty: m.specialty,
            batteryLevel: _currentBattery,
            status: _sosActive
                ? 'SOS Active'
                : (assignedIncidents.isNotEmpty ? 'Active On-Site' : 'Available'),
            distance: 'Current Device',
            gpsCoords: '${pos.latitude.toStringAsFixed(4)}° N, ${pos.longitude.toStringAsFixed(4)}° E',
            avatarUrl: m.avatarUrl,
            bloodGroup: m.bloodGroup,
          );
        }).toList();

        _teams[targetIdx] = RescueTeam(
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
          status: telemetryStatus,
          members: updatedMembers,
        );
        notifyListeners();
      }

      await TacticalSyncService.sendTelemetry(
        teamId: teamId,
        lat: pos.latitude,
        lng: pos.longitude,
        battery: _currentBattery,
        status: telemetryStatus,
      );
      print('[AppState GPS] Telemetry: ${pos.latitude.toStringAsFixed(4)}, ${pos.longitude.toStringAsFixed(4)}');
    } catch (e) {
      _locationStatusMessage = 'Unable to acquire GPS fix: $e';
      notifyListeners();
      if (_currentLat != null && _currentLng != null) {
        final telemetryStatus = _sosActive
            ? 'SOS'
            : (assignedIncidents.isNotEmpty ? 'Deployed' : 'Available');
        try {
          await TacticalSyncService.sendTelemetry(
            teamId: teamId,
            lat: _currentLat!,
            lng: _currentLng!,
            battery: _currentBattery,
            status: telemetryStatus,
          );
        } catch (__) {}
      }
    }
  }
}
