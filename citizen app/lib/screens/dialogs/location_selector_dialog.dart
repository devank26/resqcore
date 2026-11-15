import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../../providers/rescue_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_text_styles.dart';

class UttarakhandDistrict {
  final String name;
  final String sector;
  final String description;
  final double latitude;
  final double longitude;
  final IconData icon;

  const UttarakhandDistrict({
    required this.name,
    required this.sector,
    required this.description,
    required this.latitude,
    required this.longitude,
    this.icon = Icons.location_on,
  });
}

const List<UttarakhandDistrict> kUttarakhandDistricts = [
  UttarakhandDistrict(
    name: 'Dehradun (SEOC HQ)',
    sector: 'State Central HQ',
    description: 'State Emergency Operations Center & Primary Triage Hub',
    latitude: 30.3165,
    longitude: 78.0322,
    icon: Icons.shield,
  ),
  UttarakhandDistrict(
    name: 'Joshimath, Chamoli',
    sector: 'Sector 2: Bravo Urban',
    description: 'Main Bazaar, Subsidence Monitoring & Shelter Zone',
    latitude: 30.5593,
    longitude: 79.5644,
    icon: Icons.emergency,
  ),
  UttarakhandDistrict(
    name: 'Alaknanda Valley',
    sector: 'Sector 1: Alpha Valley',
    description: 'River Gorge & Landslide Flood Vulnerability Grid',
    latitude: 30.5650,
    longitude: 79.5450,
    icon: Icons.water,
  ),
  UttarakhandDistrict(
    name: 'Auli Ridge',
    sector: 'Sector 3: Charlie Ridge',
    description: 'High Altitude Extraction & Helipad Recon Hub',
    latitude: 30.5250,
    longitude: 79.5850,
    icon: Icons.terrain,
  ),
  UttarakhandDistrict(
    name: 'Chamoli Main',
    sector: 'Sector 4: Delta Logistics',
    description: 'Highway Transit, Heavy Machinery & Staging Corridor',
    latitude: 30.4072,
    longitude: 79.3242,
    icon: Icons.commute,
  ),
  UttarakhandDistrict(
    name: 'Rishikesh, Dehradun',
    sector: 'River Logistics Sector',
    description: 'Ganges Foothills Staging & Rapid Boat Extraction',
    latitude: 30.0869,
    longitude: 78.2676,
    icon: Icons.directions_boat,
  ),
  UttarakhandDistrict(
    name: 'Haridwar',
    sector: 'Flood Barrier Sector',
    description: 'Ganga Barrage Surge Checkpoints & Low-Lying Drainage',
    latitude: 29.9457,
    longitude: 78.1642,
    icon: Icons.flood,
  ),
  UttarakhandDistrict(
    name: 'Rudraprayag',
    sector: 'Confluence Hub',
    description: 'Mandakini & Alaknanda River Confluence Command',
    latitude: 30.2844,
    longitude: 78.9811,
    icon: Icons.hub,
  ),
  UttarakhandDistrict(
    name: 'Uttarkashi',
    sector: 'Alpine Corridor',
    description: 'Upper Bhagirathi Disaster Response Grid',
    latitude: 30.7268,
    longitude: 78.4354,
    icon: Icons.landscape,
  ),
  UttarakhandDistrict(
    name: 'Nainital',
    sector: 'Lake Catchment Sector',
    description: 'Kumaon Division Rapid Response & Landslide Monitoring',
    latitude: 29.3919,
    longitude: 79.4542,
    icon: Icons.water_drop,
  ),
  UttarakhandDistrict(
    name: 'Tehri Garhwal',
    sector: 'Dam Monitoring Sector',
    description: 'Tehri Reservoir Emergency Dispatch & Evacuation',
    latitude: 30.3789,
    longitude: 78.4803,
    icon: Icons.waves,
  ),
  UttarakhandDistrict(
    name: 'Pithoragarh',
    sector: 'High-Altitude Frontier',
    description: 'Eastern Alpine Staging & Air Rescue Staging Base',
    latitude: 29.5829,
    longitude: 80.2182,
    icon: Icons.hiking,
  ),
];

class LocationSelectorDialog extends StatefulWidget {
  const LocationSelectorDialog({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const LocationSelectorDialog(),
    );
  }

