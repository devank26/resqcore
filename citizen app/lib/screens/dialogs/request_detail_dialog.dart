import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/emergency_request.dart';
import '../../providers/rescue_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_text_styles.dart';
import '../../widgets/status_badge.dart';
import '../incident_chat_screen.dart';

class RequestDetailDialog extends StatelessWidget {
  final EmergencyRequest request;

  const RequestDetailDialog({
    super.key,
    required this.request,
  });

  static Future<void> show(BuildContext context, EmergencyRequest request) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => RequestDetailDialog(request: request),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RescueProvider>();
    final liveReq = provider.allRequests.firstWhere(
      (r) => r.id == request.id,
      orElse: () => request,
    );

    return Container(
      padding: const EdgeInsets.only(top: 8),
      decoration: const BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(
          top: BorderSide(color: AppColors.strokeBorder, width: 1),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Drag handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.outlineVariant,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Header: ID and Status
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        request.id,
                        style: AppTextStyles.codeNum.copyWith(
                          fontSize: 20,
                          color: AppColors.textWhite,
                        ),
                      ),
                      Text(
                        request.timeLabel,
                        style: AppTextStyles.bodySm.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                  StatusBadge(status: liveReq.status),
                ],
              ),
              const SizedBox(height: 16),
              const Divider(color: AppColors.strokeBorder, height: 1),
              const SizedBox(height: 16),

              // Title and Location
              Text(
                request.title,
                style: AppTextStyles.headlineSm.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppColors.textWhite,
                ),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  const Icon(
                    Icons.location_on,
                    size: 16,
                    color: AppColors.primary,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      request.fullAddress,
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Description
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.strokeBorder, width: 0.5),
                ),
                child: Text(
                  request.description,
                  style: AppTextStyles.bodySm.copyWith(
                    color: AppColors.onSurface,
                    height: 1.4,
                  ),
                ),
              ),
              const SizedBox(height: 14),

              if (request.requestedResources.isNotEmpty) ...[
                Text(
                  'Requested Resources',
                  style: AppTextStyles.labelSm.copyWith(
                    color: AppColors.textTertiary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: request.requestedResources
                      .map(
                        (res) => Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer.withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: AppColors.primaryContainer.withValues(alpha: 0.5),
                            ),
                          ),
                          child: Text(
                            '${res.name} × ${res.quantity}',
                            style: AppTextStyles.labelSm.copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
                const SizedBox(height: 14),
              ],

              // Fleet Update Strip
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.strokeBorder, width: 1),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: AppColors.primaryContainer.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        liveReq.dispatchIcon,
                        size: 18,
                        color: AppColors.primary,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Dispatch Status',
                            style: AppTextStyles.labelSm.copyWith(
                              color: AppColors.textTertiary,
                            ),
                          ),
                          Text(
                            liveReq.dispatchUpdate,
                            style: AppTextStyles.bodySm.copyWith(
                              color: AppColors.textWhite,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Direct Chat with Assigned Rescue Team
              if (liveReq.hasAssignedTeam)
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      final rootNav = Navigator.of(context, rootNavigator: true);
                      Navigator.of(context).pop();
                      rootNav.push(
                        MaterialPageRoute(
                          builder: (_) => CitizenTeamChatScreen(initialRequest: liveReq),
                        ),
                      );
                    },
                    icon: const Icon(Icons.forum_outlined, size: 19),
                    label: Text(
                      'Chat with ${liveReq.assignedTeam ?? "Assigned Team"}',
                      style: AppTextStyles.labelMd.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.successDark,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                )
              else
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.strokeBorder),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.lock_clock_outlined,
                        size: 16,
                        color: AppColors.textTertiary,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Direct team chat unlocks once Command Center assigns a rescue unit.',
                          style: AppTextStyles.bodySm.copyWith(
                            color: AppColors.textSecondary,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 12),

              // Close CTA
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryContainer,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text('Close'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
