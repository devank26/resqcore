import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'incident.dart';
import 'team_member.dart';
import 'chat_message.dart';
import 'shelter_model.dart';
import '../services/tactical_storage_service.dart';
import '../services/tactical_sync_service.dart';

class AppState extends ChangeNotifier {
  static const MethodChannel _batteryChannel =
      MethodChannel('com.resqcore.rescue/battery');

  bool _isHydrated = false;
  bool _restoreStarted = false;
  Future<void> _persistChain = Future.value();
  Timer? _persistTimer;

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
  List<Map<String, dynamic>> _volunteers = [];

  // Getters
  bool get isHydrated => _isHydrated;
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

  List<Incident> get chatEligibleIncidents {
    final idsWithMessages = _messages
        .map((m) => m.channel)
        .where((c) => c.startsWith('incident-'))
        .map((c) => c.substring('incident-'.length))
        .toSet();
    final combined = <Incident>[];
    final seen = <String>{};
    for (final inc in assignedIncidents) {
      if (seen.add(inc.id)) combined.add(inc);
    }
    for (final inc in _incidents) {
      if (idsWithMessages.contains(inc.id) &&
          inc.isAssignedTo(
            teamId: _teamId,
            teamName: _teamName,
            userName: _userName,
          ) &&
          seen.add(inc.id)) {
        combined.add(inc);
      }
    }
    return combined;
  }

  Incident? activeIncidentForChannel(String channel) {
    if (!channel.startsWith('incident-')) return null;
    final incId = channel.substring('incident-'.length).trim();
    for (final inc in _incidents) {
      if (inc.id == incId) return inc;
    }
    return null;
  }

  List<ChatMessage> get activeChannelMessages => _isDemoMode
      ? _messages
          .where((m) =>
              (_activeChatChannel == 'command-net' &&
                  (m.isBot || m.channel == 'command-net')) ||
              m.channel == _activeChatChannel)
          .toList()
      : _messages
          .where((m) =>
              (_activeChatChannel == 'command-net' && m.isBot) ||
              m.channel == _activeChatChannel)
          .toList();
  List<Shelter> get shelters => _shelters;
  List<Evacuee> get evacuees => _evacuees;
  List<Map<String, dynamic>> get volunteers => _volunteers;

  bool isVolunteerAssignable(Map<String, dynamic> v) {
    final status = (v['status'] ?? '').toString().trim();
    final assignedInc = (v['assignedIncidentId'] ?? '').toString().trim();
    final assignedTeam =
        (v['assignedTeamId'] ?? v['teamId'] ?? '').toString().trim();
    return (status == 'Available' || status == 'Active') &&
        assignedInc.isEmpty &&
        assignedTeam.isEmpty;
  }

  bool isVolunteerAssignedToCurrentTeam(Map<String, dynamic> v) {
    final vTeamId = (v['assignedTeamId'] ?? v['teamId'] ?? '').toString().trim();
    final vTeamName = (v['assignedTeamName'] ?? '').toString().trim();
    final vIncId = (v['assignedIncidentId'] ?? '').toString().trim();
    if (vTeamId.isEmpty && vIncId.isEmpty) return false;
    if (_teamId != null && _teamId!.isNotEmpty && vTeamId.isNotEmpty) {
      return vTeamId == _teamId;
    }
    if (vTeamName.isNotEmpty && _teamName.isNotEmpty) {
      return vTeamName.toLowerCase() == _teamName.toLowerCase();
    }
    if (vTeamName.isNotEmpty && _userName.isNotEmpty) {
      return vTeamName.toLowerCase() == _userName.toLowerCase();
    }
    return false;
  }

  List<Map<String, dynamic>> volunteersForIncident(String incidentId) =>
      _volunteers
          .where((v) => (v['assignedIncidentId'] ?? '').toString() == incidentId)
          .toList();

  static List<Map<String, dynamic>> _mockVolunteers() => [
        {
          'id': 'VOL-MOCK-01',
          'name': 'Dr. Meera Rawat',
          'phone': '+91 9876543210',
          'skills': ['First Aid / Medical', 'Triage'],
          'status': 'Available',
          'assignedTask': 'Available for Deployment',
          'teamId': null,
          'assignedTeamId': null,
          'assignedTeamName': null,
          'assignedIncidentId': null,
        },
        {
          'id': 'VOL-MOCK-02',
          'name': 'Arjun Negi',
          'phone': '+91 9811223344',
          'skills': ['Search & Rescue', 'Heavy Lifting'],
          'status': 'Active',
          'assignedTask': 'Available for Deployment',
          'teamId': null,
          'assignedTeamId': null,
          'assignedTeamName': null,
          'assignedIncidentId': null,
        },
        {
          'id': 'VOL-MOCK-03',
          'name': 'Kiran Bist',
          'phone': '+91 9911002233',
          'skills': ['Logistics', 'Comms', 'Driving'],
          'status': 'Available',
          'assignedTask': 'Available for Deployment',
          'teamId': null,
          'assignedTeamId': null,
          'assignedTeamName': null,
          'assignedIncidentId': null,
        },
        {
          'id': 'VOL-MOCK-04',
          'name': 'Suresh Joshi',
          'phone': '+91 9711223300',
          'skills': ['Translation', 'Shelter Support'],
          'status': 'Resting',
          'assignedTask': 'Off-Shift Recovery',
          'teamId': null,
          'assignedTeamId': null,
          'assignedTeamName': null,
          'assignedIncidentId': null,
        },
      ];

