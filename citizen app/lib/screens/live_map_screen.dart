import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../models/hazard_zone.dart';
import '../models/rescue_team.dart';
import '../providers/rescue_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_text_styles.dart';
import 'dialogs/location_selector_dialog.dart';

// Default center: Dehradun, Uttarakhand (operational theater)
const LatLng _kDefaultCenter = LatLng(30.3165, 78.0322);
const double _kDefaultZoom = 13.0;
const String _kGoogleMapsApiKey = 'AIzaSyAMaBxMmCY1r2TmqoMZUm2-v8FfhE1n44g';



class LiveMapScreen extends StatefulWidget {
  const LiveMapScreen({super.key});

  @override
  State<LiveMapScreen> createState() => _LiveMapScreenState();
}

class _LiveMapScreenState extends State<LiveMapScreen> {
  int _selectedFilter = 0; // 0: All, 1: Hazards, 2: Rescue Teams
  RescueTeam? _selectedTeam;
  HazardZone? _selectedHazard;
  bool _isOverwatchRadar = true; // true = Esri Satellite (default high-contrast), false = OpenStreetMap

  final MapController _mapController = MapController();
  LatLng? _myLocation;
  StreamSubscription<Position>? _positionStream;

  @override
  void initState() {
    super.initState();
    _initLocation();
  }

  @override
  void dispose() {
    _positionStream?.cancel();
    super.dispose();
  }

