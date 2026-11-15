import 'package:flutter/material.dart';
import '../theme/tactical_theme.dart';
import '../models/app_state.dart';
import '../models/incident.dart';
import '../widgets/tactical_header.dart';

class IncidentDetailScreen extends StatelessWidget {
  final AppState appState;
  final String incidentId;
  final VoidCallback onSosPressed;
  final VoidCallback onOpenChat;
  final VoidCallback onOpenMap;

  const IncidentDetailScreen({
    super.key,
    required this.appState,
    required this.incidentId,
    required this.onSosPressed,
    required this.onOpenChat,
    required this.onOpenMap,
  });

  Color _severityColor(String severity) {
    final s = severity.toLowerCase();
    if (s == 'critical' || s == 'high') return TacticalColors.secondary;
    if (s == 'medium') return TacticalColors.warningAmber;
    return TacticalColors.primary;
  }

  Color _statusColor(String status) {
    final s = status.toLowerCase();
    if (s == 'resolved') return TacticalColors.tertiary;
    if (s == 'on site') return TacticalColors.tertiaryFixedDim;
    if (s == 'responding' || s == 'verified') return TacticalColors.primary;
    if (s == 'escalated') return TacticalColors.secondary;
    return TacticalColors.warningAmber;
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: appState,
      builder: (context, _) {
        final match = appState.incidents.where((i) => i.id == incidentId);
        if (match.isEmpty) {
          return Scaffold(
            backgroundColor: TacticalColors.surface,
            appBar: TacticalHeader(
              title: 'Incident Details',
              appState: appState,
              onSosPressed: onSosPressed,
            ),
            body: const Center(
              child: Text(
                'Incident record unavailable.',
                style: TextStyle(color: TacticalColors.onSurfaceVariant),
              ),
            ),
          );
        }

        final Incident inc = match.first;
        final bool assignedToMe = inc.isAssignedTo(
          teamId: appState.teamId,
          teamName: appState.teamName,
          userName: appState.userName,
        );
        final String liveStatus = inc.displayStatus;
        final bool isResolved = liveStatus.toLowerCase() == 'resolved';
        final sevColor = _severityColor(inc.severity);
        final statColor = _statusColor(liveStatus);

        return Scaffold(
          backgroundColor: TacticalColors.surface,
          appBar: TacticalHeader(
            title: 'Incident ${inc.id}',
            appState: appState,
            onSosPressed: onSosPressed,
          ),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
              children: [
                if (assignedToMe)
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: TacticalColors.tertiaryContainer.withValues(alpha: 0.28),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: TacticalColors.tertiary.withValues(alpha: 0.55),
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.assignment_turned_in,
                            color: TacticalColors.tertiary, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'ASSIGNED TO YOUR TEAM (${appState.teamName}) · ETA ${inc.eta}',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: TacticalColors.tertiaryFixedDim,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                // Badges Row
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _chipPill(inc.id, TacticalColors.primary),
                    _chipPill(inc.severity.toUpperCase(), sevColor),
                    _chipPill(liveStatus.toUpperCase(), statColor),
                    if (inc.isCitizenSos) _chipPill('CITIZEN SOS', TacticalColors.secondary),
                  ],
                ),
                const SizedBox(height: 12),

                Text(
                  inc.title,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: TacticalColors.onSurface,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.location_on, size: 15, color: TacticalColors.primary),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        inc.location,
                        style: const TextStyle(
                          fontSize: 13,
                          color: TacticalColors.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.schedule, size: 14, color: TacticalColors.outline),
                    const SizedBox(width: 4),
                    Text(
                      'Reported: ${inc.timestamp}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: TacticalColors.outline,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Key Metrics Card
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: TacticalColors.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFF1E293B)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: _metricTile('People Affected', '${inc.affectedCount}'),
                      ),
                      Container(width: 1, height: 36, color: const Color(0xFF1E293B)),
                      Expanded(
                        child: _metricTile(
                          'Assigned Unit',
                          inc.teamAssigned,
                        ),
                      ),
                      Container(width: 1, height: 36, color: const Color(0xFF1E293B)),
                      Expanded(
                        child: _metricTile('ETA', inc.eta),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Coordinates & Map action
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: TacticalColors.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFF1E293B)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.gps_fixed, color: TacticalColors.primary, size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'GPS COORDINATES',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: TacticalColors.outline,
                                letterSpacing: 0.6,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              inc.coordinates,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: TacticalColors.onSurface,
                              ),
                            ),
                          ],
                        ),
                      ),
                      TextButton.icon(
                        onPressed: onOpenMap,
                        icon: const Icon(Icons.map, size: 16),
                        label: const Text('Map'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Requested Resources
                if (inc.requestedResources.isNotEmpty) ...[
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: TacticalColors.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFF1E293B)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'REQUESTED RESOURCES',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: TacticalColors.primary,
                            letterSpacing: 0.6,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: inc.requestedResources.map((r) {
                            final name = (r['name'] ?? r['resourceId'] ?? 'Resource').toString();
                            final qty = (r['quantity'] ?? 1).toString();
                            return Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: TacticalColors.primaryContainer.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: TacticalColors.primary.withValues(alpha: 0.35),
                                ),
                              ),
                              child: Text(
                                '$name ×$qty',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: TacticalColors.primary,
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                ],

                // Situation Description & Citizen Reporter Contact
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: TacticalColors.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFF1E293B)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'SITUATION BRIEF',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: TacticalColors.primary,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        inc.description,
                        style: const TextStyle(
                          fontSize: 13.5,
                          color: TacticalColors.onSurface,
                          height: 1.45,
                        ),
                      ),
                      if (inc.substatus.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Text(
                          'Status note: ${inc.substatus}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: TacticalColors.onSurfaceVariant,
                          ),
                        ),
                      ],
                      if ((inc.citizenName ?? '').isNotEmpty ||
                          (inc.contactNumber ?? '').isNotEmpty) ...[
                        const Divider(color: Color(0xFF1E293B), height: 22),
                        const Text(
                          'CITIZEN CONTACT',
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.bold,
                            color: TacticalColors.outline,
                            letterSpacing: 0.6,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '${inc.citizenName ?? 'Citizen'} · ${inc.contactNumber ?? 'No phone supplied'}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: TacticalColors.onSurface,
                          ),
                        ),
                      ],
                      if ((inc.fieldReport ?? '').isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          inc.fieldReport!,
                          style: const TextStyle(
                            fontSize: 12,
                            color: TacticalColors.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 18),

                // Field Status Controls
                if (!isResolved) ...[
                  const Text(
                    'FIELD STATUS ACTIONS',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: TacticalColors.onSurfaceVariant,
                      letterSpacing: 0.7,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: TacticalColors.primary,
                            side: const BorderSide(color: TacticalColors.primary),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          onPressed: () {
                            appState.updateIncidentStatus(
                              inc.id,
                              'On site',
                              notes: '${appState.teamName} arrived on site',
                            );
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Updated status to On site')),
                            );
                          },
                          icon: const Icon(Icons.pin_drop, size: 17),
                          label: const Text('Mark On Site'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: TacticalColors.tertiary,
                            foregroundColor: Colors.black,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          onPressed: () {
                            appState.updateIncidentStatus(
                              inc.id,
                              'Resolved',
                              notes: 'Resolved by ${appState.teamName}',
                            );
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Incident marked Resolved')),
                            );
                          },
                          icon: const Icon(Icons.check_circle, size: 17),
                          label: const Text(
                            'Mark Resolved',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                ],

                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: TacticalColors.onSurface,
                      side: const BorderSide(color: Color(0xFF334155)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    onPressed: onOpenChat,
                    icon: const Icon(Icons.forum, size: 17),
                    label: const Text('Open Tactical Comms'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _metricTile(String label, String value) {
    return Column(
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 10.5,
            color: TacticalColors.outline,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.bold,
            color: TacticalColors.onSurface,
          ),
        ),
      ],
    );
  }

  Widget _chipPill(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.bold,
          color: color,
        ),
      ),
    );
  }
}
