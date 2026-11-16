import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/rescue_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_text_styles.dart';
import 'dialogs/safety_advice_dialog.dart';

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  Color _severityColor(String severity) {
    final s = severity.toLowerCase();
    if (s.contains('crit') || s.contains('high') || s.contains('red')) {
      return AppColors.error;
    }
    if (s.contains('warn') || s.contains('med') || s.contains('orange')) {
      return AppColors.tertiary;
    }
    return AppColors.secondary;
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RescueProvider>();
    final isDemo = provider.isDemoMode;
    final liveAlerts = provider.liveAlerts;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Live alerts',
                style: AppTextStyles.headlineLg.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppColors.textWhite,
                ),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (!isDemo)
                    IconButton(
                      onPressed: provider.loadingAlerts
                          ? null
                          : () => provider.loadAlertsFromBackend(),
                      icon: const Icon(Icons.refresh, color: AppColors.primary, size: 18),
                      tooltip: 'Refresh live alerts',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                    ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.tertiaryContainer.withValues(alpha: 0.3),
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
                            color: AppColors.tertiary,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          isDemo
                              ? '3 ACTIVE'
                              : (provider.loadingAlerts
                                  ? 'SYNCING'
                                  : '${liveAlerts.length} ACTIVE'),
                          style: AppTextStyles.labelSm.copyWith(
                            color: AppColors.tertiaryFixed,
                            fontWeight: FontWeight.w700,
                            fontSize: 10,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            isDemo
                ? 'Emergency advisories issued by District Disaster Management Authority (Ernakulam).'
                : 'Live advisories, seismic feeds & weather alerts from ResQCore Command Center.',
            style: AppTextStyles.bodyMd.copyWith(
              color: AppColors.textSecondary,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 18),

          if (!isDemo) ...[
            if (provider.loadingAlerts && liveAlerts.isEmpty)
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainer,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.strokeBorder),
                ),
                child: const Row(
                  children: [
                    SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    SizedBox(width: 12),
                    Text(
                      'Syncing live disaster feeds from Command Center...',
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                    ),
                  ],
                ),
              )
            else if (liveAlerts.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainer,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.strokeBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.verified_user, color: AppColors.success, size: 20),
                        const SizedBox(width: 8),
                        Text(
                          'No active critical advisories',
                          style: AppTextStyles.labelLg.copyWith(
                            color: AppColors.textWhite,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Live USGS seismic and Open-Meteo flood monitors are connected. New warnings from Command Center appear here automatically.',
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              )
            else
              ...liveAlerts.map((alert) {
                final sev = (alert['severity'] ?? 'ADVISORY').toString().toUpperCase();
                final color = _severityColor(sev);
                final title = (alert['title'] ?? 'Emergency Advisory').toString();
                final desc = (alert['message'] ?? alert['description'] ?? 'Command Center advisory active.').toString();
                final time = (alert['time'] ?? alert['createdAt'] ?? 'Live').toString();
                return Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: _buildAlertCard(
                    context: context,
                    title: title,
                    severity: sev,
                    severityColor: color,
                    time: time,
                    description: desc,
                    actionText: 'View safety checklist',
                    onAction: () => SafetyAdviceDialog.show(context),
                  ),
                );
              }),
            const SizedBox(height: 24),
          ] else ...[
            // Alert 1 (Demo Mode)
            _buildAlertCard(
              context: context,
              title: 'Flood Warning — Fort Kochi & Mattancherry',
              severity: 'CRITICAL',
              severityColor: AppColors.error,
              time: '12 min ago',
              description:
                  'Backwater levels continue to surge above warning thresholds. Low-lying wards 1 to 5 advised to seek higher ground.',
              actionText: 'View safety checklist',
              imagePath: 'assets/images/scenarios/flood_response_street.png',
              onAction: () => SafetyAdviceDialog.show(context),
            ),
            const SizedBox(height: 14),

            // Alert 2
            _buildAlertCard(
              context: context,
              title: 'Coastal High Tide Surge Advisory',
              severity: 'WARNING',
              severityColor: AppColors.tertiary,
              time: '45 min ago',
              description:
                  'Waves between 2.8m and 3.4m predicted along Fort Kochi beach up to Vypeen. Fishing operations suspended.',
              actionText: 'Sea wall status',
              imagePath: 'assets/images/scenarios/flood_river_boat.png',
              onAction: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Coastal barricade intact. Marine response teams deployed.')),
                );
              },
            ),
            const SizedBox(height: 14),

            // Alert 3
            _buildAlertCard(
              context: context,
              title: 'Road Submersion & Tree Clearance',
              severity: 'ADVISORY',
              severityColor: AppColors.secondary,
              time: '2 hours ago',
              description:
                  'KB Jacob Road partially inundated near junction. Alternative tactical detour through Palace Road recommended.',
              actionText: 'View detour routes',
              imagePath: 'assets/images/scenarios/highway_ambulance_storm.png',
              onAction: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Traffic redirected by Civil Defence Wardens.')),
                );
              },
            ),
            const SizedBox(height: 14),

            // Alert 4
            _buildAlertCard(
              context: context,
              title: 'Structural Stability Check — Historic Fort Precinct',
              severity: 'CAUTION',
              severityColor: const Color(0xFFF97316),
              time: '3 hours ago',
              description:
                  'Heritage building foundations under ultrasonic inspection. Perimeter cordons placed around Old Customs House.',
              actionText: 'Safety protocols',
              imagePath: 'assets/images/scenarios/earthquake_rubble_collapse.png',
              onAction: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Building safety squad on site. Maintain safe distance.')),
                );
              },
            ),
            const SizedBox(height: 14),

            // Alert 5
            _buildAlertCard(
              context: context,
              title: 'Night Ravine & Perimeter Patrol Active',
              severity: 'SEARCH & RESCUE',
              severityColor: const Color(0xFF38BDF8),
              time: 'Just now',
              description:
                  'Ground SAR units and thermal reconnaissance drones deployed for wilderness sweep along coastal scrubland.',
              actionText: 'Report visual sighting',
              imagePath: 'assets/images/scenarios/ravine_night_patrol.png',
              onAction: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Direct hotline connected to SAR dispatch desk.')),
                );
              },
            ),
            const SizedBox(height: 24),
          ],
        ],
      ),
    );
  }

  Widget _buildAlertCard({
    required BuildContext context,
    required String title,
    required String severity,
    required Color severityColor,
    required String time,
    required String description,
    required String actionText,
    required VoidCallback onAction,
    String? imagePath,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: severityColor.withValues(alpha: 0.38),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          children: [
            // Background Scenario Image if provided
            if (imagePath != null)
              Positioned.fill(
                child: Image.asset(
                  imagePath,
                  fit: BoxFit.cover,
                  alignment: Alignment.center,
                  errorBuilder: (_, _, _) => const SizedBox(),
                ),
              ),

            // High-contrast tactical gradient scrim
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      imagePath != null
                          ? const Color(0xFF0B1220).withValues(alpha: 0.82)
                          : AppColors.surfaceContainer,
                      imagePath != null
                          ? const Color(0xFF060913).withValues(alpha: 0.95)
                          : AppColors.surfaceContainer,
                    ],
                  ),
                ),
              ),
            ),

            // Card Content
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: severityColor.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: severityColor.withValues(alpha: 0.4),
                            width: 1,
                          ),
                        ),
                        child: Text(
                          severity,
                          style: AppTextStyles.labelSm.copyWith(
                            color: severityColor,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.4),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          time,
                          style: AppTextStyles.bodySm.copyWith(
                            color: AppColors.textTertiary,
                            fontSize: 11,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    title,
                    style: AppTextStyles.labelLg.copyWith(
                      color: AppColors.textWhite,
                      fontWeight: FontWeight.w700,
                      shadows: const [
                        Shadow(color: Colors.black, blurRadius: 4),
                      ],
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    description,
                    style: AppTextStyles.bodySm.copyWith(
                      color: const Color(0xFFCBD5E1),
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 14),
                  InkWell(
                    onTap: onAction,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppColors.primaryContainer.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: AppColors.primaryContainer.withValues(alpha: 0.35),
                          width: 1,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            actionText,
                            style: AppTextStyles.labelMd.copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(width: 6),
                          const Icon(
                            Icons.arrow_forward,
                            size: 13,
                            color: AppColors.primary,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
