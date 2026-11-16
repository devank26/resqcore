import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../../providers/rescue_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_text_styles.dart';
import '../../widgets/app_top_bar.dart';
import '../dialogs/location_selector_dialog.dart';
import 'add_report_details_screen.dart';

const String _kGoogleMapsApiKey =
    String.fromEnvironment('GOOGLE_MAPS_API_KEY', defaultValue: '');

String _googleTileUrl({required bool satellite}) {
  final lyrs = satellite ? 'y' : 'm';
  final keyParam = _kGoogleMapsApiKey.isNotEmpty ? '&key=$_kGoogleMapsApiKey' : '';
  return 'https://mt{s}.google.com/vt/lyrs=$lyrs&x={x}&y={y}&z={z}$keyParam';
}

String _fallbackTileUrl({required bool satellite}) {
  return satellite
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
}

class ShareLocationScreen extends StatefulWidget {
  const ShareLocationScreen({super.key});

  @override
  State<ShareLocationScreen> createState() => _ShareLocationScreenState();
}

class _ShareLocationScreenState extends State<ShareLocationScreen>
    with SingleTickerProviderStateMixin {
  late TextEditingController _addressController;
  late AnimationController _pulseController;
  final MapController _mapController = MapController();
  bool _isDetectingGps = false;
  bool _useSatelliteRadar = true;

  @override
  void initState() {
    super.initState();
    final provider = context.read<RescueProvider>();
    _addressController = TextEditingController(text: provider.draftAddress);
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
    if (!provider.isDemoMode && !provider.hasGpsFix) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _onCurrentLocationPressed();
      });
    }
  }

  @override
  void dispose() {
    _addressController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _onCurrentLocationPressed() async {
    setState(() => _isDetectingGps = true);
    final provider = context.read<RescueProvider>();
    try {
      final pos = await provider.acquireLivePosition(timeout: const Duration(seconds: 4));
      if (!mounted) return;

      if (pos != null) {
        final label = '${pos.latitude.toStringAsFixed(4)}°N, ${pos.longitude.toStringAsFixed(4)}°E (Live GPS)';
        setState(() {
          _isDetectingGps = false;
          _addressController.text = label;
        });

        provider.updateLocation(
          locationName: label,
          address: 'Live GPS Pin',
          city: 'Uttarakhand Operational Theater',
          latitude: pos.latitude,
          longitude: pos.longitude,
        );

        _mapController.move(LatLng(pos.latitude, pos.longitude), 14.5);

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('📍 Live GPS Locked: ${pos.latitude.toStringAsFixed(4)}°N, ${pos.longitude.toStringAsFixed(4)}°E'),
            backgroundColor: const Color(0xFF059669),
          ),
        );
      } else {
        _applyFallbackLocation(provider);
      }
    } catch (e) {
      if (mounted) {
        _applyFallbackLocation(provider);
      }
    } finally {
      if (mounted) setState(() => _isDetectingGps = false);
    }
  }

  void _applyFallbackLocation(RescueProvider provider) {
    setState(() {
      _isDetectingGps = false;
      if (provider.hasGpsFix && _addressController.text.trim().isEmpty) {
        _addressController.text = provider.currentLocationName;
      }
    });
    if (provider.hasGpsFix) {
      provider.setDraftAddress(provider.currentLocationName, 'Uttarakhand');
      _mapController.move(LatLng(provider.currentLatitude, provider.currentLongitude), 13.5);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Location set to: ${provider.currentLocationName}')),
      );
    } else {
      _mapController.move(const LatLng(30.3165, 78.0322), 12.5);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('GPS unavailable — tap anywhere on the map or choose a quick zone below'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RescueProvider>();
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: Column(
          children: [
            AppTopBar(
              title: 'New Request',
              showBack: true,
              onBack: () => Navigator.of(context).pop(),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Step & Progress Tracker
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'STEP 2 OF 3 · YOUR LOCATION',
                          style: AppTextStyles.labelSm.copyWith(
                            color: AppColors.secondary,
                            letterSpacing: 1.0,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          '66%',
                          style: AppTextStyles.labelSm.copyWith(
                            color: AppColors.onSurfaceVariant,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    // 3-Segmented Stepper
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            height: 5,
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer,
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Container(
                            height: 5,
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer,
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Container(
                            height: 5,
                            decoration: BoxDecoration(
                              color: AppColors.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),

                    // Headline
                    Text(
                      'Help needs the right location.',
                      style: AppTextStyles.headlineXlMobile.copyWith(
                        color: AppColors.textWhite,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Confirm where help is needed, not necessarily where you are right now.',
                      style: AppTextStyles.bodyMd.copyWith(
                        color: AppColors.textSecondary,
                        height: 1.35,
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Uttarakhand Districts Quick Selection
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'OPERATIONAL DISTRICTS (UTTARAKHAND)',
                          style: AppTextStyles.labelSm.copyWith(
                            color: const Color(0xFF38BDF8),
                            letterSpacing: 0.8,
                            fontWeight: FontWeight.w700,
                            fontSize: 10.5,
                          ),
                        ),
                        InkWell(
                          onTap: () async {
                            await LocationSelectorDialog.show(context);
                            if (mounted) {
                              final prov = context.read<RescueProvider>();
                              setState(() {
                                _addressController.text = prov.currentLocationName;
                              });
                            }
                          },
                          child: const Text(
                            'All Districts ▾',
                            style: TextStyle(
                              color: Color(0xFF38BDF8),
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _buildDistrictChip('📍 Dehradun', 30.3165, 78.0322, 'Rajpur Road, Dehradun, Uttarakhand'),
                          const SizedBox(width: 6),
                          _buildDistrictChip('📍 Joshimath', 30.5593, 79.5644, 'Main Bazaar, Joshimath, Chamoli, Uttarakhand'),
                          const SizedBox(width: 6),
                          _buildDistrictChip('📍 Chamoli', 30.4072, 79.3242, 'Gopeshwar Road, Chamoli, Uttarakhand'),
                          const SizedBox(width: 6),
                          _buildDistrictChip('📍 Alaknanda', 30.5650, 79.5450, 'Alaknanda River Gorge, Sector 1, Uttarakhand'),
                          const SizedBox(width: 6),
                          _buildDistrictChip('📍 Rishikesh', 30.0869, 78.2676, 'Triveni Ghat, Rishikesh, Uttarakhand'),
                          const SizedBox(width: 6),
                          _buildDistrictChip('📍 Haridwar', 29.9457, 78.1642, 'Har Ki Pauri, Haridwar, Uttarakhand'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Interactive Tactical Map Box
                    Container(
                      height: 290,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainerLow,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: AppColors.strokeBorder,
                          width: 1,
                        ),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x33000000),
                            blurRadius: 10,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Stack(
                          children: [
                            FlutterMap(
                              mapController: _mapController,
                              options: MapOptions(
                                initialCenter: provider.hasGpsFix
                                    ? LatLng(provider.currentLatitude, provider.currentLongitude)
                                    : const LatLng(30.3165, 78.0322),
                                initialZoom: provider.hasGpsFix ? 13.5 : 12.5,
                                minZoom: 5,
                                maxZoom: 19,
                                onTap: (tapPosition, point) {
                                  final label = '${point.latitude.toStringAsFixed(4)}°N, ${point.longitude.toStringAsFixed(4)}°E (Tapped Pin)';
                                  setState(() {
                                    _addressController.text = label;
                                  });
                                  provider.updateLocation(
                                    locationName: label,
                                    address: 'Selected Tactical Pin',
                                    city: 'Uttarakhand Operational Theater',
                                    latitude: point.latitude,
                                    longitude: point.longitude,
                                  );
                                },
                              ),
                              children: [
                                TileLayer(
                                  urlTemplate: _googleTileUrl(satellite: _useSatelliteRadar),
                                  fallbackUrl: _fallbackTileUrl(satellite: _useSatelliteRadar),
                                  subdomains: const ['0', '1', '2', '3'],
                                  userAgentPackageName: 'com.example.rescue_core',
                                  maxZoom: 20,
                                ),
                                MarkerLayer(
                                  markers: [
                                    if (provider.hasGpsFix)
                                      Marker(
                                        point: LatLng(provider.currentLatitude, provider.currentLongitude),
                                        width: 130,
                                        height: 80,
                                      child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                            decoration: BoxDecoration(
                                              color: const Color(0xFF0F172A).withOpacity(0.92),
                                              borderRadius: BorderRadius.circular(8),
                                              border: Border.all(color: const Color(0xFFEF4444), width: 1.2),
                                              boxShadow: const [BoxShadow(color: Color(0x88EF4444), blurRadius: 8)],
                                            ),
                                            child: Text(
                                              '🚨 Incident Location',
                                              style: AppTextStyles.labelSm.copyWith(
                                                color: Colors.white,
                                                fontSize: 9.5,
                                                fontWeight: FontWeight.w800,
                                              ),
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          AnimatedBuilder(
                                            animation: _pulseController,
                                            builder: (context, child) {
                                              return Container(
                                                width: 32,
                                                height: 32,
                                                decoration: BoxDecoration(
                                                  shape: BoxShape.circle,
                                                  color: const Color(0xFFEF4444).withOpacity(0.3 * (1 - _pulseController.value)),
                                                  border: Border.all(color: const Color(0xFFEF4444), width: 2),
                                                ),
                                                child: const Center(
                                                  child: Icon(Icons.location_on, size: 20, color: Color(0xFFEF4444)),
                                                ),
                                              );
                                            },
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),

                            // Satellite / Vector Mode Switcher Pill
                            Positioned(
                              top: 12,
                              left: 12,
                              child: InkWell(
                                onTap: () => setState(() => _useSatelliteRadar = !_useSatelliteRadar),
                                borderRadius: BorderRadius.circular(999),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF0F172A).withOpacity(0.90),
                                    borderRadius: BorderRadius.circular(999),
                                    border: Border.all(color: const Color(0xFF38BDF8), width: 1),
                                    boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 6)],
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(_useSatelliteRadar ? Icons.satellite_alt : Icons.map, size: 13, color: const Color(0xFF38BDF8)),
                                      const SizedBox(width: 6),
                                      Text(
                                        _useSatelliteRadar ? 'Google Satellite' : 'Google Map',
                                        style: AppTextStyles.labelSm.copyWith(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),

                            // Top-right coordinates badge
                            Positioned(
                              top: 12,
                              right: 12,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF0F172A).withOpacity(0.92),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: AppColors.strokeBorder, width: 1),
                                ),
                                child: Text(
                                  provider.hasGpsFix
                                      ? '${provider.currentLatitude.toStringAsFixed(4)}°N, ${provider.currentLongitude.toStringAsFixed(4)}°E'
                                      : 'Tap map or GPS button',
                                  style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8), fontWeight: FontWeight.w700),
                                ),
                              ),
                            ),

                            // Recenter Floating Button
                            Positioned(
                              bottom: 12,
                              right: 12,
                              child: InkWell(
                                onTap: _onCurrentLocationPressed,
                                borderRadius: BorderRadius.circular(20),
                                child: Container(
                                  width: 40,
                                  height: 40,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF0F172A).withOpacity(0.92),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: const Color(0xFF38BDF8), width: 1.2),
                                    boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 8)],
                                  ),
                                  child: _isDetectingGps
                                      ? const Padding(
                                          padding: EdgeInsets.all(10),
                                          child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF38BDF8)),
                                        )
                                      : const Icon(Icons.my_location, color: Color(0xFF38BDF8), size: 20),
                                ),
                              ),
                            ),

                            // Tap Hint Pill
                            Positioned(
                              bottom: 12,
                              left: 12,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF0F172A).withOpacity(0.92),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: AppColors.strokeBorder, width: 0.8),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.touch_app, size: 12, color: Color(0xFF38BDF8)),
                                    SizedBox(width: 4),
                                    Text('Tap map to place emergency pin', style: TextStyle(fontSize: 9.5, color: Color(0xFFCBD5E1), fontWeight: FontWeight.w600)),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // GPS Status Metadata Bar
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0x33064E3B),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Color(0xFF34D399),
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'GPS location selected',
                                style: AppTextStyles.labelSm.copyWith(
                                  color: const Color(0xFF6EE7B7),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          'Sample accuracy ±15 m',
                          style: AppTextStyles.bodySm.copyWith(
                            color: AppColors.textSecondary,
                            fontFamily: 'monospace',
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Emergency Address Section
                    Text(
                      'EMERGENCY ADDRESS',
                      style: AppTextStyles.labelSm.copyWith(
                        color: AppColors.textSecondary,
                        letterSpacing: 1.0,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),

                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: AppColors.strokeBorder,
                          width: 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: AppColors.surfaceContainer,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Icon(
                              Icons.location_on,
                              color: AppColors.primaryFixedDim,
                              size: 20,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                TextField(
                                  controller: _addressController,
                                  style: AppTextStyles.headlineSm.copyWith(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.textWhite,
                                  ),
                                  decoration: const InputDecoration(
                                    isDense: true,
                                    contentPadding: EdgeInsets.zero,
                                    border: InputBorder.none,
                                  ),
                                  onChanged: (val) {
                                    context
                                        .read<RescueProvider>()
                                        .setDraftAddress(val);
                                  },
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Ernakulam, Kerala 682001',
                                  style: AppTextStyles.bodySm.copyWith(
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(
                            Icons.edit,
                            size: 18,
                            color: AppColors.textSecondary,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Use my current location link
                    InkWell(
                      onTap: _onCurrentLocationPressed,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _isDetectingGps
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: AppColors.primary,
                                  ),
                                )
                              : const Icon(
                                  Icons.check,
                                  size: 18,
                                  color: AppColors.primary,
                                ),
                          const SizedBox(width: 8),
                          Text(
                            _isDetectingGps
                                ? 'Detecting GPS signal...'
                                : 'Use my current location',
                            style: AppTextStyles.labelMd.copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Info Callout Box
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainerLow,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppColors.strokeBorder,
                          width: 0.5,
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.info_outline,
                            size: 18,
                            color: AppColors.tertiary,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Not the right spot? Move the pin or edit the address above. Location is shared directly with your tactical response team.',
                              style: AppTextStyles.bodySm.copyWith(
                                color: AppColors.textSecondary,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Primary Button: Confirm location
                    SizedBox(
                      width: double.infinity,
                      height: 54,
                      child: ElevatedButton(
                        onPressed: () {
                          final prov = context.read<RescueProvider>();
                          if (!prov.hasGpsFix) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Please tap GPS, select a zone chip, or tap the map to lock coordinates.'),
                                backgroundColor: AppColors.error,
                              ),
                            );
                            return;
                          }
                          if (_addressController.text.trim().isNotEmpty) {
                            prov.setDraftAddress(_addressController.text.trim(), 'Uttarakhand');
                          }
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => const AddReportDetailsScreen(),
                            ),
                          );
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primaryContainer,
                          foregroundColor: Colors.white,
                          elevation: 4,
                          shadowColor:
                              AppColors.primaryContainer.withValues(alpha: 0.4),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.check,
                              size: 20,
                              color: Colors.white,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'Confirm location',
                              style: AppTextStyles.labelLg.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDistrictChip(String label, double lat, double lng, String fullAddr) {
    final prov = context.watch<RescueProvider>();
    final isSelected = prov.currentLocationName.contains(label.replaceFirst('📍 ', ''));
    return InkWell(
      onTap: () {
        setState(() {
          _addressController.text = fullAddr;
        });
        context.read<RescueProvider>().updateLocation(
          locationName: label.replaceFirst('📍 ', '') + ', Uttarakhand',
          address: fullAddr,
          city: 'Uttarakhand',
          latitude: lat,
          longitude: lng,
        );
        _mapController.move(LatLng(lat, lng), 14.0);
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF0284C7).withOpacity(0.3) : AppColors.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? const Color(0xFF38BDF8) : AppColors.outlineVariant,
            width: isSelected ? 1.5 : 0.8,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: isSelected ? const Color(0xFF38BDF8) : AppColors.textWhite,
          ),
        ),
      ),
    );
  }
}
