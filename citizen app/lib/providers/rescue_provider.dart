import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../models/emergency_type.dart';
import '../models/emergency_request.dart';
import '../models/hazard_zone.dart';
import '../models/rescue_team.dart';
import '../models/safety_guide.dart';
import '../models/user_profile.dart';
import '../services/command_center_service.dart';
import '../services/google_sign_in_service.dart';
import '../services/account_storage_service.dart';

class RescueProvider extends ChangeNotifier {
  RescueProvider() {
    restorePersistedState();
    initLocationTracking();
  }

  /// Safely & quickly acquire live GPS coordinates with fallback chain:
  /// 1. Instant last known position (< 50ms)
  /// 2. High accuracy getCurrentPosition with strict 3s timeout
  /// 3. Medium/Low accuracy getCurrentPosition with 2s timeout
  /// Never hangs indefinitely on emulators or weak satellite conditions.
  Future<Position?> acquireLivePosition({Duration timeout = const Duration(seconds: 3)}) async {
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) return null;

      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm != LocationPermission.always && perm != LocationPermission.whileInUse) {
        return null;
      }

      // Step 1: Check instant last known position
      Position? bestPos;
      try {
        bestPos = await Geolocator.getLastKnownPosition();
      } catch (_) {}

      // Step 2: Try high accuracy with timeout
      try {
        final current = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
          timeLimit: timeout,
        );
        return current;
      } catch (_) {}

      // Step 3: Try medium accuracy with short timeout
      try {
        final currentMed = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.medium,
          timeLimit: const Duration(seconds: 2),
        );
        return currentMed;
      } catch (_) {}

      return bestPos;
    } catch (_) {
      return null;
    }
  }

  Future<void> initLocationTracking() async {
    try {
      final pos = await acquireLivePosition(timeout: const Duration(seconds: 4));
      if (pos != null) {
        _currentLatitude = pos.latitude;
        _currentLongitude = pos.longitude;
        _draftLatitude = pos.latitude;
        _draftLongitude = pos.longitude;
        _currentLocationName = '${pos.latitude.toStringAsFixed(4)}°N, ${pos.longitude.toStringAsFixed(4)}°E (Live GPS)';
        notifyListeners();
      }
    } catch (_) {}
  }

  // Theme state
  bool _isDarkMode = true;
  bool get isDarkMode => _isDarkMode;

  void toggleTheme() {
    _isDarkMode = !_isDarkMode;
    notifyListeners();
    _schedulePersist();
  }

  void setThemeMode(bool isDark) {
    _isDarkMode = isDark;
    notifyListeners();
    _schedulePersist();
  }

  bool _isHydrated = false;
  bool get isHydrated => _isHydrated;
  Timer? _persistTimer;

  @override
  void dispose() {
    _persistTimer?.cancel();
    super.dispose();
  }

  void _schedulePersist() {
    _persistTimer?.cancel();
    _persistTimer = Timer(const Duration(milliseconds: 350), _persistNow);
  }

  Future<void> _persistNow() async {
    _persistTimer?.cancel();
    await AccountStorageService.saveSessionState({
      'isLoggedIn': _isLoggedIn,
      'isDemoMode': _isDemoMode,
      'isDarkMode': _isDarkMode,
      'authMethod': _authMethod,
      'phoneNumber': _phoneNumber,
      'email': _email,
      'activeNavIndex': _activeNavIndex,
      'requestsFilterTab': _requestsFilterTab,
      'currentLocationName': _currentLocationName,
      'currentLatitude': _currentLatitude,
      'currentLongitude': _currentLongitude,
      'currentUser': _currentUser.toJson(),
      'requests': _requests.map((r) => r.toJson()).toList(),
      'liveAlerts': _liveAlerts,
      'availableResources': _availableResources,
      'draftType': _draftType.name,
      'draftAddress': _draftAddress,
      'draftCity': _draftCity,
      'draftLatitude': _draftLatitude,
      'draftLongitude': _draftLongitude,
      'draftDescription': _draftDescription,
      'draftContact': _draftContact,
      'draftConsent': _draftConsent,
      'draftPhotoAsset': _draftPhotoAsset,
      'draftPhotoName': _draftPhotoName,
      'draftResources': _draftResources,
      'incidentChats': _incidentChats,
    });
  }

  Future<void> restorePersistedState() async {
    await CommandCenterService.restoreSession();
    try {
      final saved = await AccountStorageService.loadSessionState();
      if (saved != null) {
        _isDarkMode = saved['isDarkMode'] != false;
        _authMethod = (saved['authMethod'] ?? 'phone').toString();
        _phoneNumber = (saved['phoneNumber'] ?? '').toString();
        _email = (saved['email'] ?? '').toString();
        final savedNav = (saved['activeNavIndex'] as num?)?.toInt() ?? 0;
        _activeNavIndex = (savedNav >= 0 && savedNav <= 3) ? savedNav : 0;
        final savedFilter = (saved['requestsFilterTab'] as num?)?.toInt() ?? 0;
        _requestsFilterTab = (savedFilter == 1) ? 1 : 0;

        final savedLoc = (saved['currentLocationName'] ?? '').toString();
        if (savedLoc.isNotEmpty) _currentLocationName = savedLoc;
        _currentLatitude = (saved['currentLatitude'] as num?)?.toDouble();
        _currentLongitude = (saved['currentLongitude'] as num?)?.toDouble();

        if (saved['currentUser'] is Map) {
          _currentUser = UserProfile.fromJson(
            Map<String, dynamic>.from(saved['currentUser'] as Map),
          );
        }

        final rawReqs = saved['requests'];
        if (rawReqs is List) {
          _requests
            ..clear()
            ..addAll(
              rawReqs
                  .whereType<Map>()
                  .map((r) => EmergencyRequest.fromJson(Map<String, dynamic>.from(r))),
            );
          _lastSubmittedRequest = _requests.isNotEmpty ? _requests.first : null;
        }

        final rawAlerts = saved['liveAlerts'];
        if (rawAlerts is List) {
          _liveAlerts = rawAlerts
              .whereType<Map>()
              .map((a) => Map<String, dynamic>.from(a))
              .toList();
        }

        final rawResources = saved['availableResources'];
        if (rawResources is List) {
          _availableResources = rawResources
              .whereType<Map>()
              .map((r) => Map<String, dynamic>.from(r))
              .toList();
        }

        final rawChats = saved['incidentChats'];
        if (rawChats is Map) {
          _incidentChats.clear();
          rawChats.forEach((k, v) {
            if (v is List) {
              _incidentChats[k.toString()] = v
                  .whereType<Map>()
                  .map((m) => Map<String, dynamic>.from(m))
                  .toList();
            }
          });
        }

        final draftTypeName = (saved['draftType'] ?? 'flood').toString();
        _draftType = EmergencyType.values.firstWhere(
          (e) => e.name == draftTypeName,
          orElse: () => EmergencyType.flood,
        );
        _draftAddress = (saved['draftAddress'] ?? '').toString();
        _draftCity = (saved['draftCity'] ?? '').toString();
        _draftLatitude = (saved['draftLatitude'] as num?)?.toDouble() ?? _currentLatitude;
        _draftLongitude = (saved['draftLongitude'] as num?)?.toDouble() ?? _currentLongitude;
        _draftDescription = (saved['draftDescription'] ?? '').toString();
        _draftContact = (saved['draftContact'] ?? '').toString();
        _draftConsent = saved['draftConsent'] != false;
        final draftPhoto = (saved['draftPhotoAsset'] ?? '').toString();
        if (draftPhoto.isNotEmpty) _draftPhotoAsset = draftPhoto;
        final draftPhotoName = (saved['draftPhotoName'] ?? '').toString();
        if (draftPhotoName.isNotEmpty) _draftPhotoName = draftPhotoName;

        final rawDraftRes = saved['draftResources'];
        if (rawDraftRes is Map) {
          _draftResources.clear();
          rawDraftRes.forEach((k, v) {
            final qty = int.tryParse(v.toString()) ?? 0;
            if (qty > 0) _draftResources[k.toString()] = qty;
          });
        }

        _isDemoMode = saved['isDemoMode'] == true;
        _isLoggedIn = saved['isLoggedIn'] == true;
        if (_isLoggedIn) {
          _hasOtpError = false;
        }
      }
    } catch (_) {}

    _isHydrated = true;
    notifyListeners();

    if (_isLoggedIn && !_isDemoMode) {
      _onLiveAuthenticated();
    }
  }

  // Demo mode state
  bool _isDemoMode = false;
  bool get isDemoMode => _isDemoMode;

  // Authentication & Session
  bool _isLoggedIn = false;
  String _authMethod = 'phone'; // 'phone' | 'email'
  String _phoneNumber = '';
  String _email = '';
  final List<String> _otpDigits = ['', '', '', '', '', ''];
  bool _hasOtpError = false;
  String _currentLocationName = 'Acquiring GPS...';
  double? _currentLatitude;
  double? _currentLongitude;

  // Saved user profile / credentials
  UserProfile _currentUser = const UserProfile(
    fullName: '',
    phoneNumber: '',
    email: '',
    bloodGroup: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    address: '',
    sector: '',
    medicalNotes: '',
    isRegistered: false,
  );
  UserProfile get currentUser => _currentUser;

  // Saved credentials storage (persisted across sessions)
  final Map<String, UserProfile> _savedAccounts = {};

  // Navigation Hub Tab (0: Home, 1: Requests, 2: Alerts, 3: Inbox)
  int _activeNavIndex = 0;

  // Real-time backend alerts
  List<Map<String, dynamic>> _liveAlerts = [];
  bool _loadingAlerts = false;
  List<Map<String, dynamic>> get liveAlerts => _liveAlerts;
  bool get loadingAlerts => _loadingAlerts;

  // Dispatchable resource catalog & citizen selection draft
  static const List<Map<String, dynamic>> _demoResources = [
    {'id': 'medical_kit', 'name': 'Medical Kits', 'total': 18, 'available': 18},
    {'id': 'ambulance', 'name': 'Ambulances', 'total': 6, 'available': 6},
    {'id': 'boat', 'name': 'Rescue Boats', 'total': 4, 'available': 4},
    {'id': 'drone', 'name': 'Drones', 'total': 3, 'available': 3},
    {'id': 'helicopter', 'name': 'Helicopters', 'total': 2, 'available': 2},
  ];
  List<Map<String, dynamic>> _availableResources = [];
  bool _loadingResources = false;
  String? _resourcesError;
  final Map<String, int> _draftResources = {};
  final Map<String, List<Map<String, dynamic>>> _incidentChats = {};

  // Requests Tab Filter (0: Recent, 1: All requests)
  int _requestsFilterTab = 0;

  // Emergency Creation Wizard Draft
  EmergencyType _draftType = EmergencyType.flood;
  String _draftAddress = '';
  String _draftCity = '';
  double? _draftLatitude;
  double? _draftLongitude;
  String _draftDescription = '';
  String _draftContact = '';
  bool _draftConsent = true;
  String _draftPhotoAsset = 'assets/images/scenarios/flood_river_boat.png';
  String _draftPhotoName = 'flood_boat_evidence.png · 1.2 MB';

  // Latest Submitted Request
  EmergencyRequest? _lastSubmittedRequest;

  // Active Rescue Teams Fleet (Live Tracking)
  final List<RescueTeam> _rescueTeams = [
    const RescueTeam(
      id: 'RT-B02',
      name: 'Bravo 02 (Speedboat Rescue)',
      type: 'Marine / Inundation Unit',
      icon: Icons.directions_boat,
      status: TeamStatus.enRoute,
      currentSector: 'Sector 4-B · KB Jacob Waterway',
      eta: '8 min',
      latitude: 9.9658,
      longitude: 76.2415,
      imagePath: 'assets/images/scenarios/flood_river_boat.png',
    ),
    const RescueTeam(
      id: 'RT-D04',
      name: 'Delta 04 (Roadway Clearing)',
      type: 'Heavy Equipment & Tree Removal',
      icon: Icons.engineering,
      status: TeamStatus.onScene,
      currentSector: 'Sector 2 · Mattancherry Junction',
      eta: 'On Scene',
      latitude: 9.9575,
      longitude: 76.2570,
      imagePath: 'assets/images/scenarios/earthquake_rubble_collapse.png',
    ),
    const RescueTeam(
      id: 'RT-E01',
      name: 'Echo 01 (Mobile Paramedic)',
      type: 'Triage & Critical Life Support',
      icon: Icons.medical_services,
      status: TeamStatus.standby,
      currentSector: 'General Hospital Base Camp',
      eta: 'Standby',
      latitude: 9.9702,
      longitude: 76.2798,
      imagePath: 'assets/images/scenarios/highway_ambulance_storm.png',
    ),
    const RescueTeam(
      id: 'RT-A05',
      name: 'Alpha 05 (Civil Defence Evacuation)',
      type: 'High-Clearance Transport Unit',
      icon: Icons.airport_shuttle,
      status: TeamStatus.enRoute,
      currentSector: 'Amaravathy Relief Route',
      eta: '14 min',
      latitude: 9.9620,
      longitude: 76.2440,
      imagePath: 'assets/images/scenarios/village_flood_evac.png',
    ),
    const RescueTeam(
      id: 'RT-H01',
      name: 'Air Wing Alpha-1 (Helo Extraction)',
      type: 'High Altitude Aerial Evacuation',
      icon: Icons.flight,
      status: TeamStatus.enRoute,
      currentSector: 'Overwatch Sector 3 (Air corridor)',
      eta: '6 min',
      latitude: 9.9680,
      longitude: 76.2380,
      imagePath: 'assets/images/scenarios/helicopter_mountain_alpine.png',
    ),
    const RescueTeam(
      id: 'RT-K09',
      name: 'K9 Search Team Sigma',
      type: 'Canine Wilderness Search & Track',
      icon: Icons.pets,
      status: TeamStatus.onScene,
      currentSector: 'Wooded Perimeter Reserve',
      eta: 'On Scene',
      latitude: 9.9550,
      longitude: 76.2480,
      imagePath: 'assets/images/scenarios/forest_k9_search.png',
    ),
  ];

  // Active Hazard Zones
  final List<HazardZone> _hazardZones = [
    const HazardZone(
      id: 'HZ-01',
      name: 'Fort Kochi Low-Lying Canal Basin',
      type: 'Flooding & Backwater Inundation',
      severity: HazardSeverity.critical,
      description:
          'Water level: 1.2m above street level. Strong undercurrent near Calvathy bridge. High vehicle submersion hazard.',
      radius: '1.4 km',
      latitude: 9.9660,
      longitude: 76.2420,
      imagePath: 'assets/images/scenarios/flood_response_street.png',
    ),
    const HazardZone(
      id: 'HZ-02',
      name: 'Mattancherry Palace Road Blockage',
      type: 'Fallen Banyan Tree & Live Powerlines',
      severity: HazardSeverity.warning,
      description:
          'Road completely obstructed. KSEB line isolation underway. Use Palace bypass.',
      radius: '400 m',
      latitude: 9.9580,
      longitude: 76.2560,
      imagePath: 'assets/images/scenarios/village_flood_evac.png',
    ),
    const HazardZone(
      id: 'HZ-03',
      name: 'Vypeen-Kochi Shoreline Surge',
      type: 'Coastal High Tide Swell',
      severity: HazardSeverity.advisory,
      description:
          'Tidal surge 3.2m expected around 14:00. Sea wall inspection deployed.',
      radius: '3.0 km',
      latitude: 9.9750,
      longitude: 76.2300,
      imagePath: 'assets/images/scenarios/highway_ambulance_storm.png',
    ),
  ];

  // Safety Guides & Do's / Don'ts
  final List<SafetyGuide> _safetyGuides = [
    const SafetyGuide(
      id: 'guide-flood',
      title: 'Flooding & Inundation',
      subtitle: 'Rising waters, structural flooding & backwater surges',
      icon: Icons.water_damage,
      themeColor: Color(0xFF3B82F6),
      imagePath: 'assets/images/scenarios/flood_river_boat.png',
      dos: [
        'Move immediately to higher floors or designated relief buildings.',
        'Turn off main electricity breakers and gas valves before water reaches outlets.',
        'Keep emergency backpack, medicines, mobile phone and power banks in waterproof bags.',
        'Boil drinking water or use chlorine purification tablets.',
        'Follow instructions from NDRF, Coastal Police and Civil Defence.',
      ],
      donts: [
        'DO NOT walk or wade through flowing flood water — 15cm can knock you off balance.',
        'DO NOT drive vehicles into water-covered roads or underpasses.',
        'DO NOT touch fallen electrical poles, transformer boxes or live wiring in water.',
        'DO NOT consume uncovered food or tap water that came into contact with floodwaters.',
      ],
      kitChecklist: [
        'Waterproof torch & extra batteries',
        '3-day bottled drinking water supply',
        'Prescription medicines & First Aid kit',
        'Whistle to signal rescue boats',
        'National ID cards in ziplock pouch',
      ],
    ),
    const SafetyGuide(
      id: 'guide-earthquake',
      title: 'Earthquake & Tremors',
      subtitle: 'Building tremors, structural cracks & aftershocks',
      icon: Icons.show_chart,
      themeColor: Color(0xFFF59E0B),
      imagePath: 'assets/images/scenarios/earthquake_rubble_collapse.png',
      dos: [
        'DROP, COVER, and HOLD ON under a sturdy desk or table.',
        'Protect your head and neck with your arms or heavy cushions.',
        'If outdoors, move to an open field away from buildings, poles, and flyovers.',
        'If trapped in debris, tap on pipes or walls with metal/stone to alert rescuers.',
      ],
      donts: [
        'DO NOT use elevators or escalators during or immediately after shaking.',
        'DO NOT stand near glass windows, heavy bookcases, or hanging light fixtures.',
        'DO NOT light matches or lighters due to potential gas leaks.',
        'DO NOT run outside in panic while building tiles or glass are falling.',
      ],
      kitChecklist: [
        'Hard hat or thick head protection',
        'Leather work gloves for debris',
        'Dust masks (N95)',
        'Battery powered emergency radio',
      ],
    ),
    const SafetyGuide(
      id: 'guide-fire',
      title: 'Fire & Gas Hazards',
      subtitle: 'Structure fires, smoke inhalation & LPG leaks',
      icon: Icons.local_fire_department,
      themeColor: Color(0xFFEF4444),
      imagePath: 'assets/images/scenarios/highway_ambulance_storm.png',
      dos: [
        'Crawl low under smoke — clean air is closest to the floor (within 30cm).',
        'Feel doors with the back of your hand before opening; if hot, do not open.',
        'Cover nose and mouth with a wet cloth to filter toxic fumes.',
        'Call 112 / 101 immediately once safely outside.',
      ],
      donts: [
        'DO NOT return inside a burning structure for personal belongings.',
        'DO NOT use water on electrical or oil cooking fires (use CO2/dry powder).',
        'DO NOT open windows if fire is outside as oxygen fuels the flames.',
      ],
      kitChecklist: [
        'Fire blanket',
        'Smoke hood / escape respirator',
        'Battery-operated smoke detector',
        'ABC dry powder mini fire extinguisher',
      ],
    ),
    const SafetyGuide(
      id: 'guide-cyclone',
      title: 'Cyclone & Windstorm',
      subtitle: 'High velocity gales, flying debris & tidal surges',
      icon: Icons.air,
      themeColor: Color(0xFF10B981),
      imagePath: 'assets/images/scenarios/snow_glacier_climb.png',
      dos: [
        'Board up windows or apply thick tape diagonally to reduce flying glass.',
        'Anchor loose outdoor objects, rooftop solar sheets and tin roofing.',
        'Stay in the safest interior room away from exterior walls and roof tiles.',
      ],
      donts: [
        'DO NOT venture out when the eye of the cyclone passes; calm is temporary.',
        'DO NOT park vehicles under large trees, billboards or telephone poles.',
      ],
      kitChecklist: [
        'Emergency tarpaulin sheets',
        'Battery lantern',
        'Cash in small denominations',
      ],
    ),
  ];

  // Requests Data Repository (empty in live mode; populated in Demo Mode only)
  final List<EmergencyRequest> _requests = [];
  bool _loadingRequests = false;
  bool get loadingRequests => _loadingRequests;

  static final List<EmergencyRequest> _demoRequests = [
    EmergencyRequest(
      id: 'RQ-261010-0842',
      title: 'Flood assistance',
      type: EmergencyType.flood,
      status: RequestStatus.inProgress,
      timeLabel: 'Today · 09:20',
      location: 'KB Jacob Road, Fort Kochi',
      fullAddress: '18, KB Jacob Road, Fort Kochi, Ernakulam, Kerala 682001',
      dispatchUpdate: 'Bravo 02 is on the way · 09:32',
      dispatchIcon: Icons.directions_boat,
      description:
          'Water is entering our ground floor. Four people need help, including one older adult. We are waiting upstairs.',
      contactNumber: '+91 98470 21836',
      photoCount: 1,
      photoAssetPath: 'assets/images/scenarios/flood_river_boat.png',
      assignedTeam: 'Bravo 02',
      assignedTeamId: 'demo-bravo-02',
      createdAt: DateTime(2026, 10, 10, 9, 20),
      isRecent: true,
    ),
    EmergencyRequest(
      id: 'RQ-261010-0831',
      title: 'Medical storm assistance',
      type: EmergencyType.other,
      status: RequestStatus.pending,
      timeLabel: 'Today · 08:58',
      location: 'Willingdon Island, Ernakulam',
      fullAddress: 'Harbor View Road, Willingdon Island, Kochi 682003',
      dispatchUpdate: 'Awaiting review by the response desk',
      dispatchIcon: Icons.hourglass_top,
      description:
          'Elderly resident requires portable oxygen refill and medical evaluation amid road storm.',
      contactNumber: '+91 98470 21836',
      photoCount: 1,
      photoAssetPath: 'assets/images/scenarios/highway_ambulance_storm.png',
      createdAt: DateTime(2026, 10, 10, 8, 58),
      isRecent: true,
    ),
    EmergencyRequest(
      id: 'RQ-261010-0818',
      title: 'Fallen tree & flooded road',
      type: EmergencyType.other,
      status: RequestStatus.assigned,
      timeLabel: 'Today · 08:40',
      location: 'Mattancherry, Kochi',
      fullAddress: 'Synagogue Lane, Mattancherry, Kochi 682002',
      dispatchUpdate: 'Delta 04 assigned · 09:10',
      dispatchIcon: Icons.engineering,
      description:
          'Large banyan tree fallen across road, blocking emergency vehicle access.',
      contactNumber: '+91 98470 21836',
      photoCount: 1,
      photoAssetPath: 'assets/images/scenarios/flood_response_street.png',
      assignedTeam: 'Delta 04',
      assignedTeamId: 'demo-delta-04',
      createdAt: DateTime(2026, 10, 10, 8, 40),
      isRecent: true,
    ),
    EmergencyRequest(
      id: 'RQ-261009-0801',
      title: 'Flood evacuation',
      type: EmergencyType.flood,
      status: RequestStatus.resolved,
      timeLabel: 'Yesterday · 16:05',
      location: 'Amaravathy, Fort Kochi',
      fullAddress: 'Amaravathy Road, Fort Kochi 682001',
      dispatchUpdate: 'Evacuation completed · 17:10',
      dispatchIcon: Icons.check_circle,
      description:
          'Evacuation of ground floor residents due to high tide surge.',
      contactNumber: '+91 98470 21836',
      photoCount: 1,
      photoAssetPath: 'assets/images/scenarios/village_flood_evac.png',
      createdAt: DateTime(2026, 10, 9, 16, 5),
      isRecent: false,
    ),
    EmergencyRequest(
      id: 'RQ-261009-0740',
      title: 'High altitude mountain rescue',
      type: EmergencyType.other,
      status: RequestStatus.resolved,
      timeLabel: 'Yesterday · 14:15',
      location: 'Ponmudi Ridge, Sector 9',
      fullAddress: 'Ponmudi Highland Trail Point 4, Kerala',
      dispatchUpdate: 'Helicopter air-lift rescue completed',
      dispatchIcon: Icons.flight_takeoff,
      description:
          'Stranded trekkers trapped by rapid weather shift extracted by aerial response helicopter.',
      contactNumber: '+91 98470 21836',
      photoCount: 1,
      photoAssetPath: 'assets/images/scenarios/helicopter_mountain_alpine.png',
      createdAt: DateTime(2026, 10, 9, 14, 15),
      isRecent: false,
    ),
  ];

  // Getters
  bool get isLoggedIn => _isLoggedIn;
  String get authMethod => _authMethod;
  String get phoneNumber => _phoneNumber;
  String get email => _email;
  List<String> get otpDigits => _otpDigits;
  bool get hasOtpError => _hasOtpError;
  String get currentLocationName => _currentLocationName;
  double get currentLatitude => _draftLatitude ?? _currentLatitude ?? 0.0;
  double get currentLongitude => _draftLongitude ?? _currentLongitude ?? 0.0;
  bool get hasGpsFix =>
      (_draftLatitude ?? _currentLatitude) != null &&
      (_draftLongitude ?? _currentLongitude) != null;

  void updateLocation({
    required String locationName,
    String? address,
    String? city,
    required double latitude,
    required double longitude,
  }) {
    _currentLocationName = locationName;
    _draftAddress = address ?? locationName;
    _draftCity = city ?? 'Uttarakhand';
    _draftLatitude = latitude;
    _draftLongitude = longitude;
    _currentLatitude = latitude;
    _currentLongitude = longitude;
    notifyListeners();
  }
  int get activeNavIndex => _activeNavIndex;
  int get requestsFilterTab => _requestsFilterTab;

  EmergencyType get draftType => _draftType;
  String get draftAddress => _draftAddress;
  String get draftCity => _draftCity;
  String get draftDescription => _draftDescription;
  String get draftContact => _draftContact;
  bool get draftConsent => _draftConsent;
  String get draftPhotoAsset => _draftPhotoAsset;
  String get draftPhotoName => _draftPhotoName;
  List<Map<String, dynamic>> get availableResources =>
      List.unmodifiable(_isDemoMode ? _demoResources : _availableResources);
  bool get loadingResources => _loadingResources;
  String? get resourcesError => _resourcesError;
  Map<String, int> get draftResources => Map.unmodifiable(_draftResources);
  int resourceQuantity(String resourceId) => _draftResources[resourceId] ?? 0;
  int get selectedResourceCount =>
      _draftResources.values.fold(0, (sum, q) => sum + (q > 0 ? q : 0));
  EmergencyRequest? get lastSubmittedRequest =>
      _lastSubmittedRequest ?? (_requests.isNotEmpty ? _requests.first : null);

  List<EmergencyRequest> get allRequests => List.unmodifiable(_requests);
  List<EmergencyRequest> get recentRequests =>
      _requests.where((r) => r.isRecent).toList();
  List<EmergencyRequest> get filteredRequests =>
      _requestsFilterTab == 0 ? recentRequests : allRequests;

  EmergencyRequest? get latestRequest => _requests.isNotEmpty ? _requests.first : null;

  List<RescueTeam> get rescueTeams => List.unmodifiable(_rescueTeams);
  List<HazardZone> get hazardZones => List.unmodifiable(_hazardZones);
  List<SafetyGuide> get safetyGuides => List.unmodifiable(_safetyGuides);

  // Actions
  void setAuthMethod(String method) {
    _authMethod = method;
    notifyListeners();
  }

  void setPhoneNumber(String phone) {
    _phoneNumber = phone;
    // Check if saved user exists
    if (_savedAccounts.containsKey(phone.trim())) {
      _currentUser = _savedAccounts[phone.trim()]!;
    }
    notifyListeners();
  }

  void setEmail(String email) {
    _email = email;
    if (_savedAccounts.containsKey(email.trim())) {
      _currentUser = _savedAccounts[email.trim()]!;
    }
    notifyListeners();
  }

  void updateProfile(UserProfile profile) {
    _currentUser = profile;
    _savedAccounts[profile.phoneNumber] = profile;
    _savedAccounts[profile.email] = profile;
    notifyListeners();
    _persistNow();
  }

  void setOtpDigit(int index, String digit) {
    if (index >= 0 && index < 6) {
      _otpDigits[index] = digit;
      notifyListeners();
    }
  }

  void clearOtpError() {
    _hasOtpError = false;
    notifyListeners();
  }

  void triggerOtpError() {
    _hasOtpError = true;
    notifyListeners();
  }

  /// Launch app directly in Demo Mode without requiring login or sign up
  void enterDemoMode() {
    _isDemoMode = true;
    _isLoggedIn = true;
    _hasOtpError = false;
    _requests
      ..clear()
      ..addAll(_demoRequests);
    _incidentChats
      ..clear()
      ..['RQ-261010-0842'] = [
        {
          'id': 'demo-msg-bravo-1',
          'channel': 'incident-RQ-261010-0842',
          'sender': 'Bravo 02',
          'senderRole': 'rescue',
          'role': 'Bravo 02 · Marine Boat Unit',
          'initials': 'B2',
          'time': '09:33',
          'text':
              'Bravo 02 copied your flood SOS at KB Jacob Road. Our boat unit is ~8 minutes out—please stay on the upper floor.',
          'isSelf': false,
        },
      ];
    _lastSubmittedRequest = _requests.isNotEmpty ? _requests.first : null;
    _draftResources.clear();
    _resourcesError = null;
    _currentLatitude = 30.3165;
    _currentLongitude = 78.0322;
    _draftLatitude = 30.3165;
    _draftLongitude = 78.0322;
    _currentLocationName = 'Civil Lines, Dehradun';
    _currentUser = const UserProfile(
      fullName: 'Demo Citizen (Kerala Command)',
      phoneNumber: '+91 98470 21836',
      email: 'demo.citizen@resqcore.org',
      bloodGroup: 'B+ Positive',
      emergencyContactName: 'Disaster Control Desk',
      emergencyContactPhone: '112',
      address: '18, KB Jacob Road, Fort Kochi',
      sector: 'Sector 4-B, Ernakulam',
      medicalNotes: 'Demo Session Active',
      isRegistered: true,
    );
    notifyListeners();
    _persistNow();
  }

  void _onLiveAuthenticated() async {
    initLocationTracking();
    if (!_isDemoMode && CommandCenterService.authTokenNeedsUpgrade()) {
      final identifier = _currentUser.phoneNumber.isNotEmpty
          ? _currentUser.phoneNumber
          : (_phoneNumber.isNotEmpty ? _phoneNumber : _email);
      if (identifier.trim().isNotEmpty) {
        try {
          await CommandCenterService.authenticateCitizen(
            identifier: identifier.trim(),
            name: _currentUser.fullName.isNotEmpty ? _currentUser.fullName : 'Citizen',
          );
        } catch (_) {}
      }
    }
    loadMyRequestsFromBackend();
    loadAlertsFromBackend();
    loadResourcesFromBackend();
    _startRealtimeSync();
  }

  void login() {
    _isDemoMode = false;
    _isLoggedIn = true;
    _hasOtpError = false;
    _requests.clear();
    _incidentChats.clear();
    _liveAlerts = [];
    _availableResources = [];
    _draftResources.clear();
    _lastSubmittedRequest = null;
    notifyListeners();
    _persistNow();
    final identifier =
        _authMethod == 'phone' ? _phoneNumber : _email;
    CommandCenterService.authenticateCitizen(
      identifier: identifier,
      name: _currentUser.fullName.isNotEmpty ? _currentUser.fullName : 'Citizen',
    ).then((res) {
      final userObj = res['user'] as Map<String, dynamic>?;
      if (userObj != null) {
        _currentUser = UserProfile(
          fullName: (userObj['name'] ?? _currentUser.fullName).toString(),
          phoneNumber: (userObj['phone'] ?? _currentUser.phoneNumber).toString(),
          email: (userObj['email'] ?? _currentUser.email).toString(),
          bloodGroup: _currentUser.bloodGroup,
          emergencyContactName: _currentUser.emergencyContactName,
          emergencyContactPhone: _currentUser.emergencyContactPhone,
          address: _currentUser.address,
          sector: _currentUser.sector,
          medicalNotes: _currentUser.medicalNotes,
          isRegistered: true,
        );
        notifyListeners();
        _persistNow();
      }
      _onLiveAuthenticated();
    }).catchError((_) {
      _onLiveAuthenticated();
    });
  }

  /// Sign in with Google OAuth — returns error string on failure, null on success
  Future<String?> loginWithGoogle() async {
    try {
      final profile = await GoogleSignInService.signIn();
      if (profile == null) return null; // user cancelled, no error
      await CommandCenterService.authenticateCitizen(
        identifier: profile.email.isNotEmpty ? profile.email : profile.fullName,
        name: profile.fullName,
      );
      _currentUser = profile;
      _isDemoMode = false;
      _isLoggedIn = true;
      _hasOtpError = false;
      _requests.clear();
      _incidentChats.clear();
      _liveAlerts = [];
      _availableResources = [];
      _draftResources.clear();
      _lastSubmittedRequest = null;
      if (profile.email.isNotEmpty) {
        _email = profile.email;
        _authMethod = 'email';
      }
      notifyListeners();
      await _persistNow();
      _onLiveAuthenticated();
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  /// Sign in using identifier (phone or email) and password via backend /api/auth.
  /// Returns null on success, or an error message string on failure.
  Future<String?> loginWithPassword({
    required String identifier,
    required String password,
  }) async {
    final cleanId = identifier.trim();
    if (cleanId.isEmpty) {
      return 'Please enter your phone number or email.';
    }
    if (password.trim().isEmpty) {
      return 'Please enter your password.';
    }

    final authRes = await CommandCenterService.authenticateCitizen(
      identifier: cleanId,
      password: password.trim(),
    );
    if (authRes['success'] != true) {
      return (authRes['error'] ?? 'Authentication failed. Please try again.').toString();
    }

    final userObj = authRes['user'] as Map<String, dynamic>?;
    final isPhone = RegExp(r'^[0-9+\s\-]{7,15}$').hasMatch(cleanId);
    final phoneStr = (userObj?['phone'] ?? (isPhone ? cleanId : '')).toString();
    final emailStr = (userObj?['email'] ?? (!isPhone ? cleanId : '')).toString();

    _currentUser = UserProfile(
      fullName: (userObj?['name'] ?? 'Citizen').toString(),
      phoneNumber: phoneStr,
      email: emailStr,
      bloodGroup: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      address: '',
      sector: '',
      medicalNotes: '',
      isRegistered: true,
    );
    _isDemoMode = false;
    _isLoggedIn = true;
    _hasOtpError = false;
    _requests.clear();
    _incidentChats.clear();
    _liveAlerts = [];
    _availableResources = [];
    _draftResources.clear();
    _lastSubmittedRequest = null;
    if (phoneStr.isNotEmpty) {
      _phoneNumber = phoneStr.replaceAll(RegExp(r'[+91\s]'), '');
      _authMethod = 'phone';
    } else if (emailStr.isNotEmpty) {
      _email = emailStr;
      _authMethod = 'email';
    }
    notifyListeners();
    await _persistNow();
    _onLiveAuthenticated();
    return null;
  }

  /// Looks up a saved account by phone or email.
  /// Returns the [UserProfile] if found, null otherwise.
  Future<UserProfile?> lookupAccount({
    String? phone,
    String? email,
  }) async {
    if (phone != null && phone.trim().isNotEmpty) {
      return AccountStorageService.findByPhone(phone);
    }
    if (email != null && email.trim().isNotEmpty) {
      return AccountStorageService.findByEmail(email);
    }
    return null;
  }

  /// Logs in with an existing [profile] via backend auth and starts live sync.
  void loginWithSavedAccount(UserProfile profile) {
    _currentUser = profile;
    _isDemoMode = false;
    _isLoggedIn = true;
    _hasOtpError = false;
    _requests.clear();
    _incidentChats.clear();
    _liveAlerts = [];
    _availableResources = [];
    _draftResources.clear();
    _lastSubmittedRequest = null;
    if (profile.phoneNumber.isNotEmpty) {
      _phoneNumber = profile.phoneNumber.replaceAll(RegExp(r'[+91\s]'), '');
      _authMethod = 'phone';
    } else if (profile.email.isNotEmpty) {
      _email = profile.email;
      _authMethod = 'email';
    }
    notifyListeners();
    _persistNow();
    CommandCenterService.authenticateCitizen(
      identifier: profile.phoneNumber.isNotEmpty ? profile.phoneNumber : profile.email,
      name: profile.fullName,
    ).then((_) {
      _onLiveAuthenticated();
    }).catchError((_) {});
  }

  void logout() {
    _persistTimer?.cancel();
    CommandCenterService.stopAllTracking();
    CommandCenterService.setAuthToken('');
    AccountStorageService.clearToken();
    AccountStorageService.clearSessionState();
    _requests.clear();
    _incidentChats.clear();
    _liveAlerts = [];
    _availableResources = [];
    _draftResources.clear();
    _resourcesError = null;
    _lastSubmittedRequest = null;
    _isLoggedIn = false;
    _isDemoMode = false;
    _hasOtpError = true;
    notifyListeners();
  }

  /// Registers a brand-new citizen account via backend /api/auth and logs them in.
  Future<void> registerNewAccount(UserProfile profile) async {
    final identifier = profile.email.isNotEmpty
        ? profile.email
        : profile.phoneNumber;
    final authRes = await CommandCenterService.authenticateCitizen(
      identifier: identifier,
      password: profile.password,
      name: profile.fullName,
      isRegister: true,
    );
    if (authRes['success'] != true) {
      throw Exception(authRes['error'] ?? 'Backend registration failed');
    }

    _currentUser = profile;
    _isDemoMode = false;
    _isLoggedIn = true;
    _hasOtpError = false;
    _requests.clear();
    _incidentChats.clear();
    _liveAlerts = [];
    _availableResources = [];
    _draftResources.clear();
    _lastSubmittedRequest = null;
    if (profile.phoneNumber.isNotEmpty) {
      _phoneNumber = profile.phoneNumber.replaceAll('+91 ', '');
      _authMethod = 'phone';
    } else if (profile.email.isNotEmpty) {
      _email = profile.email;
      _authMethod = 'email';
    }
    notifyListeners();
    await _persistNow();
    _onLiveAuthenticated();
  }

  void setActiveNavIndex(int index) {
    _activeNavIndex = index;
    notifyListeners();
    _schedulePersist();
  }

  void setRequestsFilterTab(int tab) {
    _requestsFilterTab = tab;
    notifyListeners();
    _schedulePersist();
  }

  void setDraftType(EmergencyType type) {
    _draftType = type;
    _draftPhotoAsset = type.imagePath;
    _draftPhotoName = '${type.id}_incident_recon.png · 1.4 MB';
    notifyListeners();
    _schedulePersist();
  }

  void setDraftPhoto(String asset, String name) {
    _draftPhotoAsset = asset;
    _draftPhotoName = name;
    notifyListeners();
    _schedulePersist();
  }

  void setDraftAddress(String address, [String? city]) {
    _draftAddress = address;
    if (city != null) _draftCity = city;
    notifyListeners();
    _schedulePersist();
  }

  void setDraftCoordinates(double latitude, double longitude) {
    _draftLatitude = latitude;
    _draftLongitude = longitude;
    notifyListeners();
    _schedulePersist();
  }

  void setDraftDescription(String desc) {
    _draftDescription = desc;
    notifyListeners();
    _schedulePersist();
  }

  void setDraftContact(String contact) {
    _draftContact = contact;
    notifyListeners();
    _schedulePersist();
  }

  void setDraftConsent(bool consent) {
    _draftConsent = consent;
    notifyListeners();
    _schedulePersist();
  }

  void setResourceQuantity(String resourceId, int quantity, {int max = 99}) {
    final bounded = quantity.clamp(0, max < 1 ? 1 : max);
    if (bounded <= 0) {
      _draftResources.remove(resourceId);
    } else {
      _draftResources[resourceId] = bounded;
    }
    notifyListeners();
    _schedulePersist();
  }

  void incrementResource(String resourceId, {int max = 99}) {
    final current = _draftResources[resourceId] ?? 0;
    if (current < (max < 1 ? 1 : max)) {
      _draftResources[resourceId] = current + 1;
      notifyListeners();
      _schedulePersist();
    }
  }

  void decrementResource(String resourceId) {
    final current = _draftResources[resourceId] ?? 0;
    if (current <= 1) {
      _draftResources.remove(resourceId);
    } else {
      _draftResources[resourceId] = current - 1;
    }
    notifyListeners();
    _schedulePersist();
  }

  void clearDraftResources() {
    if (_draftResources.isEmpty) return;
    _draftResources.clear();
    notifyListeners();
    _schedulePersist();
  }

  void setCurrentLocation(String location) {
    _currentLocationName = location;
    notifyListeners();
    _schedulePersist();
  }

  /// 1-Click Instant SOS Dispatch with Live GPS lock
  Future<EmergencyRequest> triggerQuickSos() async {
    final now = DateTime.now();
    final newId =
        'SOS-${now.year.toString().substring(2)}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}-${(now.hour * 100 + now.minute).toString().padLeft(4, '0')}';

    // Lock live GPS position before firing the SOS alert
    final pos = await acquireLivePosition(timeout: const Duration(seconds: 2));
    if (pos != null) {
      _currentLatitude = pos.latitude;
      _currentLongitude = pos.longitude;
      _draftLatitude = pos.latitude;
      _draftLongitude = pos.longitude;
      _currentLocationName = '${pos.latitude.toStringAsFixed(4)}°N, ${pos.longitude.toStringAsFixed(4)}°E (Live GPS)';
    }

    final rawLat = _draftLatitude ?? _currentLatitude;
    final rawLng = _draftLongitude ?? _currentLongitude;
    if (rawLat == null || rawLng == null) {
      throw StateError('Live GPS location is required before sending an SOS.');
    }
    final lat = rawLat;
    final lng = rawLng;

    final sosRequest = EmergencyRequest(
      id: newId,
      title: '🚨 CRITICAL ONE-TOUCH SOS',
      type: EmergencyType.other,
      status: _isDemoMode ? RequestStatus.inProgress : RequestStatus.pending,
      timeLabel: 'Just now · ${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}',
      location: _currentLocationName,
      fullAddress: _draftAddress.isNotEmpty ? '$_draftAddress, $_draftCity' : _currentLocationName,
      dispatchUpdate: _isDemoMode
          ? 'Priority 1 SOS alert dispatched to Command Center & field units'
          : 'Awaiting triage by Command Center',
      dispatchIcon: Icons.emergency,
      description:
          'Automated One-Touch SOS triggered from ${_currentUser.fullName.isNotEmpty ? _currentUser.fullName : "Citizen"}. Immediate rescue assistance required at GPS lock ($lat, $lng).',
      contactNumber: _currentUser.phoneNumber.isNotEmpty ? _currentUser.phoneNumber : _phoneNumber,
      photoCount: 0,
      createdAt: now,
      isRecent: true,
    );

    if (!_isDemoMode) {
      final res = await CommandCenterService.sendEmergencyReport(
        id: sosRequest.id,
        title: '🚨 CRITICAL ONE-TOUCH SOS',
        type: 'SOS',
        location: sosRequest.location,
        fullAddress: sosRequest.fullAddress,
        description: sosRequest.description,
        contactNumber: sosRequest.contactNumber,
        citizenName: _currentUser.fullName.isNotEmpty ? _currentUser.fullName : 'Citizen User',
        severity: 'High',
        latitude: lat,
        longitude: lng,
      );
      if (res == null || res['success'] != true) {
        throw StateError((res?['error'] ?? 'Failed to transmit SOS to Command Center').toString());
      }
      _requests.insert(0, sosRequest);
      _lastSubmittedRequest = sosRequest;
      if (res['incident'] is Map<String, dynamic>) {
        _updateRequestFromBackend(sosRequest.id, res['incident'] as Map<String, dynamic>);
      }
      CommandCenterService.startTrackingRequest(sosRequest.id, (update) {
        _updateRequestFromBackend(sosRequest.id, update);
      });
    } else {
      _requests.insert(0, sosRequest);
      _lastSubmittedRequest = sosRequest;
    }

    notifyListeners();
    await _persistNow();
    return sosRequest;
  }

  Future<EmergencyRequest> submitDraftReport() async {
    final now = DateTime.now();
    final newId =
        'RQ-${now.year.toString().substring(2)}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}-${now.hour.toString().padLeft(2, '0')}${now.minute.toString().padLeft(2, '0')}${now.second.toString().padLeft(2, '0')}-${(now.millisecond % 100).toString().padLeft(2, '0')}';

    final rawLat = _draftLatitude ?? _currentLatitude;
    final rawLng = _draftLongitude ?? _currentLongitude;
    if (rawLat == null || rawLng == null) {
      throw StateError('Live GPS or pinned location is required before sending an SOS.');
    }
    final lat = rawLat;
    final lng = rawLng;

    final catalogById = <String, String>{
      for (final item in availableResources)
        if ((item['id'] ?? '').toString().isNotEmpty)
          item['id'].toString(): (item['name'] ?? item['id']).toString(),
    };

    final selectedResources = _draftResources.entries
        .where((e) => e.value > 0)
        .map(
          (e) => RequestedResource(
            resourceId: e.key,
            name: catalogById[e.key] ?? e.key,
            quantity: e.value,
          ),
        )
        .toList();

    final resourcesPayload = selectedResources
        .map((r) => {'resourceId': r.resourceId, 'quantity': r.quantity})
        .toList();

    final newRequest = EmergencyRequest(
      id: newId,
      title: '${_draftType.title} assistance',
      type: _draftType,
      status: RequestStatus.pending,
      timeLabel: 'Today · ${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}',
      location: _draftAddress.contains(',')
          ? _draftAddress.split(',').sublist(1).join(',').trim()
          : _draftAddress,
      fullAddress: _draftCity.isNotEmpty ? '$_draftAddress, $_draftCity' : _draftAddress,
      dispatchUpdate: _isDemoMode
          ? 'Awaiting triage by Rescue Zone 04 Command'
          : 'Submitted · Awaiting command triage',
      dispatchIcon: Icons.hourglass_top,
      description: _draftDescription,
      contactNumber: _draftContact,
      photoCount: 1,
      photoAssetPath: _draftPhotoAsset,
      requestedResources: selectedResources,
      createdAt: now,
      isRecent: true,
    );

    if (!_isDemoMode) {
      final res = await CommandCenterService.sendEmergencyReport(
        id: newRequest.id,
        title: newRequest.title,
        type: _draftType.title,
        location: newRequest.location,
        fullAddress: newRequest.fullAddress,
        description: newRequest.description,
        contactNumber: newRequest.contactNumber,
        citizenName: _currentUser.fullName.isNotEmpty ? _currentUser.fullName : 'Citizen User',
        severity: _draftType == EmergencyType.flood ? 'High' : 'Medium',
        latitude: lat,
        longitude: lng,
        resources: resourcesPayload,
      );
      if (res == null || res['success'] != true) {
        throw StateError((res?['error'] ?? 'Failed to transmit report to Command Center').toString());
      }

      _requests.insert(0, newRequest);
      _lastSubmittedRequest = newRequest;
      _draftResources.clear();

      if (res['incident'] is Map<String, dynamic>) {
        _updateRequestFromBackend(newRequest.id, res['incident'] as Map<String, dynamic>);
      }
      CommandCenterService.startTrackingRequest(newRequest.id, (update) {
        _updateRequestFromBackend(newRequest.id, update);
      });
    } else {
      _requests.insert(0, newRequest);
      _lastSubmittedRequest = newRequest;
      _draftResources.clear();
    }

    notifyListeners();
    await _persistNow();
    return _lastSubmittedRequest ?? newRequest;
  }

  static List<RequestedResource> _parseRequestedResources(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => RequestedResource.fromJson(Map<String, dynamic>.from(e)))
        .where((r) => r.resourceId.isNotEmpty && r.quantity > 0)
        .toList();
  }

  /// Updates local emergency request status whenever Command Center dispatches a team
  void _updateRequestFromBackend(String requestId, Map<String, dynamic> update) {
    if (_isDemoMode) return;

    final index = _requests.indexWhere((r) => r.id == requestId);
    if (index == -1) return;

    final existing = _requests[index];
    final backendStatus = (update['status'] ?? '').toString().toLowerCase();
    final assignedTeam = (update['assignedTeam'] ?? update['teamAssigned'] ?? '').toString().trim();
    final assignedTeamId = (update['assignedTeamId'] ?? '').toString().trim();
    final eta = (update['eta'] ?? '').toString();

    String dispatchText = existing.dispatchUpdate;
    if (update['dispatchUpdate'] != null && update['dispatchUpdate'].toString().isNotEmpty) {
      dispatchText = update['dispatchUpdate'].toString();
    } else if (assignedTeam.isNotEmpty && assignedTeam != 'Unassigned' && assignedTeam != 'null') {
      dispatchText = '$assignedTeam is en route · ETA ${eta.isNotEmpty ? eta : "10 min"}';
    }

    RequestStatus newStatus = existing.status;
    if (backendStatus == 'resolved' || backendStatus == 'completed') {
      newStatus = RequestStatus.resolved;
    } else if (backendStatus == 'responding' || backendStatus == 'on site' || backendStatus == 'assigned') {
      newStatus = RequestStatus.assigned;
    } else if (backendStatus == 'verified') {
      newStatus = RequestStatus.inProgress;
    } else if (backendStatus == 'unverified') {
      newStatus = RequestStatus.pending;
    }

    final parsedRes = _parseRequestedResources(update['requestedResources']);
    final hasValidTeam =
        assignedTeam.isNotEmpty && assignedTeam != 'Unassigned' && assignedTeam != 'null';
    final hasValidTeamId = assignedTeamId.isNotEmpty && assignedTeamId != 'null';
    _requests[index] = existing.copyWith(
      status: newStatus,
      dispatchUpdate: dispatchText,
      assignedTeam: hasValidTeam ? assignedTeam : existing.assignedTeam,
      assignedTeamId: hasValidTeamId ? assignedTeamId : existing.assignedTeamId,
      requestedResources: parsedRes.isNotEmpty ? parsedRes : existing.requestedResources,
    );

    if (_lastSubmittedRequest?.id == requestId) {
      _lastSubmittedRequest = _requests[index];
    }

    notifyListeners();
    _schedulePersist();
  }

  Future<void> loadMyRequestsFromBackend() async {
    if (_isDemoMode) return;
    _loadingRequests = true;
    notifyListeners();
    try {
      final phone = _currentUser.phoneNumber.isNotEmpty
          ? _currentUser.phoneNumber
          : _phoneNumber;

      final rows = await CommandCenterService.fetchMyRequests(phone);
      if (_isDemoMode) return;
      if (CommandCenterService.lastRequestsFetchSucceeded) {
        _requests
          ..clear()
          ..addAll(rows.map(_mapBackendIncident));
        if (_requests.isNotEmpty) {
          _lastSubmittedRequest ??= _requests.first;
          for (final req in _requests) {
            if (req.status != RequestStatus.resolved) {
              CommandCenterService.startTrackingRequest(req.id, (update) {
                _updateRequestFromBackend(req.id, update);
              });
            }
          }
        }
        _schedulePersist();
      }
    } finally {
      _loadingRequests = false;
      notifyListeners();
    }
  }

  Future<void> loadAlertsFromBackend() async {
    if (_isDemoMode) return;
    _loadingAlerts = true;
    notifyListeners();
    try {
      final rows = await CommandCenterService.fetchAlerts();
      if (_isDemoMode) return;
      if (CommandCenterService.lastAlertsFetchSucceeded) {
        _liveAlerts = rows;
        _schedulePersist();
      }
    } finally {
      _loadingAlerts = false;
      notifyListeners();
    }
  }

  Future<void> loadResourcesFromBackend() async {
    if (_isDemoMode) return;
    _loadingResources = true;
    _resourcesError = null;
    notifyListeners();
    try {
      final rows = await CommandCenterService.fetchResources();
      if (_isDemoMode) return;
      if (rows.isEmpty) {
        _resourcesError = 'No resource catalog loaded from Command Center.';
      } else {
        _availableResources = rows;
        _schedulePersist();
      }
    } catch (e) {
      _resourcesError = e.toString();
    } finally {
      _loadingResources = false;
      notifyListeners();
    }
  }

  List<Map<String, dynamic>> chatMessagesForIncident(String incidentId) {
    return List.unmodifiable(_incidentChats[incidentId] ?? const []);
  }

  Map<String, dynamic>? latestChatMessageForIncident(String incidentId) {
    final list = _incidentChats[incidentId];
    if (list == null || list.isEmpty) return null;
    return list.last;
  }

  void _appendChatMessage(String incidentId, Map<String, dynamic> rawMsg) {
    final msg = Map<String, dynamic>.from(rawMsg);
    final list = _incidentChats.putIfAbsent(incidentId, () => []);
    final msgId = (msg['id'] ?? '').toString();
    final alreadyExists = msgId.isNotEmpty && list.any((m) => m['id']?.toString() == msgId);
    if (alreadyExists) return;
    list.add(msg);
    notifyListeners();
    _schedulePersist();
  }

  Future<String?> loadIncidentChat(String incidentId) async {
    if (_isDemoMode) return null;
    final res = await CommandCenterService.fetchIncidentChat(incidentId);
    if (res['success'] == true) {
      final rawMessages = res['messages'];
      if (rawMessages is List) {
        final serverMsgs = rawMessages
            .whereType<Map>()
            .map((m) => Map<String, dynamic>.from(m))
            .toList();
        final serverIds = serverMsgs
            .map((m) => (m['id'] ?? '').toString())
            .where((id) => id.isNotEmpty)
            .toSet();
        final existing = _incidentChats[incidentId] ?? const [];
        final merged = <Map<String, dynamic>>[
          ...serverMsgs,
          ...existing.where((m) {
            final id = (m['id'] ?? '').toString();
            return id.isNotEmpty && !serverIds.contains(id);
          }),
        ];
        _incidentChats[incidentId] = merged;
      }

      // Synchronize assignment fields in case dispatch arrived before poll tick
      final teamName = (res['assignedTeam'] ?? '').toString().trim();
      final teamId = (res['assignedTeamId'] ?? '').toString().trim();
      if (teamName.isNotEmpty || teamId.isNotEmpty) {
        final idx = _requests.indexWhere((r) => r.id == incidentId);
        if (idx != -1) {
          _requests[idx] = _requests[idx].copyWith(
            assignedTeam: teamName.isNotEmpty ? teamName : _requests[idx].assignedTeam,
            assignedTeamId: teamId.isNotEmpty ? teamId : _requests[idx].assignedTeamId,
          );
          if (_lastSubmittedRequest?.id == incidentId) {
            _lastSubmittedRequest = _requests[idx];
          }
        }
      }

      notifyListeners();
      _schedulePersist();
      return null;
    }
    if (res['networkError'] == true) return null;
    return res['error']?.toString();
  }

  Future<({bool ok, String? error})> sendIncidentChatMessage({
    required String incidentId,
    required String text,
  }) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) {
      return (ok: false, error: 'Message cannot be empty');
    }

    final reqIndex = _requests.indexWhere((r) => r.id == incidentId);
    final req = reqIndex != -1 ? _requests[reqIndex] : null;
    if (req == null || !req.hasAssignedTeam) {
      return (ok: false, error: 'A rescue team must be assigned before you can send messages.');
    }

    final now = DateTime.now();
    final msgId = 'cit_msg_${now.microsecondsSinceEpoch}';
    final senderName = _currentUser.fullName.isNotEmpty ? _currentUser.fullName : 'Citizen';
    final timeStr =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    final optimistic = <String, dynamic>{
      'id': msgId,
      'channel': 'incident-$incidentId',
      'sender': senderName,
      'senderRole': 'citizen',
      'role': 'Citizen',
      'initials': senderName.isNotEmpty ? senderName[0].toUpperCase() : 'C',
      'time': timeStr,
      'text': trimmed,
      'locationTag': _currentLocationName,
      'isSelf': true,
      'createdAt': now.toIso8601String(),
    };

    final list = _incidentChats.putIfAbsent(incidentId, () => []);
    list.add(optimistic);
    notifyListeners();
    _schedulePersist();

    if (_isDemoMode) {
      final teamName = req.assignedTeam ?? 'Rescue Team';
      Future.delayed(const Duration(milliseconds: 850), () {
        if (!_isDemoMode) return;
        final replyNow = DateTime.now();
        final replyTime =
            '${replyNow.hour.toString().padLeft(2, '0')}:${replyNow.minute.toString().padLeft(2, '0')}';
        _appendChatMessage(incidentId, {
          'id': 'demo_reply_${replyNow.microsecondsSinceEpoch}',
          'channel': 'incident-$incidentId',
          'sender': teamName,
          'senderRole': 'rescue',
          'role': '$teamName · Assigned Unit',
          'initials': teamName.isNotEmpty ? teamName[0].toUpperCase() : 'R',
          'time': replyTime,
          'text': 'Received by $teamName: "$trimmed". Keep this line open—we are tracking your location.',
          'isSelf': false,
          'createdAt': replyNow.toIso8601String(),
        });
      });
      return (ok: true, error: null);
    }

    final res = await CommandCenterService.sendIncidentChat(
      incidentId: incidentId,
      text: trimmed,
      id: msgId,
      sender: senderName,
      locationTag: _currentLocationName,
    );

    if (res['success'] == true) {
      if (res['message'] is Map) {
        final authoritative = Map<String, dynamic>.from(res['message'] as Map);
        final replaceIdx = list.indexWhere((m) => m['id'] == msgId);
        if (replaceIdx != -1) {
          list[replaceIdx] = authoritative;
        } else {
          _appendChatMessage(incidentId, authoritative);
        }
        notifyListeners();
        _schedulePersist();
      }
      return (ok: true, error: null);
    }

    if (res['networkError'] != true) {
      list.removeWhere((m) => m['id'] == msgId);
      notifyListeners();
      _schedulePersist();
      return (ok: false, error: res['error']?.toString() ?? 'Failed to send message');
    }

    return (ok: true, error: null);
  }

  void _startRealtimeSync() {
    if (_isDemoMode) return;
    CommandCenterService.startLiveUpdates(
      onEvent: (eventName, payload) {
        if (_isDemoMode) return;
        if (eventName == 'alert_created') {
          loadAlertsFromBackend();
          return;
        }
        if (eventName == 'new_chat_message') {
          final channel = (payload['channel'] ?? '').toString();
          final rawMsg = payload['message'];
          if (channel.startsWith('incident-') && rawMsg is Map) {
            final incId = (payload['incidentId'] ?? channel.substring('incident-'.length))
                .toString()
                .trim();
            if (incId.isNotEmpty) {
              _appendChatMessage(incId, Map<String, dynamic>.from(rawMsg));
            }
          }
          return;
        }
        final nested = payload['incident'] ?? payload['request'];
        final target = nested is Map<String, dynamic> ? nested : payload;
        final id = (target['id'] ?? target['incidentId'] ?? '').toString();
        if (id.isNotEmpty) {
          _updateRequestFromBackend(id, target);
        }
      },
      onPollTick: () {
        loadMyRequestsFromBackend();
        loadAlertsFromBackend();
      },
    );
  }

  EmergencyRequest _mapBackendIncident(Map<String, dynamic> row) {
    final id = (row['id'] ?? '').toString();
    final rawStatus = (row['status'] ?? 'pending').toString().toLowerCase();
    RequestStatus status = RequestStatus.pending;
    if (rawStatus == 'resolved' || rawStatus == 'completed') {
      status = RequestStatus.resolved;
    } else if (rawStatus == 'responding' ||
        rawStatus == 'on site' ||
        rawStatus == 'assigned') {
      status = RequestStatus.assigned;
    } else if (rawStatus == 'verified' || rawStatus == 'in_progress') {
      status = RequestStatus.inProgress;
    }

    final rawType = (row['type'] ?? '').toString().toLowerCase();
    EmergencyType type = EmergencyType.other;
    if (rawType.contains('flood') || rawType.contains('water')) {
      type = EmergencyType.flood;
    } else if (rawType.contains('quake') ||
        rawType.contains('landslide') ||
        rawType.contains('collapse')) {
      type = EmergencyType.earthquake;
    } else if (rawType.contains('fire')) {
      type = EmergencyType.fire;
    }

    final assignedTeam = (row['assignedTeam'] ?? row['teamAssigned'] ?? '').toString().trim();
    final assignedTeamId = (row['assignedTeamId'] ?? '').toString().trim();
    final hasValidTeam =
        assignedTeam.isNotEmpty && assignedTeam != 'Unassigned' && assignedTeam != 'null';
    final hasValidTeamId = assignedTeamId.isNotEmpty && assignedTeamId != 'null';
    final dispatchUpdate = hasValidTeam
        ? '$assignedTeam assigned by Command Center'
        : (row['dispatchUpdate'] ?? 'Awaiting triage by Command Center').toString();

    final createdAt = DateTime.tryParse((row['reportedAt'] ?? row['createdAt'] ?? '').toString()) ??
        DateTime.now();

    return EmergencyRequest(
      id: id,
      title: (row['title'] ?? 'Emergency SOS').toString(),
      type: type,
      status: status,
      timeLabel:
          '${createdAt.hour.toString().padLeft(2, '0')}:${createdAt.minute.toString().padLeft(2, '0')}',
      location: (row['location'] ?? '').toString(),
      fullAddress: (row['location'] ?? '').toString(),
      dispatchUpdate: dispatchUpdate,
      dispatchIcon:
          status == RequestStatus.resolved ? Icons.check_circle : Icons.emergency,
      description: (row['description'] ?? '').toString(),
      contactNumber: (row['contactNumber'] ?? _currentUser.phoneNumber).toString(),
      photoCount: 0,
      requestedResources: _parseRequestedResources(row['requestedResources']),
      assignedTeam: hasValidTeam ? assignedTeam : null,
      assignedTeamId: hasValidTeamId ? assignedTeamId : null,
      createdAt: createdAt,
      isRecent: true,
    );
  }
}
