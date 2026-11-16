import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/emergency_type.dart';
import '../models/emergency_request.dart';
import '../models/hazard_zone.dart';
import '../models/rescue_team.dart';
import '../models/safety_guide.dart';
import '../models/user_profile.dart';
import '../services/command_center_service.dart';
import '../services/account_storage_service.dart';

class RescueProvider extends ChangeNotifier {
  RescueProvider() {
    initLocationTracking();
    CommandCenterService.watchPublicAlerts(_receivePublicAlert);
    CommandCenterService.fetchAlerts().then((alerts) {
      if (!_isDemoMode && alerts.isNotEmpty) {
        _liveAlerts = alerts;
        notifyListeners();
      }
    });
  }

  void _receivePublicAlert(Map<String, dynamic> alert) {
    if (_isDemoMode) return;
    final id = (alert['id'] ?? '').toString();
    _liveAlerts = [alert, ..._liveAlerts.where((item) => item['id']?.toString() != id)];
    notifyListeners();
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
  }

  void setThemeMode(bool isDark) {
    _isDarkMode = isDark;
    notifyListeners();
  }

  // Demo mode state
  bool _isDemoMode = false;
  bool get isDemoMode => _isDemoMode;

  // Authentication & Session
  bool _isLoggedIn = false;
  String _authMethod = 'email';
  String _phoneNumber = '';
  String _email = '';
  final List<String> _otpDigits = ['', '', '', '', '', ''];
  bool _hasOtpError = false;
  String _currentLocationName = 'Dehradun, Uttarakhand';
  double _currentLatitude = 30.3165;
  double _currentLongitude = 78.0322;

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
  List<Map<String, dynamic>> get liveAlerts => _liveAlerts;

  // Requests Tab Filter (0: Recent, 1: All requests)
  int _requestsFilterTab = 0;

  // Emergency Creation Wizard Draft
  EmergencyType _draftType = EmergencyType.flood;
  String _draftAddress = 'Rajpur Road, Sector 01';
  String _draftCity = 'Dehradun, Uttarakhand 248001';
  double? _draftLatitude = 30.3165;
  double? _draftLongitude = 78.0322;
  String _draftDescription =
      'Flash flood waters rising near Alaknanda gorge. Multiple families require extraction assistance.';
  String _draftContact = '';
  bool _draftConsent = true;
  String _draftPhotoAsset = 'assets/images/scenarios/flood_river_boat.png';
  String _draftPhotoName = 'flood_boat_evidence.png · 1.2 MB';

  // Short-lived SOS capabilities are kept only in memory and never included in profile storage.
  final Map<String, String> _trackingTokens = {};
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

