import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import '../theme/tactical_theme.dart';
import '../models/app_state.dart';
import '../models/incident.dart';
import '../models/team_member.dart';

// Default center: Joshimath, Uttarakhand (the operational theater)
const LatLng _kDefaultCenter = LatLng(30.5593, 79.5644);
const double _kDefaultZoom = 11.0;
const String _kGoogleMapsApiKey = 'AIzaSyAMaBxMmCY1r2TmqoMZUm2-v8FfhE1n44g';


class TacticalMapCanvas extends StatefulWidget {
  final double? height;
  final bool showControls;
  final ValueChanged<String>? onMarkerSelected;
  final AppState? appState;

  const TacticalMapCanvas({
    super.key,
    this.height,
    this.showControls = true,
    this.onMarkerSelected,
    this.appState,
  });

  @override
  State<TacticalMapCanvas> createState() => _TacticalMapCanvasState();
}

class _TacticalMapCanvasState extends State<TacticalMapCanvas> {
  final MapController _mapController = MapController();
  bool _showSatellite = true; // true = Esri Satellite (default high-contrast), false = OpenStreetMap
  LatLng? _myLocation;
  bool _locating = false;
  StreamSubscription<Position>? _positionStream;
  double _currentZoom = _kDefaultZoom;

  @override
  void initState() {
    super.initState();
    _startLocationTracking();
  }

  @override
  void dispose() {
    _positionStream?.cancel();
    super.dispose();
  }

