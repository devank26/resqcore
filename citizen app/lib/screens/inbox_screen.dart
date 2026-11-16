import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/rescue_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_text_styles.dart';
import 'dialogs/request_detail_dialog.dart';
import 'incident_chat_screen.dart';

class InboxScreen extends StatelessWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RescueProvider>();
    final isDemo = provider.isDemoMode;
    final liveUpdatesCount = provider.allRequests.length + provider.liveAlerts.length;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Notifications',
                style: AppTextStyles.headlineLg.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppColors.textWhite,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  isDemo ? '2 UNREAD' : '$liveUpdatesCount UPDATES',
                  style: AppTextStyles.labelSm.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w700,
                    fontSize: 10,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Direct dispatches, status milestones and response team communications.',
            style: AppTextStyles.bodyMd.copyWith(
              color: AppColors.textSecondary,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 18),

          if (!isDemo) ...[
            if (liveUpdatesCount == 0)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainer,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.strokeBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'No live notifications yet',
                      style: AppTextStyles.labelLg.copyWith(
                        color: AppColors.textWhite,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Submit an SOS report or wait for Command Center advisories to receive live updates here.',
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              )
            else ...[
              ...provider.allRequests.map(
                (req) {
                  final lastChat = provider.latestChatMessageForIncident(req.id);
                  final chatHint = req.hasAssignedTeam
                      ? (lastChat != null
                          ? 'Team chat · ${lastChat['sender'] ?? 'Team'}: ${lastChat['text'] ?? ''}'
                          : 'Tap to chat with ${req.assignedTeam ?? "Assigned Team"}')
                      : null;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () {
                        if (req.hasAssignedTeam) {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => CitizenTeamChatScreen(initialRequest: req),
                            ),
                          );
                        } else {
                          RequestDetailDialog.show(context, req);
                        }
                      },
                      child: _buildNotificationItem(
                        isUnread: true,
                        icon: req.hasAssignedTeam ? Icons.forum_outlined : req.dispatchIcon,
                        iconBg: req.hasAssignedTeam
                            ? AppColors.successContainer.withValues(alpha: 0.45)
                            : AppColors.primaryContainer.withValues(alpha: 0.2),
                        iconColor: req.hasAssignedTeam ? AppColors.successLight : AppColors.primary,
                        title: '${req.id} · ${req.title}',
                        body: req.requestedResources.isNotEmpty
                            ? '${req.dispatchUpdate}\nRequested: ${req.requestedResources.map((r) => '${r.name} x${r.quantity}').join(', ')}'
                            : req.dispatchUpdate,
                        time: req.timeLabel,
                        actionLabel: chatHint,
                      ),
                    ),
                  );
                },
              ),
              ...provider.liveAlerts.map(
                (alert) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _buildNotificationItem(
                    isUnread: true,
                    icon: Icons.warning_amber_rounded,
                    iconBg: AppColors.tertiaryContainer.withValues(alpha: 0.2),
                    iconColor: AppColors.tertiary,
                    title: (alert['title'] ?? 'Command Advisory').toString(),
                    body: (alert['message'] ?? alert['description'] ?? '').toString(),
                    time: (alert['time'] ?? alert['createdAt'] ?? 'Live').toString(),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 24),
          ] else ...[
            _buildNotificationItem(
              isUnread: true,
              icon: Icons.directions_boat,
              iconBg: AppColors.primaryContainer.withValues(alpha: 0.2),
              iconColor: AppColors.primary,
              title: 'Bravo 02 deployed to your location',
              body:
                  'Speedboat rescue team en route via Kochi Backwaters basin. Expected arrival window: 12 minutes.',
              time: '09:32',
              imageThumbnail: 'assets/images/scenarios/flood_river_boat.png',
            ),
            const SizedBox(height: 10),

            _buildNotificationItem(
              isUnread: true,
              icon: Icons.verified,
              iconBg: AppColors.secondaryContainer.withValues(alpha: 0.2),
              iconColor: AppColors.secondary,
              title: 'Report verified by Response Command',
              body:
                  'Your flood report RQ-261010-0842 was triaged and escalated to High Priority by Zone 04 Command.',
              time: '09:21',
              imageThumbnail: 'assets/images/scenarios/command_radar_dispatch.png',
            ),
            const SizedBox(height: 10),

            _buildNotificationItem(
              isUnread: false,
              icon: Icons.pets,
              iconBg: const Color(0xFF10B981).withValues(alpha: 0.2),
              iconColor: const Color(0xFF34D399),
              title: 'K9 Search Team Sigma deployed in Sector 4',
              body:
                  'Search dog unit deployed along wooded perimeter to trace isolated civilians.',
              time: '07:45',
              imageThumbnail: 'assets/images/scenarios/forest_k9_search.png',
            ),
            const SizedBox(height: 10),

            _buildNotificationItem(
              isUnread: false,
              icon: Icons.check_circle_outline,
              iconBg: AppColors.surfaceContainerHigh,
              iconColor: AppColors.success,
              title: 'Evacuation request resolved',
              body:
                  'Request RQ-261009-0801 for Amaravathy, Fort Kochi marked as completed yesterday.',
              time: 'Yesterday · 17:15',
              imageThumbnail: 'assets/images/scenarios/village_flood_evac.png',
            ),
            const SizedBox(height: 24),
          ],
        ],
      ),
    );
  }

  Widget _buildNotificationItem({
    required bool isUnread,
    required IconData icon,
    required Color iconBg,
    required Color iconColor,
    required String title,
    required String body,
    required String time,
    String? imageThumbnail,
    String? actionLabel,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isUnread
            ? AppColors.surfaceContainer
            : AppColors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isUnread
              ? AppColors.primaryContainer.withValues(alpha: 0.35)
              : AppColors.strokeBorder,
          width: 1,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: iconBg,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: iconColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: AppTextStyles.labelMd.copyWith(
                          color: AppColors.textWhite,
                          fontWeight: isUnread ? FontWeight.w700 : FontWeight.w600,
                        ),
                      ),
                    ),
                    if (isUnread)
                      Container(
                        width: 7,
                        height: 7,
                        margin: const EdgeInsets.only(left: 6),
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.primaryBright,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: AppTextStyles.bodySm.copyWith(
                    color: AppColors.textSecondary,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  time,
                  style: AppTextStyles.bodySm.copyWith(
                    color: AppColors.textTertiary,
                    fontSize: 11,
                  ),
                ),
                if (actionLabel != null && actionLabel.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(Icons.chat_bubble_outline, size: 13, color: AppColors.successLight),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Text(
                          actionLabel,
                          style: AppTextStyles.labelSm.copyWith(
                            color: AppColors.successLight,
                            fontWeight: FontWeight.w700,
                            fontSize: 11,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          if (imageThumbnail != null) ...[
            const SizedBox(width: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: 48,
                height: 48,
                child: Image.asset(
                  imageThumbnail,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const SizedBox(),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