  int get affectedTotal => _isDemoMode
      ? 247
      : _incidents.fold<int>(0, (sum, i) => sum + i.affectedCount);
  int get rescuedTotal => _isDemoMode
      ? _evacuees.where((e) => e.status == 'Rescued').length * 47 + 1
      : _evacuees.where((e) => e.status == 'Rescued').length;
  int get missingTotal => _isDemoMode
      ? _evacuees.where((e) => e.status == 'Missing').length * 7
      : _evacuees.where((e) => e.status == 'Missing').length;

  Future<void> restorePersistedState() async {
    if (_restoreStarted) return;
    _restoreStarted = true;
    try {
      final saved = await TacticalStorageService.loadState();
      if (saved != null && saved['isAuthenticated'] == true) {
        _userRole = (saved['userRole'] ?? 'rescue').toString();
        _userName = (saved['userName'] ?? '').toString();
        _userPhone = (saved['userPhone'] ?? '').toString();
        final savedTeamId = (saved['teamId'] ?? '').toString().trim();
        _teamId = savedTeamId.isNotEmpty ? savedTeamId : null;
        _teamName = (saved['teamName'] ?? '').toString();
        _isDemoMode = saved['isDemoMode'] == true;
        final tabRaw = (saved['activeTabIndex'] as num?)?.toInt() ?? 0;
        _activeTabIndex = tabRaw.clamp(0, 5);
        _activeChatChannel =
            (saved['activeChatChannel'] ?? 'command-net').toString();
        _nightOpsEnabled = saved['nightOpsEnabled'] != false;
        _sosActive = saved['sosActive'] == true;
        _currentLat = (saved['currentLat'] as num?)?.toDouble();
        _currentLng = (saved['currentLng'] as num?)?.toDouble();

        final savedToken = (saved['authToken'] ?? '').toString().trim();
        TacticalSyncService.setAuthToken(savedToken);
        TacticalSyncService.setTeamId(_teamId);

        _incidents = _decodeList(saved['incidents'], Incident.fromJson);
        _teams = _decodeList(
          saved['teams'],
          (m) => RescueTeam.fromJson(
            m,
            fallbackCommander: _userName,
            fallbackPhone: _userPhone,
          ),
        );
        _messages = _decodeList(
          saved['messages'],
          (m) => ChatMessage.fromJson(
            m,
            currentUserName: _userName,
            currentUserRole: 'rescue',
            currentTeamId: _teamId ?? '',
          ),
        );
        _shelters = _decodeList(saved['shelters'], Shelter.fromJson);
        _evacuees = _decodeList(saved['evacuees'], Evacuee.fromJson);
        final savedVols = saved['volunteers'];
        if (savedVols is List) {
          _volunteers = savedVols
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        } else {
          _volunteers = await TacticalStorageService.loadVolunteers();
        }
        _isAuthenticated = true;
      }
    } catch (_) {}

    _isHydrated = true;
    notifyListeners();

    if (_isAuthenticated && !_isDemoMode) {
      unawaited(_resumeAuthenticatedSession());
    }
  }

  List<T> _decodeList<T>(dynamic raw, T Function(Map<String, dynamic>) parse) {
    if (raw is! List) return [];
    final out = <T>[];
    for (final item in raw) {
      if (item is Map) {
        try {
          out.add(parse(Map<String, dynamic>.from(item)));
        } catch (_) {}
      }
    }
    return out;
  }

  Future<void> _resumeAuthenticatedSession() async {
    final valid = await TacticalSyncService.verifySession();
    if (valid == false) {
      // Ephemeral/expired token from an earlier backend instance: re-auth silently
      await _authenticateAndSync();
      return;
    }
    await _initBackendSync();
  }

  Map<String, dynamic> _serializeState() => {
        'isAuthenticated': _isAuthenticated,
        'isDemoMode': _isDemoMode,
        'authToken': TacticalSyncService.authToken,
        'userRole': _userRole,
        'userName': _userName,
        'userPhone': _userPhone,
        'teamId': _teamId ?? '',
        'teamName': _teamName,
        'activeTabIndex': _activeTabIndex,
        'activeChatChannel': _activeChatChannel,
        'nightOpsEnabled': _nightOpsEnabled,
        'sosActive': _sosActive,
        if (_currentLat != null) 'currentLat': _currentLat,
        if (_currentLng != null) 'currentLng': _currentLng,
        'incidents': _incidents.map((i) => i.toJson()).toList(),
        'teams': _teams.map((t) => t.toJson()).toList(),
        'messages': _messages.map((m) => m.toJson()).toList(),
        'shelters': _shelters.map((s) => s.toJson()).toList(),
        'evacuees': _evacuees.map((e) => e.toJson()).toList(),
        'volunteers': _volunteers,
      };

  void _persistNow() {
    _persistTimer?.cancel();
    if (!_isAuthenticated) return;
    final snapshot = _serializeState();
    final volSnapshot =
        _volunteers.map((v) => Map<String, dynamic>.from(v)).toList();
    _persistChain = _persistChain.then((_) async {
      await TacticalStorageService.saveState(snapshot);
      await TacticalStorageService.saveVolunteers(volSnapshot);
    });
  }

