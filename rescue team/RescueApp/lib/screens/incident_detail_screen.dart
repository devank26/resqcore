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
  final VoidCallback? onOpenCitizenChat;
  final VoidCallback onOpenMap;

  const IncidentDetailScreen({
    super.key,
    required this.appState,
    required this.incidentId,
    required this.onSosPressed,
    required this.onOpenChat,
    this.onOpenCitizenChat,
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
              showBackButton: true,
              onBack: () => Navigator.of(context).maybePop(),
              onSosPressed: onSosPressed,
            ),
            body: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Incident record unavailable.',
                    style: TextStyle(color: TacticalColors.onSurfaceVariant),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.arrow_back, size: 16),
                    label: const Text('Back to Incidents'),
                  ),
                ],
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
            showBackButton: true,
            onBack: () => Navigator.of(context).maybePop(),
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

                // Mission Volunteers (exclusive per active team mission, auto-released on resolve)
                _buildMissionVolunteersCard(
                  context: context,
                  inc: inc,
                  assignedToMe: assignedToMe,
                  isResolved: isResolved,
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
                            final hadVolunteers =
                                appState.volunteersForIncident(inc.id).isNotEmpty;
                            appState.updateIncidentStatus(
                              inc.id,
                              'Resolved',
                              notes: 'Resolved by ${appState.teamName}',
                            );
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  hadVolunteers
                                      ? 'Incident marked Resolved · assigned volunteers returned to Available'
                                      : 'Incident marked Resolved',
                                ),
                              ),
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

                if (assignedToMe && onOpenCitizenChat != null) ...[
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0D9488),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      onPressed: onOpenCitizenChat,
                      icon: const Icon(Icons.chat_bubble_outline, size: 17),
                      label: Text(
                        inc.citizenName != null && inc.citizenName!.trim().isNotEmpty
                            ? 'Chat with Citizen (${inc.citizenName!.trim()})'
                            : 'Chat with Citizen Reporter',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                ] else if (!isResolved) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: TacticalColors.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFF1E293B)),
                    ),
                    child: const Row(
                      children: [
                        Icon(
                          Icons.lock_outline,
                          size: 16,
                          color: TacticalColors.outline,
                        ),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Citizen chat is available only for the rescue team assigned to this report.',
                            style: TextStyle(
                              fontSize: 12,
                              color: TacticalColors.onSurfaceVariant,
                            ),
                          ),
                        ),
                      ],
                    ),
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
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  height: 44,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: TacticalColors.onSurfaceVariant,
                      side: const BorderSide(color: Color(0xFF334155)),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.arrow_back, size: 16),
                    label: const Text('Back to Incidents'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildMissionVolunteersCard({
    required BuildContext context,
    required Incident inc,
    required bool assignedToMe,
    required bool isResolved,
  }) {
    final missionVolunteers = appState.volunteersForIncident(inc.id);
    final assignableCount =
        appState.volunteers.where(appState.isVolunteerAssignable).length;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: TacticalColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF1E293B)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.volunteer_activism,
                size: 16,
                color: TacticalColors.primary,
              ),
              const SizedBox(width: 6),
              const Expanded(
                child: Text(
                  'MISSION VOLUNTEERS',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: TacticalColors.onSurfaceVariant,
                    letterSpacing: 0.7,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: TacticalColors.primary.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '${missionVolunteers.length} Assigned',
                  style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.bold,
                    color: TacticalColors.primary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (missionVolunteers.isEmpty)
            Text(
              isResolved
                  ? 'Incident resolved · any mission volunteers were returned to Available.'
                  : 'No volunteers attached to this mission yet.',
              style: const TextStyle(
                fontSize: 12.5,
                color: TacticalColors.onSurfaceVariant,
              ),
            )
          else
            ...missionVolunteers.map((v) {
              final vId = (v['id'] ?? '').toString();
              final vName = (v['name'] ?? 'Volunteer').toString();
              final vPhone = (v['phone'] ?? '').toString();
              final vSkills =
                  (v['skills'] as List<dynamic>? ?? []).take(3).join(' · ');
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: TacticalColors.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: TacticalColors.warningAmber.withValues(alpha: 0.35),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color:
                            TacticalColors.warningAmber.withValues(alpha: 0.16),
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        vName.isNotEmpty ? vName[0].toUpperCase() : 'V',
                        style: const TextStyle(
                          color: TacticalColors.warningAmber,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            vName,
                            style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.bold,
                              color: TacticalColors.onSurface,
                            ),
                          ),
                          Text(
                            vSkills.isNotEmpty
                                ? vSkills
                                : (vPhone.isNotEmpty ? vPhone : 'Mission Support'),
                            style: const TextStyle(
                              fontSize: 10.5,
                              color: TacticalColors.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (assignedToMe && !isResolved)
                      TextButton(
                        style: TextButton.styleFrom(
                          foregroundColor: TacticalColors.tertiary,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        onPressed: () async {
                          final res =
                              await appState.unassignVolunteerFromMission(
                            volunteerId: vId,
                          );
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              backgroundColor: res['success'] == true
                                  ? TacticalColors.fieldGreen
                                  : TacticalColors.emergencyRed,
                              content: Text(
                                res['success'] == true
                                    ? '$vName returned to Available state'
                                    : (res['error'] ?? 'Release failed')
                                        .toString(),
                                style: res['success'] == true
                                    ? const TextStyle(color: Colors.black)
                                    : null,
                              ),
                            ),
                          );
                        },
                        child: const Text(
                          'Release',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                  ],
                ),
              );
            }),
          if (!isResolved) ...[
            const SizedBox(height: 6),
            if (assignedToMe)
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: TacticalColors.primary,
                    side: const BorderSide(color: TacticalColors.primary),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  onPressed: () => _openAssignVolunteerSheet(context, inc),
                  icon: const Icon(Icons.group_add, size: 16),
                  label: Text(
                    assignableCount > 0
                        ? '+ Assign Active Volunteer ($assignableCount available)'
                        : '+ Assign Active Volunteer',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              )
            else
              Text(
                'Only the assigned team (${inc.teamAssigned.isNotEmpty ? inc.teamAssigned : 'dispatch unit'}) can assign volunteers to this mission.',
                style: const TextStyle(
                  fontSize: 11,
                  color: TacticalColors.outline,
                ),
              ),
          ],
        ],
      ),
    );
  }

  Future<void> _openAssignVolunteerSheet(
    BuildContext context,
    Incident inc,
  ) async {
    appState.fetchVolunteers();

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: TacticalColors.surfaceContainerHigh,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => ListenableBuilder(
        listenable: appState,
        builder: (ctx, _) {
          final allVols = appState.volunteers;
          final available =
              allVols.where(appState.isVolunteerAssignable).toList();
          final locked = allVols
              .where((v) =>
                  !appState.isVolunteerAssignable(v) &&
                  ((v['assignedIncidentId'] ?? '').toString().isNotEmpty ||
                      (v['assignedTeamId'] ?? v['teamId'] ?? '')
                          .toString()
                          .isNotEmpty))
              .toList();

          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(ctx).size.height * 0.7,
                ),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Assign Volunteer · ${inc.id}',
                        style: const TextStyle(
                          color: TacticalColors.onSurface,
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Assigned volunteers join ${appState.teamName} for this mission and auto-return to Available once resolved.',
                        style: const TextStyle(
                          color: TacticalColors.onSurfaceVariant,
                          fontSize: 11.5,
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (available.isEmpty)
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: TacticalColors.surfaceContainerLowest,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFF1E293B)),
                          ),
                          child: const Text(
                            'No unassigned Available or Active volunteers right now.',
                            style: TextStyle(
                              color: TacticalColors.onSurfaceVariant,
                              fontSize: 12,
                            ),
                          ),
                        )
                      else
                        ...available.map((v) {
                          final vId = (v['id'] ?? '').toString();
                          final vName = (v['name'] ?? 'Volunteer').toString();
                          final vStatus = (v['status'] ?? 'Available').toString();
                          final skills = (v['skills'] as List<dynamic>? ?? [])
                              .take(3)
                              .join(' · ');
                          return Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            decoration: BoxDecoration(
                              color: TacticalColors.surfaceContainerLowest,
                              borderRadius: BorderRadius.circular(10),
                              border:
                                  Border.all(color: const Color(0xFF334155)),
                            ),
                            child: ListTile(
                              leading: CircleAvatar(
                                radius: 16,
                                backgroundColor:
                                    TacticalColors.fieldGreen.withValues(alpha: 0.2),
                                child: Text(
                                  vName.isNotEmpty
                                      ? vName[0].toUpperCase()
                                      : 'V',
                                  style: const TextStyle(
                                    color: TacticalColors.fieldGreen,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                              title: Text(
                                '$vName ($vStatus)',
                                style: const TextStyle(
                                  color: TacticalColors.onSurface,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 13,
                                ),
                              ),
                              subtitle: Text(
                                skills.isNotEmpty
                                    ? skills
                                    : (v['phone'] ?? '').toString(),
                                style: const TextStyle(
                                  color: TacticalColors.onSurfaceVariant,
                                  fontSize: 11,
                                ),
                              ),
                              trailing: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: TacticalColors.primary,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Text(
                                  'Assign',
                                  style: TextStyle(
                                    color: Colors.black,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 11,
                                  ),
                                ),
                              ),
                              onTap: () async {
                                final res =
                                    await appState.assignVolunteerToMission(
                                  volunteerId: vId,
                                  incidentId: inc.id,
                                );
                                if (!ctx.mounted) return;
                                if (res['success'] == true) {
                                  Navigator.of(ctx).pop();
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      backgroundColor: TacticalColors.primary,
                                      content: Text(
                                        '$vName assigned to ${appState.teamName} for ${inc.id}',
                                        style:
                                            const TextStyle(color: Colors.black),
                                      ),
                                    ),
                                  );
                                } else {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      backgroundColor:
                                          TacticalColors.emergencyRed,
                                      content: Text(
                                        (res['error'] ??
                                                'Could not assign volunteer')
                                            .toString(),
                                      ),
                                    ),
                                  );
                                }
                              },
                            ),
                          );
                        }),
                      if (locked.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        const Text(
                          'CURRENTLY ASSIGNED TO MISSIONS (LOCKED)',
                          style: TextStyle(
                            color: TacticalColors.outline,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.6,
                          ),
                        ),
                        const SizedBox(height: 6),
                        ...locked.map((v) {
                          final vName = (v['name'] ?? 'Volunteer').toString();
                          final teamLabel = (v['assignedTeamName'] ??
                                  v['assignedTeamId'] ??
                                  v['teamId'] ??
                                  'Another Team')
                              .toString();
                          final incLabel =
                              (v['assignedIncidentId'] ?? '').toString();
                          return Container(
                            margin: const EdgeInsets.only(bottom: 6),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 8),
                            decoration: BoxDecoration(
                              color: TacticalColors.surfaceContainerLowest
                                  .withValues(alpha: 0.55),
                              borderRadius: BorderRadius.circular(8),
                              border:
                                  Border.all(color: const Color(0xFF1E293B)),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.lock_outline,
                                    size: 14, color: TacticalColors.outline),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    '$vName · Assigned to $teamLabel${incLabel.isNotEmpty ? ' ($incLabel)' : ''}',
                                    style: const TextStyle(
                                      color: TacticalColors.onSurfaceVariant,
                                      fontSize: 11.5,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
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
