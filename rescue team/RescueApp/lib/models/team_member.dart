class TeamMember {
  final String id;
  final String name;
  final String role;
  final String specialty;
  final int batteryLevel;
  final String status;
  final String distance;
  final String gpsCoords;
  final String avatarUrl;
  final String bloodGroup;

  const TeamMember({
    required this.id,
    required this.name,
    required this.role,
    required this.specialty,
    required this.batteryLevel,
    required this.status,
    required this.distance,
    required this.gpsCoords,
    required this.avatarUrl,
    required this.bloodGroup,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'role': role,
        'specialty': specialty,
        'batteryLevel': batteryLevel,
        'status': status,
        'distance': distance,
        'gpsCoords': gpsCoords,
        'avatarUrl': avatarUrl,
        'bloodGroup': bloodGroup,
      };

  factory TeamMember.fromJson(Map<String, dynamic> json) => TeamMember(
        id: (json['id'] ?? '').toString(),
        name: (json['name'] ?? 'Operative').toString(),
        role: (json['role'] ?? 'Field Operative').toString(),
        specialty: (json['specialty'] ?? 'SAR').toString(),
        batteryLevel: (json['batteryLevel'] as num?)?.toInt() ?? 100,
        status: (json['status'] ?? 'Available').toString(),
        distance: (json['distance'] ?? 'Live').toString(),
        gpsCoords: (json['gpsCoords'] ?? 'Awaiting GPS').toString(),
        avatarUrl: (json['avatarUrl'] ?? '').toString(),
        bloodGroup: (json['bloodGroup'] ?? 'N/A').toString(),
      );
}

class RescueTeam {
  final String id;
  final String name;
  final String sector;
  final String callsign;
  final String frequency;
  final String commanderName;
  final String commanderPhone;
  final String commanderExperience;
  final String commanderBloodGroup;
  final String commanderAvatar;
  final int syncedCount;
  final int totalCount;
  final String status;
  final List<TeamMember> members;

  const RescueTeam({
    required this.id,
    required this.name,
    required this.sector,
    required this.callsign,
    required this.frequency,
    required this.commanderName,
    required this.commanderPhone,
    required this.commanderExperience,
    required this.commanderBloodGroup,
    required this.commanderAvatar,
    required this.syncedCount,
    required this.totalCount,
    required this.status,
    required this.members,
  });

  RescueTeam copyWith({
    String? id,
    String? name,
    String? sector,
    String? callsign,
    String? frequency,
    String? commanderName,
    String? commanderPhone,
    String? commanderExperience,
    String? commanderBloodGroup,
    String? commanderAvatar,
    int? syncedCount,
    int? totalCount,
    String? status,
    List<TeamMember>? members,
  }) {
    return RescueTeam(
      id: id ?? this.id,
      name: name ?? this.name,
      sector: sector ?? this.sector,
      callsign: callsign ?? this.callsign,
      frequency: frequency ?? this.frequency,
      commanderName: commanderName ?? this.commanderName,
      commanderPhone: commanderPhone ?? this.commanderPhone,
      commanderExperience: commanderExperience ?? this.commanderExperience,
      commanderBloodGroup: commanderBloodGroup ?? this.commanderBloodGroup,
      commanderAvatar: commanderAvatar ?? this.commanderAvatar,
      syncedCount: syncedCount ?? this.syncedCount,
      totalCount: totalCount ?? this.totalCount,
      status: status ?? this.status,
      members: members ?? this.members,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'sector': sector,
        'callsign': callsign,
        'frequency': frequency,
        'commanderName': commanderName,
        'commanderPhone': commanderPhone,
        'commanderExperience': commanderExperience,
        'commanderBloodGroup': commanderBloodGroup,
        'commanderAvatar': commanderAvatar,
        'syncedCount': syncedCount,
        'totalCount': totalCount,
        'status': status,
        'members': members.map((m) => m.toJson()).toList(),
      };

  /// Parses either a locally cached [RescueTeam] payload or a backend `/api/teams` payload.
  factory RescueTeam.fromJson(
    Map<String, dynamic> t, {
    String fallbackCommander = 'Field Lead',
    String fallbackPhone = '',
  }) {
    final id = (t['id'] ?? '').toString();
    final name = (t['name'] ?? 'Rescue Unit').toString();
    final coords = t['coordinates'] is Map
        ? Map<String, dynamic>.from(t['coordinates'] as Map)
        : null;
    final lat = (coords?['lat'] ?? coords?['latitude'] as num?)?.toDouble();
    final lng = (coords?['lng'] ?? coords?['longitude'] as num?)?.toDouble();
    final gpsStr = (lat != null && lng != null)
        ? '${lat.toStringAsFixed(4)}° N, ${lng.toStringAsFixed(4)}° E'
        : 'Awaiting GPS';

    final commander = (t['commanderName'] ?? t['lead'] ?? '')
            .toString()
            .trim()
            .isNotEmpty
        ? (t['commanderName'] ?? t['lead']).toString()
        : (fallbackCommander.isNotEmpty ? fallbackCommander : name);
    final phone = (t['commanderPhone'] ?? t['phone'] ?? '')
            .toString()
            .trim()
            .isNotEmpty
        ? (t['commanderPhone'] ?? t['phone']).toString()
        : fallbackPhone;
    final total = (t['totalCount'] as num?)?.toInt() ??
        (t['responders'] as num?)?.toInt() ??
        (t['personnel'] as num?)?.toInt() ??
        4;
    final synced = (t['syncedCount'] as num?)?.toInt() ?? total;
    final specialization = (t['specialization'] ?? t['type'] ?? 'SAR').toString();
    final sector = (t['sector'] ?? t['sectorId'] ?? specialization).toString();
    final status = (t['status'] ?? 'Available').toString();
    final rawCallsign = (t['callsign'] ?? '').toString().trim();
    final callsign = rawCallsign.isNotEmpty
        ? rawCallsign
        : (id.isNotEmpty ? id : name.toUpperCase());

    final rawMembers = t['members'];
    final List<TeamMember> parsedMembers;
    if (rawMembers is List && rawMembers.isNotEmpty) {
      parsedMembers = rawMembers
          .whereType<Map>()
          .map((m) => TeamMember.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } else {
      parsedMembers = [
        TeamMember(
          id: '$id-lead',
          name: commander,
          role: specialization,
          specialty: specialization,
          batteryLevel: (t['battery'] as num?)?.toInt() ?? 100,
          status: status,
          distance: 'Live',
          gpsCoords: gpsStr,
          avatarUrl: '',
          bloodGroup: 'N/A',
        ),
      ];
    }

    return RescueTeam(
      id: id,
      name: name,
      sector: sector.isNotEmpty ? sector : 'Field Sector',
      callsign: callsign,
      frequency: (t['frequency'] ?? 'Ch 4A (156.8MHz)').toString(),
      commanderName: commander,
      commanderPhone: phone,
      commanderExperience:
          (t['commanderExperience'] ?? 'Active Field Unit').toString(),
      commanderBloodGroup: (t['commanderBloodGroup'] ?? 'N/A').toString(),
      commanderAvatar: (t['commanderAvatar'] ?? '').toString(),
      syncedCount: synced,
      totalCount: total,
      status: status,
      members: parsedMembers,
    );
  }

  static List<RescueTeam> mockTeams() {
    return [
      RescueTeam(
        id: 'TEAM-ALPHA',
        name: 'Team Alpha',
        sector: 'Mountain Quick Response • Sector 4 Grid Alpha',
        callsign: 'GARHWAL-01',
        frequency: 'Ch 4A (156.8MHz)',
        commanderName: 'Capt. Rajesh Negi',
        commanderPhone: '+91 98110 44201',
        commanderExperience: '12 Yrs NDRF Veteran',
        commanderBloodGroup: 'O+',
        commanderAvatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDndhddsN_XnhJ5wBRfjI05kxWo4mw-MS5sHHf1p7orshPp_2OG60PJfZJDBYFewJFmq92TU3LMgDrIOL2Ds1YTjctIlXMAr2r-b8SfqmQzZDTEENqlF_FpDTn1JxXmhuYJEAjdP2tpfAy6pRz7GTZfj_sWNS2evUQeeQr-Pu5BpY1JVXKZBtfJurtbLfWGbdsNERxO_3arxTH1PmSRulQGD3oU7HBGSjQZfXzPHrRszAqrqx3cbNQF',
        syncedCount: 4,
        totalCount: 4,
        status: 'OPR-READY',
        members: [
          const TeamMember(
            id: 'MEM-01',
            name: 'Priya Sharma',
            role: 'Paramedic',
            specialty: 'Lead Triage Specialist',
            batteryLevel: 88,
            status: 'Treating casualty',
            distance: '140m NW',
            gpsCoords: '30.5562° N, 79.5670° E',
            avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA2I7IUEx54A9JvR511lRlRkKrjQwuWfaZ3_M_2kSbOVth-fqSTRKSEV5io1QQ-O5yTe7iTR_2wVnt8cayhAEkZf3xsuozHCGxAMKxeRVuWlYOyM9o5xCh48ZJgZzHENt7zTXQby3Kj8MxbUCni7jET63feM3oINd8M7ilsZVB-TK8cm563babnaPLPz3kGpg_wnuCUoWb2-EglxQl9TwCmSf6ZT1mnZbqUpba6zBnJ7cqS-ZvQTLUa',
            bloodGroup: 'B+',
          ),
          const TeamMember(
            id: 'MEM-02',
            name: 'Vikram Singh',
            role: 'Technical Rescue',
            specialty: 'Rope & Crevasse Specialist',
            batteryLevel: 92,
            status: 'Ascending rope line',
            distance: '320m NE',
            gpsCoords: '30.5574° N, 79.5685° E',
            avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCDXV0JRMtl5gFf9nm8JEv1LTUj9hR_8XjquKXc98oKB2186qAqRFb6qO45CRVwB9ik41AAbcLB_1BQOnMXoq5J9rFOwsp_5NBLscuAQSb4PRG67SW1ig72MLX4Ah4OojAo4lNeWfNZ7QmeewB_QBLu5GYpJkAjg5c_zJJ6Rofw3frk-iBqE2MAUz_NEKYphLJYpc0Q14M8vKOkgQ0N95dDxOzxVfUuzbC8ICNH8NjzxWCbU-aIgVwp',
            bloodGroup: 'A+',
          ),
          const TeamMember(
            id: 'MEM-03',
            name: 'Amit Joshi',
            role: 'Sensors / Drone',
            specialty: 'FLIR Thermal Operator',
            batteryLevel: 75,
            status: 'Drone overwatch sector',
            distance: '450m S',
            gpsCoords: '30.5540° N, 79.5650° E',
            avatarUrl: '',
            bloodGroup: 'AB+',
          ),
          const TeamMember(
            id: 'MEM-04',
            name: 'Sunita Devi',
            role: 'Field Lead',
            specialty: 'Civilian Evac Coordinator',
            batteryLevel: 81,
            status: 'Navigating transport buggy',
            distance: '600m SE',
            gpsCoords: '30.5532° N, 79.5710° E',
            avatarUrl: '',
            bloodGroup: 'O+',
          ),
        ],
      ),
      const RescueTeam(
        id: 'TEAM-BRAVO',
        name: 'Team Bravo',
        sector: 'Alaknanda River Gorge SAR',
        callsign: 'GARHWAL-02',
        frequency: 'Ch 4B (156.85MHz)',
        commanderName: 'Maj. Vikramaditya Rathore',
        commanderPhone: '+91 94561 22890',
        commanderExperience: '15 Yrs Indian Army / SDRF',
        commanderBloodGroup: 'B+',
        commanderAvatar: '',
        syncedCount: 5,
        totalCount: 5,
        status: 'ON-ROUTE',
        members: [],
      ),
      const RescueTeam(
        id: 'TEAM-CHARLIE',
        name: 'Team Charlie',
        sector: 'High Altitude Helitac Rapid Unit',
        callsign: 'GARHWAL-03',
        frequency: 'Ch 4C (156.9MHz)',
        commanderName: 'Capt. Ananya Sen',
        commanderPhone: '+91 97600 11432',
        commanderExperience: '8 Yrs Aeromedical Evac',
        commanderBloodGroup: 'A-',
        commanderAvatar: '',
        syncedCount: 4,
        totalCount: 4,
        status: 'STANDBY',
        members: [],
      ),
    ];
  }
}
