class Incident {
  final String id;
  final String title;
  final String location;
  final String timestamp;
  final String severity; // 'Critical', 'High', 'Medium', 'Info'
  final String status; // 'Active', 'Resolved' (filter bucket)
  final String? backendStatus; // 'Unverified', 'Verified', 'Responding', 'On site', 'Resolved'
  final String teamAssigned;
  final String? assignedTeamId;
  final String eta;
  final int affectedCount;
  final String coordinates;
  final double? lat;
  final double? lng;
  final String description;
  final String substatus;
  final String? citizenName;
  final String? contactNumber;
  final String? fieldReport;
  final List<Map<String, dynamic>> requestedResources;
  final bool isCitizenSos;
  final String? photoAssetPath;

  String get displayStatus => (backendStatus != null && backendStatus!.isNotEmpty)
      ? backendStatus!
      : status;

  bool isAssignedTo({String? teamId, String? teamName, String? userName}) {
    if (teamId != null &&
        teamId.isNotEmpty &&
        assignedTeamId != null &&
        assignedTeamId!.isNotEmpty &&
        assignedTeamId == teamId) {
      return true;
    }
    final assignedLower = teamAssigned.trim().toLowerCase();
    if (assignedLower.isEmpty || assignedLower == 'unassigned') return false;
    if (teamName != null &&
        teamName.trim().isNotEmpty &&
        assignedLower == teamName.trim().toLowerCase()) {
      return true;
    }
    if (userName != null &&
        userName.trim().isNotEmpty &&
        assignedLower == userName.trim().toLowerCase()) {
      return true;
    }
    return false;
  }

  const Incident({
    required this.id,
    required this.title,
    required this.location,
    required this.timestamp,
    required this.severity,
    required this.status,
    this.backendStatus,
    required this.teamAssigned,
    this.assignedTeamId,
    required this.eta,
    required this.affectedCount,
    required this.coordinates,
    this.lat,
    this.lng,
    required this.description,
    required this.substatus,
    this.citizenName,
    this.contactNumber,
    this.fieldReport,
    this.requestedResources = const [],
    this.isCitizenSos = false,
    this.photoAssetPath,
  });

  factory Incident.fromJson(Map<String, dynamic> json) {
    String coordsStr = 'GPS fix pending';
    double? parsedLat;
    double? parsedLng;
    if (json['coordinates'] != null) {
      final c = json['coordinates'];
      if (c is Map) {
        final rawLat = c['lat'] ?? c['latitude'];
        final rawLng = c['lng'] ?? c['longitude'];
        parsedLat = rawLat is num
            ? rawLat.toDouble()
            : double.tryParse(rawLat?.toString() ?? '');
        parsedLng = rawLng is num
            ? rawLng.toDouble()
            : double.tryParse(rawLng?.toString() ?? '');
        if (parsedLat != null && parsedLng != null) {
          coordsStr =
              '${parsedLat.toStringAsFixed(4)}° N, ${parsedLng.toStringAsFixed(4)}° E';
        }
      } else {
        coordsStr = c.toString();
      }
    }

    final rawStatus = (json['status'] ?? 'Active').toString();
    final normalizedStatus =
        (rawStatus.toLowerCase() == 'resolved') ? 'Resolved' : 'Active';

    final rawResources = json['requestedResources'];
    final List<Map<String, dynamic>> parsedResources = [];
    if (rawResources is List) {
      for (final item in rawResources) {
        if (item is Map) {
          parsedResources.add(Map<String, dynamic>.from(item));
        }
      }
    }

    final rawAffected = json['affected'] ?? json['affectedCount'];
    final int affected = rawAffected is num
        ? rawAffected.toInt()
        : (int.tryParse(rawAffected?.toString() ?? '') ?? 1);

    final rawTeam = (json['assignedTeam'] ?? json['teamAssigned'] ?? '').toString().trim();

    return Incident(
      id: (json['id'] ?? 'INC-001').toString(),
      title: (json['title'] ?? 'Emergency Incident').toString(),
      location:
          (json['location'] ?? json['area'] ?? json['fullAddress'] ?? 'Disaster Response Zone')
              .toString(),
      timestamp:
          (json['time'] ?? json['timestamp'] ?? json['createdAt'] ?? 'Just now')
              .toString(),
      severity: (json['severity'] ?? 'High').toString(),
      status: normalizedStatus,
      backendStatus: rawStatus,
      teamAssigned: rawTeam.isNotEmpty ? rawTeam : 'Unassigned',
      assignedTeamId: json['assignedTeamId']?.toString(),
      eta: (json['eta'] ?? 'Standby').toString(),
      affectedCount: affected,
      coordinates: coordsStr,
      lat: parsedLat,
      lng: parsedLng,
      description:
          (json['description'] ?? 'Field operations in progress').toString(),
      substatus: (json['substatus'] ??
              json['responseDetail'] ??
              json['responseSummary'] ??
              'Live operational response')
          .toString(),
      citizenName: json['citizenName']?.toString(),
      contactNumber: json['contactNumber']?.toString(),
      fieldReport: json['fieldReport']?.toString(),
      requestedResources: parsedResources,
      isCitizenSos: json['isCitizenSOS'] == true || json['isCitizenSos'] == true,
      photoAssetPath: json['photoAssetPath'] as String?,
    );
  }