  @override
  State<LocationSelectorDialog> createState() => _LocationSelectorDialogState();
}

class _LocationSelectorDialogState extends State<LocationSelectorDialog> {
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _customAddressController = TextEditingController();
  String _filterQuery = '';
  bool _isLocatingGps = false;

  @override
  void dispose() {
    _searchController.dispose();
    _customAddressController.dispose();
    super.dispose();
  }

  Future<void> _detectLiveGps(BuildContext context) async {
    setState(() => _isLocatingGps = true);
    try {
      final provider = context.read<RescueProvider>();
      final pos = await provider.acquireLivePosition(timeout: const Duration(seconds: 4));
      if (!mounted) return;

      if (pos == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not acquire GPS fix. Please check location permissions or select an operational district.')),
        );
        setState(() => _isLocatingGps = false);
        return;
      }

      final label = '${pos.latitude.toStringAsFixed(4)}°N, ${pos.longitude.toStringAsFixed(4)}°E (Live GPS)';
      provider.updateLocation(
        locationName: label,
        address: 'Live GPS Coordinates',
        city: 'Detected Device Location',
        latitude: pos.latitude,
        longitude: pos.longitude,
      );

      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('📍 Live GPS locked: ${pos.latitude.toStringAsFixed(4)}°N, ${pos.longitude.toStringAsFixed(4)}°E'),
          backgroundColor: const Color(0xFF059669),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('GPS error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isLocatingGps = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RescueProvider>();
    final isDark = provider.isDarkMode;
    final cardBg = isDark ? const Color(0xFF0B1322) : Colors.white;
    final textPrimary = isDark ? AppColors.textWhite : const Color(0xFF0F172A);
    final textSecondary = isDark ? AppColors.textSecondary : const Color(0xFF64748B);
    final borderColor = isDark ? const Color(0xFF1E2E4B) : const Color(0xFFE2E8F0);

    final filteredDistricts = kUttarakhandDistricts.where((d) {
      if (_filterQuery.isEmpty) return true;
      final q = _filterQuery.toLowerCase();
      return d.name.toLowerCase().contains(q) ||
          d.sector.toLowerCase().contains(q) ||
          d.description.toLowerCase().contains(q);
    }).toList();

    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: borderColor, width: 1),
        boxShadow: const [
          BoxShadow(
            color: Color(0x66000000),
            blurRadius: 24,
            offset: Offset(0, -6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drag handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 10, bottom: 6),
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),

          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 16, 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.location_on, color: AppColors.primary, size: 20),
                        const SizedBox(width: 6),
                        Text(
                          'Change Operational Location',
                          style: AppTextStyles.headlineSm.copyWith(
                            color: textPrimary,
                            fontWeight: FontWeight.w700,
                            fontSize: 17,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Uttarakhand Command Theater · Real-Time Grid',
                      style: AppTextStyles.bodySm.copyWith(
                        color: const Color(0xFF38BDF8),
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                IconButton(
                  icon: Icon(Icons.close, color: textSecondary, size: 22),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),

          // Currently Selected Location Card
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF0F1B30) : const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF38BDF8).withOpacity(0.5), width: 1),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: const Color(0xFF38BDF8).withOpacity(0.15),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.my_location, color: Color(0xFF38BDF8), size: 18),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'CURRENT ACTIVE LOCATION',
                        style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.8,
                          color: textSecondary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        provider.currentLocationName,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: textPrimary,
                        ),
                      ),
                      Text(
                        '${provider.currentLatitude.toStringAsFixed(4)}° N, ${provider.currentLongitude.toStringAsFixed(4)}° E',
                        style: const TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: Color(0xFF38BDF8),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 10),

          // Action 1: Use Live GPS Button
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: InkWell(
              onTap: _isLocatingGps ? null : () => _detectLiveGps(context),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF0284C7), Color(0xFF0369A1)],
                  ),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: const [
                    BoxShadow(color: Color(0x330284C7), blurRadius: 8, offset: Offset(0, 3)),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _isLocatingGps
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.gps_fixed, color: Colors.white, size: 18),
                    const SizedBox(width: 8),
                    Text(
                      _isLocatingGps ? 'Detecting device GPS...' : '📍 Use My Live Device GPS',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          const SizedBox(height: 12),

          // Search Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              height: 42,
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF0F1B30) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: borderColor),
              ),
              child: TextField(
                controller: _searchController,
                onChanged: (val) => setState(() => _filterQuery = val.trim()),
                style: TextStyle(color: textPrimary, fontSize: 13),
                decoration: InputDecoration(
                  hintText: 'Search Uttarakhand districts & sectors...',
                  hintStyle: TextStyle(color: textSecondary, fontSize: 13),
                  prefixIcon: Icon(Icons.search, size: 18, color: textSecondary),
                  suffixIcon: _filterQuery.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear, size: 16),
                          onPressed: () {
                            _searchController.clear();
                            setState(() => _filterQuery = '');
                          },
                        )
                      : null,
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(vertical: 10),
                ),
              ),
            ),
          ),

          const SizedBox(height: 8),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
            child: Text(
              'SELECT UTTARAKHAND OPERATIONAL SECTOR (${filteredDistricts.length})',
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
                color: textSecondary,
              ),
            ),
          ),

          // Districts List
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              itemCount: filteredDistricts.length,
              separatorBuilder: (_, __) => const SizedBox(height: 6),
              itemBuilder: (context, index) {
                final d = filteredDistricts[index];
                final isSelected = provider.currentLocationName.toLowerCase().contains(d.name.toLowerCase().split(' ').first);

                return InkWell(
                  onTap: () {
                    provider.updateLocation(
                      locationName: '${d.name}, Uttarakhand',
                      address: '${d.name}, ${d.sector}',
                      city: 'Uttarakhand',
                      latitude: d.latitude,
                      longitude: d.longitude,
                    );
                    Navigator.of(context).pop();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Row(
                          children: [
                            const Icon(Icons.check_circle, color: Color(0xFF34D399), size: 18),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Location changed to ${d.name} (${d.sector})',
                                style: const TextStyle(fontWeight: FontWeight.w600),
                              ),
                            ),
                          ],
                        ),
                        backgroundColor: const Color(0xFF0F172A),
                        behavior: SnackBarBehavior.floating,
                        duration: const Duration(seconds: 2),
                      ),
                    );
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? const Color(0xFF0284C7).withOpacity(0.18)
                          : isDark
                              ? const Color(0xFF0F1B30).withOpacity(0.5)
                              : const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected ? const Color(0xFF0284C7) : borderColor,
                        width: isSelected ? 1.5 : 0.8,
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: isSelected
                                ? const Color(0xFF0284C7).withOpacity(0.3)
                                : const Color(0xFF1E2E4B).withOpacity(0.5),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(
                            d.icon,
                            color: isSelected ? const Color(0xFF38BDF8) : textSecondary,
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    d.name,
                                    style: TextStyle(
                                      fontSize: 13.5,
                                      fontWeight: FontWeight.w700,
                                      color: isSelected ? const Color(0xFF38BDF8) : textPrimary,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF38BDF8).withOpacity(0.15),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      d.sector,
                                      style: const TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w700,
                                        color: Color(0xFF38BDF8),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(
                                d.description,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: textSecondary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        if (isSelected)
                          const Icon(Icons.check_circle, color: Color(0xFF0284C7), size: 18)
                        else
                          Icon(Icons.chevron_right, color: textSecondary.withOpacity(0.4), size: 18),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          // Custom Input Section at bottom
          Container(
            padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.of(context).viewInsets.bottom + 12),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF070D18) : Colors.white,
              border: Border(top: BorderSide(color: borderColor)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    height: 38,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF0F1B30) : const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: borderColor),
                    ),
                    child: TextField(
                      controller: _customAddressController,
                      style: TextStyle(color: textPrimary, fontSize: 12),
                      decoration: InputDecoration(
                        hintText: 'Or type custom address / sector...',
                        hintStyle: TextStyle(color: textSecondary, fontSize: 12),
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(vertical: 8),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: () {
                    final text = _customAddressController.text.trim();
                    if (text.isEmpty) return;
                    provider.updateLocation(
                      locationName: '$text, Uttarakhand',
                      address: text,
                      city: 'Uttarakhand',
                      latitude: 30.3165,
                      longitude: 78.0322,
                    );
                    Navigator.of(context).pop();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Location updated: $text, Uttarakhand')),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0284C7),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: const Text('Set', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
