class Incident {
  final String id;
  final String title;
  final String location;
  final String timestamp;
  final String severity; // 'High', 'Medium', 'Info'
  final String status; // 'Active', 'Resolved'
  final String teamAssigned;
  final String eta;
  final int affectedCount;
  final String coordinates;
  final String description;
  final String substatus;
  final String? photoAssetPath;

  const Incident({
    required this.id,
    required this.title,
    required this.location,
    required this.timestamp,
    required this.severity,
    required this.status,
    required this.teamAssigned,
    required this.eta,
    required this.affectedCount,
    required this.coordinates,
    required this.description,
    required this.substatus,
    this.photoAssetPath,
  });

  factory Incident.fromJson(Map<String, dynamic> json) {
    String coordsStr = '30.5562° N, 79.5670° E';
    if (json['coordinates'] != null) {
      final c = json['coordinates'];
      if (c is Map) {
        final lat = c['lat'] ?? c['latitude'] ?? '30.5562';
        final lng = c['lng'] ?? c['longitude'] ?? '79.5670';
        coordsStr = '$lat, $lng';
      } else {
        coordsStr = c.toString();
      }
    }

    final rawStatus = (json['status'] ?? 'Active').toString();
    final normalizedStatus = (rawStatus.toLowerCase() == 'resolved') ? 'Resolved' : 'Active';

    return Incident(
      id: (json['id'] ?? 'INC-001').toString(),
      title: (json['title'] ?? 'Emergency Incident').toString(),
      location: (json['location'] ?? json['fullAddress'] ?? 'Disaster Response Zone').toString(),
      timestamp: (json['time'] ?? json['timestamp'] ?? 'Today · Just now').toString(),
      severity: (json['severity'] ?? 'High').toString(),
      status: normalizedStatus,
      teamAssigned: (json['assignedTeam'] ?? json['teamAssigned'] ?? 'Unassigned').toString(),
      eta: (json['eta'] ?? 'Standby').toString(),
      affectedCount: (json['affected'] ?? json['affectedCount'] ?? 1) as int,
      coordinates: coordsStr,
      description: (json['description'] ?? 'Field operations in progress').toString(),
      substatus: (json['substatus'] ?? json['responseDetail'] ?? json['responseSummary'] ?? 'Live operational response').toString(),
      photoAssetPath: json['photoAssetPath'] as String? ?? 'assets/images/scenarios/flood_response_street.png',
    );
  }

  Incident copyWith({
    String? id,
    String? title,
    String? location,
    String? timestamp,
    String? severity,
    String? status,
    String? teamAssigned,
    String? eta,
    int? affectedCount,
    String? coordinates,
    String? description,
    String? substatus,
    String? photoAssetPath,
  }) {
    return Incident(
      id: id ?? this.id,
      title: title ?? this.title,
      location: location ?? this.location,
      timestamp: timestamp ?? this.timestamp,
      severity: severity ?? this.severity,
      status: status ?? this.status,
      teamAssigned: teamAssigned ?? this.teamAssigned,
      eta: eta ?? this.eta,
      affectedCount: affectedCount ?? this.affectedCount,
      coordinates: coordinates ?? this.coordinates,
      description: description ?? this.description,
      substatus: substatus ?? this.substatus,
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