  Incident copyWith({
    String? id,
    String? title,
    String? location,
    String? timestamp,
    String? severity,
    String? status,
    String? backendStatus,
    String? teamAssigned,
    String? assignedTeamId,
    String? eta,
    int? affectedCount,
    String? coordinates,
    double? lat,
    double? lng,
    String? description,
    String? substatus,
    String? citizenName,
    String? contactNumber,
    String? fieldReport,
    List<Map<String, dynamic>>? requestedResources,
    bool? isCitizenSos,
    String? photoAssetPath,
  }) {
    return Incident(
      id: id ?? this.id,
      title: title ?? this.title,
      location: location ?? this.location,
      timestamp: timestamp ?? this.timestamp,
      severity: severity ?? this.severity,
      status: status ?? this.status,
      backendStatus: backendStatus ?? this.backendStatus,
      teamAssigned: teamAssigned ?? this.teamAssigned,
      assignedTeamId: assignedTeamId ?? this.assignedTeamId,
      eta: eta ?? this.eta,
      affectedCount: affectedCount ?? this.affectedCount,
      coordinates: coordinates ?? this.coordinates,
      lat: lat ?? this.lat,
      lng: lng ?? this.lng,
      description: description ?? this.description,
      substatus: substatus ?? this.substatus,
      citizenName: citizenName ?? this.citizenName,
      contactNumber: contactNumber ?? this.contactNumber,
      fieldReport: fieldReport ?? this.fieldReport,
      requestedResources: requestedResources ?? this.requestedResources,
      isCitizenSos: isCitizenSos ?? this.isCitizenSos,
      photoAssetPath: photoAssetPath ?? this.photoAssetPath,
    );
  }

  static List<Incident> mockIncidents() {
    return [
      const Incident(
        id: 'INC-101',
        title: 'Flood Alert',
        location: 'Joshimath, Uttarakhand',
        timestamp: '12 Oct 2026 · 10:24 AM',
        severity: 'High',
        status: 'Active',
        teamAssigned: 'Team Alpha',
        eta: '12 min',
        affectedCount: 247,
        coordinates: '30.5562° N, 79.5670° E',
        description: 'Flash flood alert in Joshimath lower valley. Water level rising 0.8m at Bridge 2. Access road blocked.',
        substatus: 'Team assigned · Team Alpha · ETA 12 min',
        photoAssetPath: 'assets/images/scenarios/flood_response_street.png',
      ),
      const Incident(
        id: 'INC-102',
        title: 'Landslide Risk',
        location: 'Chamoli, Uttarakhand',
        timestamp: '11 Oct 2026 · 08:45 PM',
        severity: 'Medium',
        status: 'Active',
        teamAssigned: 'District SAR',
        eta: '25 min',
        affectedCount: 85,
        coordinates: '30.4000° N, 79.3300° E',
        description: 'Slope instability along NH-07 near Km 42. Multiple rockfall events recorded.',
        substatus: 'Escalated · District response notified',
        photoAssetPath: 'assets/images/scenarios/earthquake_rubble_collapse.png',
      ),
      const Incident(
        id: 'INC-103',
        title: 'Earthquake',
        location: 'Pithoragarh, Uttarakhand',
        timestamp: '10 Oct 2026 · 02:17 PM',
        severity: 'Medium',
        status: 'Active',
        teamAssigned: 'Team Delta',
        eta: 'Standby',
        affectedCount: 42,
        coordinates: '29.5800° N, 80.2200° E',
        description: 'Magnitude 4.2 seismic tremors recorded in Border Sector. Structural cracks in 3 buildings.',
        substatus: 'Monitoring · Team Delta · Standby',
        photoAssetPath: 'assets/images/scenarios/night_canyon_search.png',
      ),
      const Incident(
        id: 'INC-104',
        title: 'Heavy Rain',
        location: 'Dehradun, Uttarakhand',
        timestamp: '09 Oct 2026 · 11:32 AM',
        severity: 'Info',
        status: 'Resolved',
        teamAssigned: 'Urban Rapid',
        eta: 'Completed',
        affectedCount: 15,
        coordinates: '30.3165° N, 78.0322° E',
        description: 'Torrential mountain downpour subsided. Low risk water logging cleared.',
        substatus: 'Resolved · Weather advisory · Low risk',
        photoAssetPath: 'assets/images/scenarios/highway_ambulance_storm.png',
      ),
    ];
  }
}