  void _schedulePersist() {
    if (!_isAuthenticated) return;
    _persistTimer?.cancel();
    _persistTimer = Timer(const Duration(milliseconds: 120), _persistNow);
  }

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
    if (_incidents.isNotEmpty) {
      final demoInc = assignedIncidents.isNotEmpty ? assignedIncidents.first : _incidents.first;
      _messages.add(
        ChatMessage(
          id: 'DEMO-CIT-${demoInc.id}',
          channel: 'incident-${demoInc.id}',
          sender: demoInc.citizenName ?? 'Citizen Reporter',
          senderRole: 'citizen',
          initials: 'CT',
          role: 'Citizen',
          time: 'Just now',
          text: 'Hello Team Alpha, we are waiting on the 2nd floor near ${demoInc.location}. How soon can your unit reach us?',
          isMe: false,
        ),
      );
    }
    _shelters = Shelter.mockShelters();
    _evacuees = Evacuee.mockEvacuees();
    _volunteers = _mockVolunteers();
    _isAuthenticated = true;
    _isDemoMode = true; // DEMO MODE ACTIVE - Offline simulated mode untouched
    notifyListeners();
    _persistNow();
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
    _volunteers = [];
    _isAuthenticated = true;
    _isDemoMode = false;
    notifyListeners();
    _persistNow();
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
        _persistNow();
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
    _activeTabIndex = 0;
    _activeChatChannel = 'command-net';
    TacticalSyncService.setAuthToken(null);
    TacticalSyncService.setTeamId(null);
    _incidents = [];
    _teams = [];
    _messages = [];
    _shelters = [];
    _evacuees = [];
    _volunteers = [];
    _telemetryTimer?.cancel();
    _telemetryTimer = null;
    _chatSyncTimer?.cancel();
    _chatSyncTimer = null;
    _persistTimer?.cancel();
    TacticalSyncService.disconnectRealtime();
    unawaited(TacticalStorageService.clearState());
    unawaited(TacticalStorageService.saveVolunteers([]));
    notifyListeners();
  }

  void setTabIndex(int index) {
    _activeTabIndex = index;
    notifyListeners();
    _schedulePersist();
  }

  void toggleNightOps() {
    _nightOpsEnabled = !_nightOpsEnabled;
    notifyListeners();
    _schedulePersist();
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
    _persistNow();
  }

  void cancelSos() {
    _sosActive = false;
    notifyListeners();
    _persistNow();
  }

  void setChatChannel(String channel) {
    final trimmed = channel.trim();
    if (trimmed.isEmpty) return;
    if (trimmed != _activeChatChannel) {
      _activeChatChannel = trimmed;
      notifyListeners();
      _schedulePersist();
    }
    if (!_isDemoMode && _isAuthenticated) {
      _syncChatMessages();
    }
  }

  void selectActiveTeam(RescueTeam team) {
    _teamId = team.id;
    _teamName = team.name;
    TacticalSyncService.setTeamId(team.id);
    notifyListeners();
    _persistNow();
    if (!_isDemoMode && !team.id.startsWith('LOCAL-TEAM-')) {
      _refreshTeamSession(team);
    }
  }

  Future<void> _refreshTeamSession(RescueTeam team) async {
    try {
      final auth = await TacticalSyncService.loginRescueTeam(
        role: _userRole,
        phone: _userPhone,
        name: _userName,
        teamName: team.name,
        callsign: team.callsign,
        teamId: team.id,
      );
      if (auth != null && auth['success'] == true) {
        _schedulePersist();
        TacticalSyncService.connectRealtime(
          teamId: team.id,
          role: _userRole,
          name: _userName,
          onEvent: _handleRealtimeEvent,
        );
        await _syncChatMessages();
      }
    } catch (_) {}
  }

  Future<({bool ok, bool offline, String? error, RescueTeam? team})> createRescueTeam({
    required String name,
    String? callsign,
    String specialization = 'SAR',
    int responders = 4,
    String? sector,
    String? commanderName,
    String? commanderPhone,
    String? frequency,
    bool setAsActive = false,
  }) async {
    final cleanName = name.trim();
    if (cleanName.isEmpty) {
      return (ok: false, offline: false, error: 'Team name is required.', team: null);
    }
    final duplicate = _teams.any(
      (t) => t.name.trim().toLowerCase() == cleanName.toLowerCase(),
    );
    if (duplicate) {
      return (
        ok: false,
        offline: false,
        error: 'A team named "$cleanName" already exists.',
        team: null,
      );
    }

    final resolvedCallsign = (callsign != null && callsign.trim().isNotEmpty)
        ? callsign.trim().toUpperCase()
        : cleanName.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]+'), '-');
    final resolvedCommander =
        (commanderName != null && commanderName.trim().isNotEmpty)
            ? commanderName.trim()
            : (_userName.isNotEmpty ? _userName : cleanName);
    final resolvedPhone =
        (commanderPhone != null && commanderPhone.trim().isNotEmpty)
            ? commanderPhone.trim()
            : _userPhone;
    final resolvedFrequency =
        (frequency != null && frequency.trim().isNotEmpty)
            ? frequency.trim()
            : 'Ch 4A (156.8MHz)';
    final resolvedSector = (sector != null && sector.trim().isNotEmpty)
        ? sector.trim()
        : specialization;

    if (_isDemoMode) {
      final demoTeam = RescueTeam(
        id: 'TEAM-${DateTime.now().millisecondsSinceEpoch}',
        name: cleanName,
        sector: resolvedSector,
        callsign: resolvedCallsign,
        frequency: resolvedFrequency,
        commanderName: resolvedCommander,
        commanderPhone: resolvedPhone,
        commanderExperience: 'Active Field Unit',
        commanderBloodGroup: 'O+',
        commanderAvatar: '',
        syncedCount: responders,
        totalCount: responders,
        status: 'Available',
        members: [
          TeamMember(
            id: 'MEM-${DateTime.now().millisecondsSinceEpoch}',
            name: resolvedCommander,
            role: 'Team Commander',
            specialty: specialization,
            batteryLevel: _currentBattery,
            status: 'Available',
            distance: 'Staging',
            gpsCoords: _currentLat != null && _currentLng != null
                ? '${_currentLat!.toStringAsFixed(4)}° N, ${_currentLng!.toStringAsFixed(4)}° E'
                : 'Awaiting GPS',
            avatarUrl: '',
            bloodGroup: 'N/A',
          ),
        ],
      );
      _teams.add(demoTeam);
      if (setAsActive) {
        _teamId = demoTeam.id;
        _teamName = demoTeam.name;
      }
      notifyListeners();
      _persistNow();
      return (ok: true, offline: false, error: null, team: demoTeam);
    }

    final res = await TacticalSyncService.createTeam(
      name: cleanName,
      callsign: resolvedCallsign,
      specialization: specialization,
      responders: responders,
      sector: sector,
      commanderName: resolvedCommander,
      commanderPhone: resolvedPhone,
      frequency: resolvedFrequency,
      lat: _currentLat,
      lng: _currentLng,
    );

    if (res['success'] == true && res['team'] is Map) {
      final created = RescueTeam.fromJson(
        Map<String, dynamic>.from(res['team'] as Map),
        fallbackCommander: resolvedCommander,
        fallbackPhone: resolvedPhone,
      );
      _upsertTeam(created);
      if (setAsActive) {
        _teamId = created.id;
        _teamName = created.name;
        TacticalSyncService.setTeamId(created.id);
        _refreshTeamSession(created);
      }
      notifyListeners();
      _persistNow();
      return (ok: true, offline: false, error: null, team: created);
    }

    if (res['networkError'] == true) {
      final localId = 'LOCAL-TEAM-${DateTime.now().millisecondsSinceEpoch}';
      final localTeam = RescueTeam(
        id: localId,
        name: cleanName,
        sector: resolvedSector,
        callsign: resolvedCallsign,
        frequency: resolvedFrequency,
        commanderName: resolvedCommander,
        commanderPhone: resolvedPhone,
        commanderExperience: 'Queued for Sync',
        commanderBloodGroup: 'N/A',
        commanderAvatar: '',
        syncedCount: responders,
        totalCount: responders,
        status: 'Available',
        members: [
          TeamMember(
            id: '$localId-lead',
            name: resolvedCommander,
            role: specialization,
            specialty: specialization,
            batteryLevel: _currentBattery,
            status: 'Available',
            distance: 'Local',
            gpsCoords: _currentLat != null && _currentLng != null
                ? '${_currentLat!.toStringAsFixed(4)}° N, ${_currentLng!.toStringAsFixed(4)}° E'
                : 'Awaiting GPS',
            avatarUrl: '',
            bloodGroup: 'N/A',
          ),
        ],
      );
      _upsertTeam(localTeam);
      if (setAsActive) {
        _teamId = localId;
        _teamName = localTeam.name;
        TacticalSyncService.setTeamId(localId);
      }
      await TacticalStorageService.enqueuePendingOp({
        'op': 'create_team',
        'localId': localId,
        'setAsActive': setAsActive,
        'payload': {
          'name': cleanName,
          'callsign': resolvedCallsign,
          'specialization': specialization,
          'responders': responders,
          'sector': sector,
          'commanderName': resolvedCommander,
          'commanderPhone': resolvedPhone,
          'frequency': resolvedFrequency,
          if (_currentLat != null) 'lat': _currentLat,
          if (_currentLng != null) 'lng': _currentLng,
        },
      });
      notifyListeners();
      _persistNow();
      return (ok: true, offline: true, error: null, team: localTeam);
    }

    return (
      ok: false,
      offline: false,
      error: (res['error'] ?? 'Failed to create team.').toString(),
      team: null,
    );
  }

  void _upsertTeam(RescueTeam team) {
    final idx = _teams.indexWhere(
      (t) =>
          t.id == team.id ||
          t.name.trim().toLowerCase() == team.name.trim().toLowerCase(),
    );
    if (idx != -1) {
      _teams[idx] = team;
    } else {
      _teams.add(team);
    }
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
    notifyListeners();
    _persistNow();

    if (!_isDemoMode) {
      TacticalSyncService.sendChatMessage(
        id: newMsg.id,
        channel: targetChannel,
        sender: _userName,
        role: _userRole,
        text: cleanText,
        locationTag: locationTag,
      ).then((sent) {
        if (!sent) {
          TacticalStorageService.enqueuePendingOp({
            'op': 'send_chat',
            'payload': {
              'id': newMsg.id,
              'channel': targetChannel,
              'sender': _userName,
              'role': _userRole,
              'text': cleanText,
              'locationTag': locationTag,
            },
          });
        }
      });
    }
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
    final localId = 'LOCAL-INC-${DateTime.now().millisecondsSinceEpoch}';
    final newIncident = Incident(
      id: _isDemoMode ? 'INC-${_incidents.length + 101}' : localId,
      title: title,
      location: location,
      timestamp: 'Today · Just now',
      severity: severity,
      status: 'Active',
      teamAssigned: _teamName.isNotEmpty ? _teamName : _userName,
      assignedTeamId: _teamId,
      eta: 'Pending',
      affectedCount: 0,
      coordinates: _isDemoMode ? '30.5562° N, 79.5670° E' : coordsText,
      lat: _currentLat,
      lng: _currentLng,
      description: description,
      substatus: 'Immediate triage in progress',
      photoAssetPath: photoAssetPath ?? 'assets/images/scenarios/earthquake_rubble_collapse.png',
    );
    _incidents.insert(0, newIncident);
    notifyListeners();
    _persistNow();

    if (!_isDemoMode) {
      TacticalSyncService.reportIncident(
        title: title,
        location: location,
        severity: severity,
        description: description,
        teamName: _teamName.isNotEmpty ? _teamName : _userName,
        reporter: _userName,
        lat: _currentLat,
        lng: _currentLng,
      ).then((res) {
        final rawInc = res?['incident'];
        if (rawInc is Map) {
          final synced = Incident.fromJson(Map<String, dynamic>.from(rawInc));
          final idx = _incidents.indexWhere((i) => i.id == localId);
          if (idx != -1) {
            if (_incidents.any((i) => i.id == synced.id)) {
              _incidents.removeAt(idx);
            } else {
              _incidents[idx] = synced;
            }
            notifyListeners();
            _persistNow();
          }
        } else if (res == null) {
          TacticalStorageService.enqueuePendingOp({
            'op': 'report_incident',
            'localId': localId,
            'payload': {
              'title': title,
              'location': location,
              'severity': severity,
              'description': description,
              'teamName': _teamName.isNotEmpty ? _teamName : _userName,
              'reporter': _userName,
              if (_currentLat != null) 'lat': _currentLat,
              if (_currentLng != null) 'lng': _currentLng,
            },
          });
        }
      });
    }
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
    if (normalizedBucket == 'Resolved') {
      _releaseLocalVolunteersForIncident(incidentId);
    }
    notifyListeners();
    _persistNow();

    if (!_isDemoMode) {
      TacticalSyncService.updateIncidentStatus(
        incidentId: incidentId,
        status: status,
        teamName: _teamName.isNotEmpty ? _teamName : _userName,
        notes: notes,
      ).then((ok) {
        if (!ok && !incidentId.startsWith('LOCAL-INC-')) {
          TacticalStorageService.enqueuePendingOp({
            'op': 'update_incident',
            'payload': {
              'incidentId': incidentId,
              'status': status,
              'teamName': _teamName.isNotEmpty ? _teamName : _userName,
              'notes': notes,
            },
          });
        }
      });
    }
  }

  void _upsertVolunteer(Map<String, dynamic> raw) {
    final copy = Map<String, dynamic>.from(raw);
    final id = (copy['id'] ?? '').toString();
    if (id.isEmpty) return;
    final idx = _volunteers.indexWhere((v) => (v['id'] ?? '').toString() == id);
    if (idx != -1) {
      _volunteers[idx] = copy;
    } else {
      _volunteers.insert(0, copy);
    }
  }

  bool _releaseLocalVolunteersForIncident(String incidentId) {
    bool changed = false;
    for (int i = 0; i < _volunteers.length; i++) {
      final v = _volunteers[i];
      if ((v['assignedIncidentId'] ?? '').toString() == incidentId) {
        _volunteers[i] = {
          ...v,
          'status': 'Available',
          'teamId': null,
          'assignedTeamId': null,
          'assignedTeamName': null,
          'assignedIncidentId': null,
          'assignedAt': null,
          'assignedTask': 'Available for Deployment',
        };
        changed = true;
      }
    }
    return changed;
  }

  Future<void> fetchVolunteers() async {
    if (_isDemoMode) return;
    final remote = await TacticalSyncService.fetchVolunteers();
    if (remote != null) {
      final localOnly = _volunteers
          .where((v) => (v['id'] ?? '').toString().startsWith('LOCAL-VOL-'))
          .toList();
      _volunteers = remote.map((e) => Map<String, dynamic>.from(e)).toList();
      for (final local in localOnly) {
        _upsertVolunteer(local);
      }
      notifyListeners();
      _schedulePersist();
    }
  }

  Future<Map<String, dynamic>> registerVolunteer({
    required String name,
    required String phone,
    required List<String> skills,
    String status = 'Available',
  }) async {
    if (_isDemoMode) {
      final demoVol = <String, dynamic>{
        'id': 'VOL-DEMO-${DateTime.now().millisecondsSinceEpoch}',
        'name': name,
        'phone': phone,
        'skills': skills,
        'status': status,
        'assignedTask': 'Available for Deployment',
        'teamId': null,
        'assignedTeamId': null,
        'assignedTeamName': null,
        'assignedIncidentId': null,
      };
      _upsertVolunteer(demoVol);
      notifyListeners();
      _persistNow();
      return {'success': true, 'volunteer': demoVol};
    }

    try {
      final res = await TacticalSyncService.registerVolunteer(
        name: name,
        phone: phone,
        skills: skills,
        status: status,
      );
      if (res != null) {
        if (res['volunteer'] is Map) {
          _upsertVolunteer(Map<String, dynamic>.from(res['volunteer'] as Map));
          notifyListeners();
          _persistNow();
        }
        unawaited(fetchVolunteers());
        return {'success': true, ...res};
      }
    } catch (_) {}

    final localVolunteer = <String, dynamic>{
      'id': 'LOCAL-VOL-${DateTime.now().millisecondsSinceEpoch}',
      'name': name,
      'phone': phone,
      'skills': skills,
      'status': status,
      'assignedTask': 'Pending Sync',
      'teamId': null,
      'assignedTeamId': null,
      'assignedTeamName': null,
      'assignedIncidentId': null,
    };
    _upsertVolunteer(localVolunteer);
    notifyListeners();
    _persistNow();
    await TacticalStorageService.enqueuePendingOp({
      'op': 'register_volunteer',
      'payload': {
        'localId': localVolunteer['id'],
        'name': name,
        'phone': phone,
        'skills': skills,
        'status': status,
      },
    });
    return {'success': true, 'offline': true, 'volunteer': localVolunteer};
  }

  Future<Map<String, dynamic>> assignVolunteerToMission({
    required String volunteerId,
    required String incidentId,
  }) async {
    Incident? inc;
    for (final item in _incidents) {
      if (item.id == incidentId) {
        inc = item;
        break;
      }
    }
    if (inc == null) {
      return {'success': false, 'error': 'Selected mission incident not found.'};
    }
    if (inc.status == 'Resolved') {
      return {
        'success': false,
        'error': 'Cannot assign volunteer to a resolved incident.'
      };
    }
    if (!inc.isAssignedTo(
      teamId: _teamId,
      teamName: _teamName,
      userName: _userName,
    )) {
      return {
        'success': false,
        'error': 'Your team must own this active mission to assign volunteers.'
      };
    }

    final volIdx =
        _volunteers.indexWhere((v) => (v['id'] ?? '').toString() == volunteerId);
    if (volIdx != -1) {
      final vol = _volunteers[volIdx];
      final existingTeam =
          (vol['assignedTeamId'] ?? vol['teamId'] ?? '').toString().trim();
      final existingTeamName =
          (vol['assignedTeamName'] ?? '').toString().trim();
      final existingInc = (vol['assignedIncidentId'] ?? '').toString().trim();
      final curStatus = (vol['status'] ?? '').toString().trim();

      if (existingTeam.isNotEmpty || existingInc.isNotEmpty) {
        final label =
            existingTeamName.isNotEmpty ? existingTeamName : existingTeam;
        return {
          'success': false,
          'error':
              'Volunteer is already assigned to ${label.isNotEmpty ? label : 'another team'}${existingInc.isNotEmpty ? ' ($existingInc)' : ''}.'
        };
      }
      if (curStatus != 'Available' && curStatus != 'Active') {
        return {
          'success': false,
          'error':
              'Only Available or Active volunteers can be assigned (currently $curStatus).'
        };
      }
    }

    final effectiveTeamName = teamName;
    final assignedPayload = <String, dynamic>{
      'status': 'Assigned',
      'teamId': (_teamId != null && _teamId!.isNotEmpty)
          ? _teamId
          : effectiveTeamName,
      'assignedTeamId': (_teamId != null && _teamId!.isNotEmpty)
          ? _teamId
          : effectiveTeamName,
      'assignedTeamName': effectiveTeamName,
      'assignedIncidentId': incidentId,
      'assignedAt': DateTime.now().toIso8601String(),
      'assignedTask': 'Mission $incidentId ($effectiveTeamName)',
    };

    if (_isDemoMode ||
        volunteerId.startsWith('LOCAL-VOL-') ||
        incidentId.startsWith('LOCAL-INC-')) {
      if (volIdx != -1) {
        _volunteers[volIdx] = {..._volunteers[volIdx], ...assignedPayload};
        notifyListeners();
        _persistNow();
      }
      return {
        'success': true,
        'volunteer': volIdx != -1 ? _volunteers[volIdx] : null,
      };
    }

    final res = await TacticalSyncService.assignVolunteer(
      volunteerId: volunteerId,
      incidentId: incidentId,
      teamId: _teamId,
      teamName: effectiveTeamName,
    );
    if (res['success'] == true) {
      if (res['volunteer'] is Map) {
        _upsertVolunteer(Map<String, dynamic>.from(res['volunteer'] as Map));
      } else if (volIdx != -1) {
        _volunteers[volIdx] = {..._volunteers[volIdx], ...assignedPayload};
      }
      notifyListeners();
      _persistNow();
      return res;
    }

    if (res['networkError'] != true) {
      unawaited(fetchVolunteers());
      return res;
    }

    if (volIdx != -1) {
      _volunteers[volIdx] = {..._volunteers[volIdx], ...assignedPayload};
      notifyListeners();
      _persistNow();
    }
    await TacticalStorageService.enqueuePendingOp({
      'op': 'assign_volunteer',
      'payload': {
        'volunteerId': volunteerId,
        'incidentId': incidentId,
        'teamId': _teamId,
        'teamName': effectiveTeamName,
      },
    });
    return {'success': true, 'offline': true};
  }

  Future<Map<String, dynamic>> unassignVolunteerFromMission({
    required String volunteerId,
  }) async {
    final volIdx =
        _volunteers.indexWhere((v) => (v['id'] ?? '').toString() == volunteerId);
    final resetFields = <String, dynamic>{
      'status': 'Available',
      'teamId': null,
      'assignedTeamId': null,
      'assignedTeamName': null,
      'assignedIncidentId': null,
      'assignedAt': null,
      'assignedTask': 'Available for Deployment',
    };

    if (_isDemoMode || volunteerId.startsWith('LOCAL-VOL-')) {
      if (volIdx != -1) {
        _volunteers[volIdx] = {..._volunteers[volIdx], ...resetFields};
        notifyListeners();
        _persistNow();
      }
      return {'success': true};
    }

    final res = await TacticalSyncService.unassignVolunteer(
      volunteerId: volunteerId,
      teamId: _teamId,
      teamName: teamName,
    );
    if (res['success'] == true) {
      if (res['volunteer'] is Map) {
        _upsertVolunteer(Map<String, dynamic>.from(res['volunteer'] as Map));
      } else if (volIdx != -1) {
        _volunteers[volIdx] = {..._volunteers[volIdx], ...resetFields};
      }
      notifyListeners();
      _persistNow();
      return res;
    }

    if (res['networkError'] != true) {
      unawaited(fetchVolunteers());
      return res;
    }

    if (volIdx != -1) {
      _volunteers[volIdx] = {..._volunteers[volIdx], ...resetFields};
      notifyListeners();
      _persistNow();
    }
    await TacticalStorageService.enqueuePendingOp({
      'op': 'unassign_volunteer',
      'payload': {
        'volunteerId': volunteerId,
        'teamId': _teamId,
        'teamName': teamName,
      },
    });
    return {'success': true, 'offline': true};
  }

  Future<void> _flushPendingOps() async {
    if (_isDemoMode || !_isAuthenticated) return;
    final ops = await TacticalStorageService.loadPendingOps();
    if (ops.isEmpty) return;

    final remaining = <Map<String, dynamic>>[];
    bool changed = false;

    for (final op in ops) {
      final kind = (op['op'] ?? '').toString();
      final payload = op['payload'] is Map
          ? Map<String, dynamic>.from(op['payload'] as Map)
          : <String, dynamic>{};

      if (kind == 'create_team') {
        final res = await TacticalSyncService.createTeam(
          name: (payload['name'] ?? '').toString(),
          callsign: payload['callsign']?.toString(),
          specialization: (payload['specialization'] ?? 'SAR').toString(),
          responders: (payload['responders'] as num?)?.toInt() ?? 4,
          sector: payload['sector']?.toString(),
          commanderName: payload['commanderName']?.toString(),
          commanderPhone: payload['commanderPhone']?.toString(),
          frequency: payload['frequency']?.toString(),
          lat: (payload['lat'] as num?)?.toDouble(),
          lng: (payload['lng'] as num?)?.toDouble(),
        );
        if (res['success'] == true && res['team'] is Map) {
          final created = RescueTeam.fromJson(
            Map<String, dynamic>.from(res['team'] as Map),
            fallbackCommander: _userName,
            fallbackPhone: _userPhone,
          );
          final localId = op['localId']?.toString();
          _teams.removeWhere((t) => localId != null && t.id == localId);
          _upsertTeam(created);
          if (op['setAsActive'] == true || _teamId == localId) {
            _teamId = created.id;
            _teamName = created.name;
            TacticalSyncService.setTeamId(created.id);
          }
          changed = true;
        } else if (res['networkError'] == true) {
          remaining.add(op);
        }
      } else if (kind == 'report_incident') {
        final res = await TacticalSyncService.reportIncident(
          title: (payload['title'] ?? '').toString(),
          location: (payload['location'] ?? '').toString(),
          severity: (payload['severity'] ?? 'High').toString(),
          description: (payload['description'] ?? '').toString(),
          teamName: (payload['teamName'] ?? _teamName).toString(),
          reporter: (payload['reporter'] ?? _userName).toString(),
          lat: (payload['lat'] as num?)?.toDouble(),
          lng: (payload['lng'] as num?)?.toDouble(),
        );
        if (res != null) {
          final localId = op['localId']?.toString();
          if (localId != null) {
            _incidents.removeWhere((i) => i.id == localId);
          }
          if (res['incident'] is Map) {
            _incidents.insert(0, Incident.fromJson(Map<String, dynamic>.from(res['incident'] as Map)));
          }
          changed = true;
        } else {
          remaining.add(op);
        }
      } else if (kind == 'update_incident') {
        final ok = await TacticalSyncService.updateIncidentStatus(
          incidentId: (payload['incidentId'] ?? '').toString(),
          status: (payload['status'] ?? '').toString(),
          teamName: payload['teamName']?.toString(),
          notes: payload['notes']?.toString(),
        );
        if (!ok) remaining.add(op);
      } else if (kind == 'send_chat') {
        final ok = await TacticalSyncService.sendChatMessage(
          id: payload['id']?.toString(),
          channel: payload['channel']?.toString(),
          sender: (payload['sender'] ?? _userName).toString(),
          role: (payload['role'] ?? _userRole).toString(),
          text: (payload['text'] ?? '').toString(),
          locationTag: payload['locationTag']?.toString(),
        );
        if (!ok) remaining.add(op);
      } else if (kind == 'register_volunteer') {
        final skillsRaw = payload['skills'];
        final skills = skillsRaw is List
            ? skillsRaw.map((e) => e.toString()).toList()
            : <String>[];
        final res = await TacticalSyncService.registerVolunteer(
          name: (payload['name'] ?? '').toString(),
          phone: (payload['phone'] ?? '').toString(),
          skills: skills,
          status: (payload['status'] ?? 'Available').toString(),
        );
        if (res != null) {
          final localId = payload['localId']?.toString();
          if (localId != null) {
            _volunteers.removeWhere((v) => (v['id'] ?? '').toString() == localId);
          }
          if (res['volunteer'] is Map) {
            _upsertVolunteer(Map<String, dynamic>.from(res['volunteer'] as Map));
          }
          changed = true;
        } else {
          remaining.add(op);
        }
      } else if (kind == 'assign_volunteer') {
        final res = await TacticalSyncService.assignVolunteer(
          volunteerId: (payload['volunteerId'] ?? '').toString(),
          incidentId: (payload['incidentId'] ?? '').toString(),
          teamId: payload['teamId']?.toString(),
          teamName: payload['teamName']?.toString(),
        );
        if (res['networkError'] == true) {
          remaining.add(op);
        } else if (res['success'] == true && res['volunteer'] is Map) {
          _upsertVolunteer(Map<String, dynamic>.from(res['volunteer'] as Map));
          changed = true;
        }
      } else if (kind == 'unassign_volunteer') {
        final res = await TacticalSyncService.unassignVolunteer(
          volunteerId: (payload['volunteerId'] ?? '').toString(),
          teamId: payload['teamId']?.toString(),
          teamName: payload['teamName']?.toString(),
        );
        if (res['networkError'] == true) {
          remaining.add(op);
        } else if (res['success'] == true && res['volunteer'] is Map) {
          _upsertVolunteer(Map<String, dynamic>.from(res['volunteer'] as Map));
          changed = true;
        }
      }
    }

    await TacticalStorageService.savePendingOps(remaining);
    if (changed) {
      notifyListeners();
      _persistNow();
    }
  }

  // --- Real-Time Backend Synchronization ---
  Future<void> _initBackendSync() async {
    if (_isDemoMode) return;

    await _flushPendingOps();

    // 1. Initial Incidents Fetch
    try {
      final remoteIncidents = await TacticalSyncService.fetchIncidents();
      if (remoteIncidents.isNotEmpty) {
        final pendingLocal = _incidents
            .where((i) => i.id.startsWith('LOCAL-INC-'))
            .toList();
        final List<Incident> synced = remoteIncidents
            .map((item) => Incident.fromJson(item))
            .toList();
        for (final local in pendingLocal) {
          if (!synced.any((s) => s.id == local.id)) {
            synced.insert(0, local);
          }
        }
        _incidents = synced;
        notifyListeners();
        _schedulePersist();
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
        _schedulePersist();
      }
    } catch (e) {
      print('[RescueApp Sync] Chat sync error: $e');
    }

    // 2.5 Fetch Teams & Shelters from Backend
    try {
      final remoteTeams = await TacticalSyncService.fetchTeams();
      if (remoteTeams.isNotEmpty) {
        final pendingLocalTeams =
            _teams.where((t) => t.id.startsWith('LOCAL-TEAM-')).toList();
        _teams = remoteTeams
            .map((t) => RescueTeam.fromJson(
                  t,
                  fallbackCommander: _userName,
                  fallbackPhone: _userPhone,
                ))
            .toList();
        for (final local in pendingLocalTeams) {
          _upsertTeam(local);
        }
        notifyListeners();
        _schedulePersist();
      }
    } catch (_) {}

    try {
      final remoteShelters = await TacticalSyncService.fetchShelters();
      if (remoteShelters.isNotEmpty) {
        _shelters = remoteShelters.map((s) => Shelter.fromJson(s)).toList();
        notifyListeners();
        _schedulePersist();
      }
    } catch (_) {}

    try {
      await fetchVolunteers();
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
          _schedulePersist();
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
          if (parsed.status == 'Resolved') {
            _releaseLocalVolunteersForIncident(parsed.id);
          }
          notifyListeners();
          _schedulePersist();
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
          if (newStatus.toLowerCase() == 'resolved' && targetId != null) {
            _releaseLocalVolunteersForIncident(targetId);
          }
          notifyListeners();
          _schedulePersist();
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
          _schedulePersist();
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
    } else if (eventType == 'team_registered') {
      try {
        final rawTeam = data['team'] ?? data;
        if (rawTeam is Map) {
          final parsed = RescueTeam.fromJson(
            Map<String, dynamic>.from(rawTeam),
            fallbackCommander: _userName,
            fallbackPhone: _userPhone,
          );
          _upsertTeam(parsed);
          notifyListeners();
          _schedulePersist();
        }
      } catch (_) {}
    } else if (eventType == 'teams_sync') {
      try {
        final rawList = data['teams'] as List<dynamic>?;
        if (rawList != null) {
          for (final raw in rawList) {
            if (raw is Map) {
              _upsertTeam(
                RescueTeam.fromJson(
                  Map<String, dynamic>.from(raw),
                  fallbackCommander: _userName,
                  fallbackPhone: _userPhone,
                ),
              );
            }
          }
          notifyListeners();
          _schedulePersist();
        }
      } catch (_) {}
    } else if (eventType == 'volunteer_registered' ||
        eventType == 'volunteer_updated' ||
        eventType == 'volunteer_assigned') {
      try {
        final rawVol = data['volunteer'] ?? data;
        if (rawVol is Map && rawVol['id'] != null) {
          _upsertVolunteer(Map<String, dynamic>.from(rawVol));
          notifyListeners();
          _schedulePersist();
        }
      } catch (_) {}
    } else if (eventType == 'volunteers_released') {
      try {
        final releasedList = data['volunteers'] as List<dynamic>?;
        final incId = data['incidentId']?.toString();
        bool releasedAny = false;
        if (releasedList != null && releasedList.isNotEmpty) {
          for (final item in releasedList) {
            if (item is Map) {
              _upsertVolunteer(Map<String, dynamic>.from(item));
              releasedAny = true;
            }
          }
        } else if (incId != null && incId.isNotEmpty) {
          releasedAny = _releaseLocalVolunteersForIncident(incId);
        }
        if (releasedAny) {
          notifyListeners();
          _schedulePersist();
        }
      } catch (_) {}
    } else if (eventType == 'volunteers_sync') {
      try {
        final rawList = data['volunteers'] as List<dynamic>?;
        if (rawList != null) {
          final localOnly = _volunteers
              .where((v) => (v['id'] ?? '').toString().startsWith('LOCAL-VOL-'))
              .toList();
          _volunteers = rawList
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          for (final local in localOnly) {
            _upsertVolunteer(local);
          }
          notifyListeners();
          _schedulePersist();
        }
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
          _schedulePersist();
        }
      } catch (_) {}
    } else if (eventType == 'team_telemetry_update') {
      try {
        final targetTeamId = data['teamId']?.toString();
        final lat = (data['lat'] as num?)?.toDouble();
        final lng = (data['lng'] as num?)?.toDouble();
        final battery = (data['battery'] as num?)?.toInt() ?? 100;
        final status = data['status']?.toString() ?? 'Deployed';

        if (lat != null && lng != null && _teams.isNotEmpty) {
          final targetIdx = targetTeamId != null && targetTeamId.isNotEmpty
              ? _teams.indexWhere((t) => t.id == targetTeamId)
              : 0;
          if (targetIdx == -1) return;
          final t = _teams[targetIdx];
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

          _teams[targetIdx] = t.copyWith(
            status: status,
            members: updatedMembers,
          );
          notifyListeners();
          _schedulePersist();
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