  Future<void> _initLocation() async {
    final prov = context.read<RescueProvider>();
    // Immediate fallback so the map and marker always initialize without delay
    if (mounted) {
      setState(() => _myLocation = LatLng(prov.currentLatitude, prov.currentLongitude));
    }

    try {
      final pos = await prov.acquireLivePosition(timeout: const Duration(seconds: 3));
      if (pos != null && mounted) {
        setState(() => _myLocation = LatLng(pos.latitude, pos.longitude));
        _mapController.move(_myLocation!, _kDefaultZoom);
      }
    } catch (_) {}

    try {
      _positionStream = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 15,
        ),
      ).listen((pos) {
        if (mounted) {
          setState(() => _myLocation = LatLng(pos.latitude, pos.longitude));
        }
      });
    } catch (_) {}
  }

  List<Marker> _buildHazardMarkers(List<HazardZone> hazards) {
    return hazards.map((h) {
      return Marker(
        point: LatLng(h.latitude, h.longitude),
        width: 40,
        height: 40,
        child: GestureDetector(
          onTap: () => setState(() {
            _selectedHazard = h;
            _selectedTeam = null;
          }),
          child: Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: h.severity.color.withOpacity(0.9),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 1.5),
              boxShadow: [
                BoxShadow(
                  color: h.severity.color.withOpacity(0.5),
                  blurRadius: 8,
                ),
              ],
            ),
            child: const Icon(Icons.warning, size: 16, color: Colors.white),
          ),
        ),
      );
    }).toList();
  }

  List<Marker> _buildTeamMarkers(List<RescueTeam> teams) {
    const teamColors = [Color(0xFF2563EB), Color(0xFF059669), Color(0xFFD97706)];
    return List.generate(teams.length, (i) {
      final t = teams[i];
      final color = teamColors[i % teamColors.length];

      return Marker(
        point: LatLng(t.latitude, t.longitude),
        width: 36,
        height: 36,
        child: GestureDetector(
          onTap: () => setState(() {
            _selectedTeam = t;
            _selectedHazard = null;
          }),
          child: Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 1.5),
              boxShadow: const [
                BoxShadow(color: Color(0x66000000), blurRadius: 6),
              ],
            ),
            child: Icon(t.icon, size: 14, color: Colors.white),
          ),
        ),
      );
    });
  }

  Marker? _buildMyMarker() {
    if (_myLocation == null) return null;
    return Marker(
      point: _myLocation!,
      width: 60,
      height: 72,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerHigh.withOpacity(0.9),
              borderRadius: BorderRadius.circular(999),
              boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 4)],
            ),
            child: Text(
              'You',
              style: AppTextStyles.labelSm.copyWith(
                color: Colors.white,
                fontSize: 9,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 2),
          Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.primaryContainer.withOpacity(0.3),
              border: Border.all(color: AppColors.primaryContainer, width: 2),
              boxShadow: [
                BoxShadow(color: AppColors.primaryContainer.withOpacity(0.5), blurRadius: 10, spreadRadius: 2),
              ],
            ),
            child: Center(
              child: Container(
                width: 6,
                height: 6,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.primaryContainer,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RescueProvider>();
    final isDark = provider.isDarkMode;
    final teams = provider.rescueTeams;
    final hazards = provider.hazardZones;

    final bgColor = isDark ? AppColors.surface : const Color(0xFFF8FAFC);
    final cardBg = isDark ? AppColors.surfaceContainer : Colors.white;
    final textPrimary = isDark ? AppColors.textWhite : const Color(0xFF0F172A);
    final textSecondary = isDark ? AppColors.textSecondary : const Color(0xFF64748B);
    final borderColor = isDark ? AppColors.strokeBorder : const Color(0xFFE2E8F0);

    final hazardMarkers = _buildHazardMarkers(hazards);
    final teamMarkers = _buildTeamMarkers(teams);
    final myMarker = _buildMyMarker();

    final allMarkers = [
      ...hazardMarkers,
      ...teamMarkers,
      if (myMarker != null) myMarker,
    ];

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: cardBg,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: textPrimary),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          'Live Tactical Radar & Map',
          style: AppTextStyles.headlineSm.copyWith(
            color: textPrimary,
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_location_alt, color: Color(0xFF38BDF8)),
            tooltip: 'Change Operational Location',
            onPressed: () async {
              await LocationSelectorDialog.show(context);
              if (mounted) {
                final prov = context.read<RescueProvider>();
                _mapController.move(LatLng(prov.currentLatitude, prov.currentLongitude), _kDefaultZoom);
              }
            },
          ),
          IconButton(
            icon: Icon(
              _myLocation != null ? Icons.gps_fixed : Icons.gps_not_fixed,
              color: _myLocation != null ? AppColors.primaryContainer : textSecondary,
            ),
            onPressed: () {
              if (_myLocation != null) {
                _mapController.move(_myLocation!, _kDefaultZoom);
              } else {
                final prov = context.read<RescueProvider>();
                _mapController.move(LatLng(prov.currentLatitude, prov.currentLongitude), _kDefaultZoom);
              }
            },
            tooltip: 'Center on location',
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Filter Pills Header
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: cardBg,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildFilterChip('All Units & Hazards', 0),
                    const SizedBox(width: 8),
                    _buildFilterChip('🚨 Hazard Zones', 1),
                    const SizedBox(width: 8),
                    _buildFilterChip('🚤 Rescue Teams', 2),
                    const SizedBox(width: 8),
                    // Tile layer toggle
                    GestureDetector(
                      onTap: () => setState(() => _isOverwatchRadar = !_isOverwatchRadar),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.transparent,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: AppColors.outlineVariant, width: 1),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              _isOverwatchRadar ? Icons.satellite_alt : Icons.map_outlined,
                              size: 13,
                              color: AppColors.textSecondary,
                            ),
                            const SizedBox(width: 5),
                            Text(
                              _isOverwatchRadar ? 'Google Satellite' : 'Google Map',
                              style: AppTextStyles.labelSm.copyWith(
                                color: AppColors.textSecondary,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                ),
              ),
            ),

            // Real Interactive Map
            Container(
              height: 260,
              width: double.infinity,
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.surfaceContainerLow,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: borderColor, width: 1),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Stack(
                  children: [
                    FlutterMap(
                      mapController: _mapController,
                      options: MapOptions(
                        initialCenter: LatLng(provider.currentLatitude, provider.currentLongitude),
                        initialZoom: _kDefaultZoom,
                        minZoom: 5,
                        maxZoom: 18,
                      ),
                      children: [
                        TileLayer(
                          urlTemplate: _isOverwatchRadar
                              ? 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=$_kGoogleMapsApiKey'
                              : 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=$_kGoogleMapsApiKey',
                          subdomains: const ['0', '1', '2', '3'],
                          userAgentPackageName: 'com.example.rescue_core',
                          maxZoom: 20,
                        ),
                        // Tactical Sectors Polygon Layer removed
                        MarkerLayer(markers: [
                          ...allMarkers,
                        ]),
                      ],
                    ),

                    // GPS live badge
                    if (_myLocation != null)
                      Positioned(
                        top: 10,
                        left: 10,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFF0F172A).withOpacity(0.85),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: AppColors.primaryContainer.withOpacity(0.5)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 6, height: 6,
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Color(0xFF34D399),
                                ),
                              ),
                              const SizedBox(width: 5),
                              Text(
                                'GPS LIVE',
                                style: AppTextStyles.labelSm.copyWith(
                                  color: const Color(0xFF6EE7B7),
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                    // Legend overlay
                    Positioned(
                      bottom: 8,
                      left: 10,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceContainerLowest.withOpacity(0.85),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(width: 8, height: 8, decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF2563EB))),
                            const SizedBox(width: 4),
                            Text('Rescue', style: AppTextStyles.labelSm.copyWith(fontSize: 10, color: Colors.white)),
                            const SizedBox(width: 8),
                            Container(width: 8, height: 8, decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.error)),
                            const SizedBox(width: 4),
                            Text('Hazard', style: AppTextStyles.labelSm.copyWith(fontSize: 10, color: Colors.white)),
                          ],
                        ),
                      ),
                    ),

                    // Attribution
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
            ),

            // Active Data Feed Section
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                children: [
                  if (_selectedTeam != null) ...[
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF2563EB).withOpacity(0.15),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF2563EB), width: 1),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.gps_fixed, color: Color(0xFF38BDF8), size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Target Locked: ${_selectedTeam!.name} (${_selectedTeam!.eta})',
                              style: AppTextStyles.labelMd.copyWith(
                                color: textPrimary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close, size: 18),
                            color: textSecondary,
                            onPressed: () => setState(() => _selectedTeam = null),
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (_selectedHazard != null) ...[
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.errorContainer.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.error, width: 1),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.warning, color: AppColors.error, size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Hazard Focused: ${_selectedHazard!.name}',
                              style: AppTextStyles.labelMd.copyWith(
                                color: textPrimary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close, size: 18),
                            color: textSecondary,
                            onPressed: () => setState(() => _selectedHazard = null),
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (_selectedFilter == 0 || _selectedFilter == 1) ...[
                    Text(
                      'NEARBY AFFECTED HAZARD ZONES',
                      style: AppTextStyles.labelSm.copyWith(
                        color: textSecondary,
                        letterSpacing: 1.0,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ...hazards.map((h) => _buildHazardCard(h, cardBg, textPrimary, textSecondary, borderColor)),
                    const SizedBox(height: 16),
                  ],
                  if (_selectedFilter == 0 || _selectedFilter == 2) ...[
                    Text(
                      'ACTIVE RESCUE FLEET (DEPLOYED NEAR YOU)',
                      style: AppTextStyles.labelSm.copyWith(
                        color: textSecondary,
                        letterSpacing: 1.0,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ...teams.map((t) => _buildTeamCard(t, cardBg, textPrimary, textSecondary, borderColor)),
                    const SizedBox(height: 20),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChip(String label, int index) {
    final isSelected = _selectedFilter == index;
    return InkWell(
      onTap: () => setState(() => _selectedFilter = index),
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primaryContainer : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: isSelected ? AppColors.primaryContainer : AppColors.outlineVariant,
            width: 1,
          ),
        ),
        child: Text(
          label,
          style: AppTextStyles.labelSm.copyWith(
            color: isSelected ? Colors.white : AppColors.textSecondary,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }

  Widget _buildHazardCard(
    HazardZone h,
    Color cardBg,
    Color textPrimary,
    Color textSecondary,
    Color borderColor,
  ) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: h.severity.color.withOpacity(0.35), width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (h.imagePath != null)
              SizedBox(
                height: 80,
                width: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.asset(
                      h.imagePath!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const SizedBox(),
                    ),
                    Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Colors.transparent, cardBg.withOpacity(0.95)],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: h.severity.color.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: h.severity.color.withOpacity(0.3), width: 1),
                        ),
                        child: Text(
                          h.severity.label,
                          style: AppTextStyles.labelSm.copyWith(
                            color: h.severity.color,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      Text(
                        'Radius ~${h.radius}',
                        style: AppTextStyles.bodySm.copyWith(color: textSecondary, fontSize: 11),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(h.name, style: AppTextStyles.labelLg.copyWith(color: textPrimary, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(h.description, style: AppTextStyles.bodySm.copyWith(color: textSecondary, height: 1.35)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTeamCard(
    RescueTeam t,
    Color cardBg,
    Color textPrimary,
    Color textSecondary,
    Color borderColor,
  ) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: borderColor, width: 1),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: AppColors.primaryContainer.withOpacity(0.15),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.primaryContainer.withOpacity(0.3)),
              ),
              child: t.imagePath != null
                  ? Image.asset(
                      t.imagePath!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Icon(t.icon, color: AppColors.primaryContainer, size: 22),
                    )
                  : Icon(t.icon, color: AppColors.primaryContainer, size: 22),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Flexible(
                      child: Text(
                        t.name,
                        style: AppTextStyles.labelMd.copyWith(color: textPrimary, fontWeight: FontWeight.w700),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: t.status.color.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        t.status.label,
                        style: AppTextStyles.labelSm.copyWith(
                          color: t.status.color,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(t.currentSector, style: AppTextStyles.bodySm.copyWith(color: textSecondary, fontSize: 11)),
                const SizedBox(height: 2),
                Text(
                  'E.T.A: ${t.eta} • ${t.type}',
                  style: AppTextStyles.bodySm.copyWith(
                    color: AppColors.primaryContainer,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