  Future<void> _startLocationTracking() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return;
    }
    if (permission == LocationPermission.deniedForever) return;

    // Get initial position
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      if (mounted) {
        setState(() => _myLocation = LatLng(pos.latitude, pos.longitude));
        _mapController.move(_myLocation!, _currentZoom);
      }
    } catch (_) {}

    // Stream updates
    _positionStream = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen((pos) {
      if (mounted) {
        setState(() => _myLocation = LatLng(pos.latitude, pos.longitude));
      }
    });
  }

  Future<void> _centerOnMe() async {
    setState(() => _locating = true);
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      final loc = LatLng(pos.latitude, pos.longitude);
      setState(() {
        _myLocation = loc;
        _locating = false;
      });
      _mapController.move(loc, _currentZoom);
    } catch (_) {
      setState(() => _locating = false);
      // Fall back to operational center
      _mapController.move(_kDefaultCenter, _currentZoom);
    }
  }

  List<Marker> _buildIncidentMarkers() {
    final incidents = widget.appState?.incidents ?? [];
    return incidents.map((inc) {
      final coords = _parseCoords(inc.coordinates);
      if (coords == null) return null;

      final isActive = inc.status == 'Active' || inc.status == 'active' || inc.status == 'dispatched';
      final color = isActive ? TacticalColors.emergencyRed : TacticalColors.warningAmber;

      return Marker(
        point: coords,
        width: 48,
        height: 60,
        child: GestureDetector(
          onTap: () => widget.onMarkerSelected?.call('${inc.title}: ${inc.location}'),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: isActive
                      ? TacticalColors.emergencyRed.withOpacity(0.85)
                      : TacticalColors.surfaceContainerLowest.withOpacity(0.9),
                  shape: BoxShape.circle,
                  border: Border.all(color: color, width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: color.withOpacity(isActive ? 0.6 : 0.3),
                      blurRadius: isActive ? 14 : 8,
                      spreadRadius: isActive ? 2 : 1,
                    ),
                  ],
                ),
                child: Icon(
                  Icons.warning_amber,
                  color: isActive ? Colors.white : color,
                  size: 18,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: TacticalColors.surfaceContainerLowest.withOpacity(0.9),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  inc.title.length > 10 ? inc.title.substring(0, 10) : inc.title,
                  style: const TextStyle(
                    fontSize: 8,
                    fontWeight: FontWeight.w700,
                    color: TacticalColors.onSurface,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }).whereType<Marker>().toList();
  }

  List<Marker> _buildTeamMarkers() {
    final teams = widget.appState?.teams ?? [];
    final List<Marker> markers = [];
    for (final team in teams) {
      // Try to place marker from first member's gpsCoords
      for (final member in team.members) {
        final coords = _parseCoords(member.gpsCoords);
        if (coords != null) {
          markers.add(Marker(
            point: coords,
            width: 90,
            height: 32,
            child: GestureDetector(
              onTap: () => widget.onMarkerSelected?.call('${team.name}: ${member.name}'),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: TacticalColors.surfaceContainerLowest.withOpacity(0.9),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: TacticalColors.tertiary.withOpacity(0.5)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.verified_user, color: TacticalColors.tertiary, size: 12),
                    const SizedBox(width: 3),
                    Flexible(
                      child: Text(
                        team.name,
                        style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: TacticalColors.tertiary,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ));
          break; // one marker per team
        }
      }
    }
    return markers;
  }

  Marker? _buildMyLocationMarker() {
    if (_myLocation == null) return null;
    return Marker(
      point: _myLocation!,
      width: 60,
      height: 60,
      child: GestureDetector(
        onTap: () => widget.onMarkerSelected?.call('Your GPS Position'),
        child: Center(
          child: Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: TacticalColors.primaryContainer.withOpacity(0.3),
              border: Border.all(color: TacticalColors.primaryContainer, width: 2),
              boxShadow: [
                BoxShadow(
                  color: TacticalColors.primaryContainer.withOpacity(0.5),
                  blurRadius: 10,
                  spreadRadius: 3,
                ),
              ],
            ),
            child: Center(
              child: Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: TacticalColors.primaryContainer,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // Fallback static markers when no backend incidents
  List<Marker> _buildStaticFallbackMarkers() {
    return [
      Marker(
        point: const LatLng(30.4147, 79.4572), // Chamoli
        width: 48,
        height: 60,
        child: GestureDetector(
          onTap: () => widget.onMarkerSelected?.call('Chamoli Landslide Risk'),
          child: _buildStaticMarker('CHAMOLI', Icons.warning_amber, TacticalColors.warningAmber, false),
        ),
      ),
      Marker(
        point: const LatLng(30.5593, 79.5644), // Joshimath
        width: 48,
        height: 60,
        child: GestureDetector(
          onTap: () => widget.onMarkerSelected?.call('Joshimath Flood Alert'),
          child: _buildStaticMarker('JOSHIMATH', Icons.priority_high, TacticalColors.emergencyRed, true),
        ),
      ),
      Marker(
        point: const LatLng(30.4833, 79.4833), // Team Alpha
        width: 90,
        height: 32,
        child: GestureDetector(
          onTap: () => widget.onMarkerSelected?.call('Team Alpha On Route'),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: TacticalColors.surfaceContainerLowest.withOpacity(0.9),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: TacticalColors.tertiary.withOpacity(0.5)),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.verified_user, color: TacticalColors.tertiary, size: 12),
                SizedBox(width: 3),
                Text('Team Alpha', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: TacticalColors.tertiary)),
              ],
            ),
          ),
        ),
      ),
    ];
  }

  Widget _buildStaticMarker(String title, IconData icon, Color color, bool isPulsing) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: isPulsing
                ? TacticalColors.emergencyRed.withOpacity(0.85)
                : TacticalColors.surfaceContainerLowest.withOpacity(0.9),
            shape: BoxShape.circle,
            border: Border.all(color: color, width: 2),
            boxShadow: [
              BoxShadow(
                color: color.withOpacity(isPulsing ? 0.6 : 0.3),
                blurRadius: isPulsing ? 14 : 8,
                spreadRadius: isPulsing ? 2 : 1,
              ),
            ],
          ),
          child: Icon(icon, color: isPulsing ? Colors.white : color, size: 18),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
          decoration: BoxDecoration(
            color: TacticalColors.surfaceContainerLowest.withOpacity(0.85),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 8,
              fontWeight: FontWeight.w800,
              color: TacticalColors.onSurface,
              letterSpacing: 0.5,
            ),
          ),
        ),
      ],
    );
  }

  LatLng? _parseCoords(String? coords) {
    if (coords == null || coords.isEmpty) return null;
    try {
      // Handle "30.5562° N, 79.5670° E" or "30.5562, 79.5670"
      // Strip degree symbols, N/S/E/W suffixes, then split on comma
      final cleaned = coords.replaceAll(RegExp(r'[°]'), '').replaceAll(RegExp(r'[NnSsEeWw]'), '').trim();
      final parts = cleaned.split(',');
      if (parts.length >= 2) {
        final lat = double.tryParse(parts[0].trim());
        final lng = double.tryParse(parts[1].trim());
        if (lat != null && lng != null) {
          return LatLng(lat, lng);
        }
      }
    } catch (_) {}
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final incidents = widget.appState?.incidents ?? [];
    final incidentMarkers = incidents.isNotEmpty
        ? _buildIncidentMarkers()
        : _buildStaticFallbackMarkers();
    final teamMarkers = _buildTeamMarkers();
    final myMarker = _buildMyLocationMarker();

    final allMarkers = [
      ...incidentMarkers,
      ...teamMarkers,
      if (myMarker != null) myMarker,
    ];

    return Container(
      height: widget.height,
      width: double.infinity,
      decoration: BoxDecoration(
        color: TacticalColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF1E293B)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x66000000),
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          children: [
            // Real tile map
            FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: _kDefaultCenter,
                initialZoom: _kDefaultZoom,
                minZoom: 5,
                maxZoom: 18,
                onMapEvent: (event) {
                  if (event is MapEventMove) {
                    _currentZoom = event.camera.zoom;
                  }
                },
              ),
              children: [
                // Base tile layer using Google Maps API
                TileLayer(
                  urlTemplate: _showSatellite
                      ? 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=$_kGoogleMapsApiKey'
                      : 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=$_kGoogleMapsApiKey',
                  userAgentPackageName: 'com.rescueteam.app',
                  maxZoom: 20,
                  tileProvider: NetworkTileProvider(),
                ),
                // Incident / team markers
                MarkerLayer(markers: [
                  ...allMarkers,
                ]),
              ],
            ),

            // Top HUD: Satellite vs Dark Map toggle & Sectors
            Positioned(
              top: 10,
              left: 10,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: TacticalColors.surfaceContainerLowest.withOpacity(0.88),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFF1E293B)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _buildToggleBtn('Google Map', !_showSatellite, () => setState(() => _showSatellite = false)),
                    _buildToggleBtn('Satellite', _showSatellite, () => setState(() => _showSatellite = true)),
                  ],
                ),
              ),
            ),

            // Right controls: locate me + zoom
            if (widget.showControls)
              Positioned(
                top: 10,
                right: 10,
                child: Column(
                  children: [
                    _buildControlBtn(
                      icon: _locating ? Icons.gps_not_fixed : Icons.my_location,
                      color: TacticalColors.primary,
                      onTap: _centerOnMe,
                    ),
                    const SizedBox(height: 6),
                    Container(
                      decoration: BoxDecoration(
                        color: TacticalColors.surfaceContainerLowest.withOpacity(0.88),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFF1E293B)),
                      ),
                      child: Column(
                        children: [
                          _buildControlBtn(
                            icon: Icons.add,
                            color: TacticalColors.onSurface,
                            onTap: () {
                              final newZoom = (_currentZoom + 1).clamp(5.0, 18.0);
                              _mapController.move(_mapController.camera.center, newZoom);
                              _currentZoom = newZoom;
                            },
                          ),
                          Container(height: 1, width: 28, color: const Color(0xFF1E293B)),
                          _buildControlBtn(
                            icon: Icons.remove,
                            color: TacticalColors.onSurface,
                            onTap: () {
                              final newZoom = (_currentZoom - 1).clamp(5.0, 18.0);
                              _mapController.move(_mapController.camera.center, newZoom);
                              _currentZoom = newZoom;
                            },
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

            // GPS dot label (when located)
            if (_myLocation != null)
              Positioned(
                bottom: 36,
                left: 10,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: TacticalColors.surfaceContainerLowest.withOpacity(0.88),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: TacticalColors.primaryContainer.withOpacity(0.4)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: TacticalColors.primaryContainer,
                        ),
                      ),
                      const SizedBox(width: 5),
                      const Text(
                        'GPS LIVE',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: TacticalColors.primaryContainer,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // Bottom Legend Strip
            Positioned(
              bottom: 8,
              left: _myLocation != null ? 80 : 8,
              right: 8,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: TacticalColors.surfaceContainerLowest.withOpacity(0.92),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFF1E293B)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildLegendItem(TacticalColors.emergencyRed, 'High'),
                    _buildLegendItem(TacticalColors.warningAmber, 'Medium'),
                    _buildLegendItem(TacticalColors.primaryContainer, 'Info'),
                    _buildLegendItem(TacticalColors.tertiary, 'Deployed'),
                  ],
                ),
              ),
            ),

            // OSM attribution (required by tile providers)
            Positioned(
              bottom: 0,
              right: 0,
              child: Container(
                color: Colors.black38,
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                child: const Text(
                  '© Google Maps',
                  style: TextStyle(fontSize: 8, color: Colors.white70),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildToggleBtn(String label, bool selected, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? TacticalColors.primaryContainer : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: selected ? TacticalColors.onPrimaryContainer : TacticalColors.onSurfaceVariant,
          ),
        ),
      ),
    );
  }

  Widget _buildControlBtn({
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: TacticalColors.surfaceContainerLowest.withOpacity(0.88),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(icon, color: color, size: 16),
      ),
    );
  }

  Widget _buildLegendItem(Color color, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: TacticalColors.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}