  // Requests Data Repository
  final List<EmergencyRequest> _requests = [
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
  double get currentLatitude => _draftLatitude ?? _currentLatitude;
  double get currentLongitude => _draftLongitude ?? _currentLongitude;

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
  EmergencyRequest? get lastSubmittedRequest => _lastSubmittedRequest ?? _requests.first;

  List<EmergencyRequest> get allRequests => List.unmodifiable(_requests);
  List<EmergencyRequest> get recentRequests =>
      _requests.where((r) => r.isRecent).toList();
  List<EmergencyRequest> get filteredRequests =>
      _requestsFilterTab == 0 ? recentRequests : allRequests;

  EmergencyRequest get latestRequest => _requests.first;

  List<RescueTeam> get rescueTeams => List.unmodifiable(_rescueTeams);
  List<HazardZone> get hazardZones => List.unmodifiable(_hazardZones);
  List<SafetyGuide> get safetyGuides => List.unmodifiable(_safetyGuides);

  // Actions
  void setAuthMethod(String method) {
    _authMethod = 'email';
    notifyListeners();
  }

  Future<String?> requestPasswordReset(String email) async {
    final address = email.trim().toLowerCase();
    if (!address.contains('@')) return 'Enter your account email first.';
    try {
      await Supabase.instance.client.auth.resetPasswordForEmail(address);
      return null;
    } on AuthException catch (error) {
      return error.message.toLowerCase().contains('rate')
          ? 'Too many reset attempts. Try again later.'
          : 'Could not request a password reset. Check the email and try again.';
    } catch (_) {
      return 'Password reset is unavailable. Try again later.';
    }
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

  void enterPublicSosMode() {
    _isDemoMode = false;
    _isLoggedIn = true;
    _hasOtpError = false;
    _currentUser = const UserProfile(
      fullName: 'Citizen',
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
    _requests.clear();
    _rescueTeams.clear();
    _lastSubmittedRequest = null;
    _trackingTokens.clear();
    CommandCenterService.watchPublicAlerts(_receivePublicAlert);
    CommandCenterService.fetchAlerts().then((alerts) {
      if (!_isDemoMode && alerts.isNotEmpty) {
        _liveAlerts = alerts;
        notifyListeners();
      }
    });
    notifyListeners();
  }

  /// Launch app directly in Demo Mode without requiring login or sign up
  void enterDemoMode() {
    _isDemoMode = true;
    _isLoggedIn = true;
    _hasOtpError = false;
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
  }

  void login() {
    // The legacy local OTP screen is not an authentication authority.
    _hasOtpError = true;
    _isLoggedIn = false;
    notifyListeners();
  }

  Future<String?> loginWithGoogle() async => 'Use email and password to sign in.';

  Future<String?> loginWithPassword({
    required String identifier,
    required String password,
  }) async {
    final email = identifier.trim().toLowerCase();
    if (!email.contains('@')) return 'Use your email address to sign in.';
    if (password.isEmpty) return 'Please enter your password.';

    try {
      final response = await Supabase.instance.client.auth.signInWithPassword(email: email, password: password);
      final user = response.user;
      if (user == null) return 'Invalid email or password.';
      final metadata = user.userMetadata ?? const <String, dynamic>{};
      final saved = await AccountStorageService.findByEmail(email);
      _currentUser = saved ?? UserProfile(
        fullName: (metadata['full_name'] ?? user.email ?? email).toString(),
        phoneNumber: (metadata['phone'] ?? '').toString(),
        email: user.email ?? email,
        bloodGroup: (metadata['blood_group'] ?? '').toString(),
        emergencyContactName: (metadata['emergency_contact_name'] ?? '').toString(),
        emergencyContactPhone: (metadata['emergency_contact_phone'] ?? '').toString(),
        address: (metadata['address'] ?? '').toString(),
        sector: (metadata['sector'] ?? '').toString(),
        medicalNotes: (metadata['medical_notes'] ?? '').toString(),
        isRegistered: true,
      );
      _email = email;
      _authMethod = 'email';
      _isDemoMode = false;
      _isLoggedIn = true;
      _hasOtpError = false;
      CommandCenterService.watchPublicAlerts(_receivePublicAlert);
      notifyListeners();
      return null;
    } on AuthException catch (error) {
      if (error.message.toLowerCase().contains('confirm')) return 'Confirm your email before signing in.';
      return 'Invalid email or password.';
    } catch (_) {
      return 'Sign-in is unavailable. Check your connection and try again.';
    }
  }

  Future<UserProfile?> lookupAccount({String? phone, String? email}) async {
    if (email == null || email.trim().isEmpty) return null;
    return AccountStorageService.findByEmail(email);
  }

  void loginWithSavedAccount(UserProfile profile) {
    _email = profile.email;
    _authMethod = 'email';
    _isLoggedIn = false;
    _hasOtpError = true;
    notifyListeners();
  }

  void logout() {
    CommandCenterService.stopAllTracking();
    CommandCenterService.stopWatchingPublicAlerts();
    _trackingTokens.clear();
    try { Supabase.instance.client.auth.signOut(); } catch (_) {}
    _isLoggedIn = false;
    _isDemoMode = false;
    _hasOtpError = true;
    notifyListeners();
  }

  /// Creates a citizen account with Supabase Auth and never stores its password locally.
  Future<bool> registerNewAccount(UserProfile profile, {required String password}) async {
    final email = profile.email.trim().toLowerCase();
    if (!email.contains('@') || password.length < 6) {
      throw StateError('Enter a valid email and a password with at least 6 characters.');
    }
    final response = await Supabase.instance.client.auth.signUp(
      email: email,
      password: password,
      data: {
        'full_name': profile.fullName,
        'phone': profile.phoneNumber,
        'blood_group': profile.bloodGroup,
        'emergency_contact_name': profile.emergencyContactName,
        'emergency_contact_phone': profile.emergencyContactPhone,
        'address': profile.address,
        'sector': profile.sector,
        'medical_notes': profile.medicalNotes,
      },
    );
    if (response.session == null || response.user == null) return false;

    _currentUser = profile;
    _email = email;
    _authMethod = 'email';
    _isDemoMode = false;
    _isLoggedIn = true;
    _hasOtpError = false;
    CommandCenterService.watchPublicAlerts(_receivePublicAlert);
    notifyListeners();
    return true;
  }

  void setActiveNavIndex(int index) {
    _activeNavIndex = index;
    notifyListeners();
  }

  void setRequestsFilterTab(int tab) {
    _requestsFilterTab = tab;
    notifyListeners();
  }

  void setDraftType(EmergencyType type) {
    _draftType = type;
    _draftPhotoAsset = type.imagePath;
    _draftPhotoName = '${type.id}_incident_recon.png · 1.4 MB';
    notifyListeners();
  }

  void setDraftPhoto(String asset, String name) {
    _draftPhotoAsset = asset;
    _draftPhotoName = name;
    notifyListeners();
  }

  void setDraftAddress(String address, [String? city]) {
    _draftAddress = address;
    if (city != null) _draftCity = city;
    notifyListeners();
  }

  void setDraftCoordinates(double latitude, double longitude) {
    _draftLatitude = latitude;
    _draftLongitude = longitude;
    notifyListeners();
  }

  void setDraftDescription(String desc) {
    _draftDescription = desc;
    notifyListeners();
  }

  void setDraftContact(String contact) {
    _draftContact = contact;
    notifyListeners();
  }

  void setDraftConsent(bool consent) {
    _draftConsent = consent;
    notifyListeners();
  }

  void setCurrentLocation(String location) {
    _currentLocationName = location;
    notifyListeners();
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

    final lat = _draftLatitude ?? _currentLatitude;
    final lng = _draftLongitude ?? _currentLongitude;

    final sosRequest = EmergencyRequest(
      id: newId,
      title: '🚨 CRITICAL ONE-TOUCH SOS',
      type: EmergencyType.other,
      status: RequestStatus.inProgress,
      timeLabel: 'Just now · ${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}',
      location: _currentLocationName,
      fullAddress: '$_draftAddress, $_draftCity',
      dispatchUpdate: 'Priority 1 SOS alert dispatched to Command Center & field units',
      dispatchIcon: Icons.emergency,
      description:
          'Automated One-Touch SOS triggered from ${_currentUser.fullName.isNotEmpty ? _currentUser.fullName : "Citizen"}. Immediate rescue assistance required at GPS lock ($lat, $lng).',
      contactNumber: _currentUser.phoneNumber,
      photoCount: 0,
      createdAt: now,
      isRecent: true,
    );

    _requests.insert(0, sosRequest);
    _lastSubmittedRequest = sosRequest;

    var submittedRequest = sosRequest;
    if (!_isDemoMode) {
      final response = await CommandCenterService.sendEmergencyReport(
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
      if (response == null) {
        _requests.removeWhere((request) => request.id == sosRequest.id);
        _lastSubmittedRequest = null;
        throw StateError('Could not send the SOS. Check your connection and retry.');
      }
      final incident = response['incident'] as Map<String, dynamic>? ?? {};
      final trackingToken = response['trackingToken']?.toString() ?? '';
      final serverId = incident['id']?.toString() ?? sosRequest.id;
      submittedRequest = sosRequest.copyWith(id: serverId, status: RequestStatus.pending);
      _requests[_requests.indexWhere((request) => request.id == sosRequest.id)] = submittedRequest;
      _lastSubmittedRequest = submittedRequest;
      if (trackingToken.isNotEmpty) {
        _trackingTokens[serverId] = trackingToken;
        unawaited(CommandCenterService.startTrackingRequest(serverId, trackingToken: trackingToken, onUpdate: (update) => _updateRequestFromBackend(serverId, update)));
      }
    }

    notifyListeners();
    return submittedRequest;
  }

  Future<EmergencyRequest> submitDraftReport() async {
    final now = DateTime.now();
    final newId =
        'RQ-${now.year.toString().substring(2)}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}-${(now.hour * 100 + now.minute).toString().padLeft(4, '0')}';

    final lat = _draftLatitude ?? _currentLatitude;
    final lng = _draftLongitude ?? _currentLongitude;

    final newRequest = EmergencyRequest(
      id: newId,
      title: '${_draftType.title} assistance',
      type: _draftType,
      status: RequestStatus.pending,
      timeLabel: 'Today · ${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}',
      location: _draftAddress.contains(',')
          ? _draftAddress.split(',').sublist(1).join(',').trim()
          : _draftAddress,
      fullAddress: '$_draftAddress, $_draftCity',
      dispatchUpdate: 'Awaiting triage by Rescue Zone 04 Command',
      dispatchIcon: Icons.hourglass_top,
      description: _draftDescription,
      contactNumber: _draftContact,
      photoCount: 1,
      photoAssetPath: _draftPhotoAsset,
      createdAt: now,
      isRecent: true,
    );

    _requests.insert(0, newRequest);
    _lastSubmittedRequest = newRequest;

    var submittedRequest = newRequest;
    if (!_isDemoMode) {
      final response = await CommandCenterService.sendEmergencyReport(
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
      );
      if (response == null) {
        _requests.removeWhere((request) => request.id == newRequest.id);
        _lastSubmittedRequest = null;
        throw StateError('Could not submit the report. Check your connection and retry.');
      }
      final incident = response['incident'] as Map<String, dynamic>? ?? {};
      final trackingToken = response['trackingToken']?.toString() ?? '';
      final serverId = incident['id']?.toString() ?? newRequest.id;
      submittedRequest = newRequest.copyWith(id: serverId, status: RequestStatus.pending);
      _requests[_requests.indexWhere((request) => request.id == newRequest.id)] = submittedRequest;
      _lastSubmittedRequest = submittedRequest;
      if (trackingToken.isNotEmpty) {
        _trackingTokens[serverId] = trackingToken;
        unawaited(CommandCenterService.startTrackingRequest(serverId, trackingToken: trackingToken, onUpdate: (update) => _updateRequestFromBackend(serverId, update)));
      }
    }

    notifyListeners();
    return submittedRequest;
  }

  /// Updates local emergency request status whenever Command Center dispatches a team
  void _updateRequestFromBackend(String requestId, Map<String, dynamic> update) {
    if (_isDemoMode) return;

    final index = _requests.indexWhere((r) => r.id == requestId);
    if (index == -1) return;

    final existing = _requests[index];
    final backendStatus = (update['status'] ?? '').toString().toLowerCase();
    final assignedTeam = (update['assignedTeam'] ?? update['teamAssigned'] ?? '').toString();
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
    }

    _requests[index] = existing.copyWith(
      status: newStatus,
      dispatchUpdate: dispatchText,
    );

    if (newStatus == RequestStatus.resolved) {
      CommandCenterService.stopTrackingRequest(requestId);
      _trackingTokens.remove(requestId);
    }

    if (_lastSubmittedRequest?.id == requestId) {
      _lastSubmittedRequest = _requests[index];
    }

    notifyListeners();
  }
}
