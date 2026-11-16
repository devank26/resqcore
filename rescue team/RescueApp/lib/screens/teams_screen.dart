import 'package:flutter/material.dart';
import '../theme/tactical_theme.dart';
import '../models/app_state.dart';
import '../models/team_member.dart';
import '../widgets/tactical_header.dart';
import '../widgets/tactical_radar_widget.dart';

class TeamsScreen extends StatefulWidget {
  final AppState appState;
  final VoidCallback onSosPressed;
  final VoidCallback onOpenTeamChat;

  const TeamsScreen({
    super.key,
    required this.appState,
    required this.onSosPressed,
    required this.onOpenTeamChat,
  });

  @override
  State<TeamsScreen> createState() => _TeamsScreenState();
}

class _TeamsScreenState extends State<TeamsScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _activeTab = 'Active';
  String? _highlightedMember;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final teams = widget.appState.teams;
    final RescueTeam? activeTeam = teams.isEmpty
        ? null
        : teams.firstWhere(
            (t) =>
                t.id == widget.appState.teamId ||
                t.name.toLowerCase() == widget.appState.teamName.toLowerCase(),
            orElse: () => teams.first,
          );

    if (activeTeam == null) {
      return Scaffold(
        backgroundColor: TacticalColors.surface,
        appBar: TacticalHeader(
          title: 'Teams',
          appState: widget.appState,
          onSosPressed: widget.onSosPressed,
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const CircularProgressIndicator(color: TacticalColors.primary),
                const SizedBox(height: 14),
                const Text(
                  'Registering rescue unit with Command Center...',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: TacticalColors.onSurfaceVariant, fontSize: 13),
                ),
                const SizedBox(height: 18),
                ElevatedButton.icon(
                  onPressed: _openCreateTeamModal,
                  icon: const Icon(Icons.group_add),
                  label: const Text('Create Rescue Team'),
                ),
              ],
            ),
          ),
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _openCreateTeamModal,
          backgroundColor: TacticalColors.primary,
          foregroundColor: Colors.black,
          icon: const Icon(Icons.group_add),
          label: const Text('Create Team', style: TextStyle(fontWeight: FontWeight.bold)),
        ),
      );
    }
    final teamAlpha = activeTeam;

    return Scaffold(
      backgroundColor: TacticalColors.surface,
      appBar: TacticalHeader(
        title: 'Teams',
        appState: widget.appState,
        onSosPressed: widget.onSosPressed,
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
            child: Column(
              children: [
                // Search Bar & Filter Tune Button
                Container(
                  height: 42,
                  decoration: BoxDecoration(
                    color: TacticalColors.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFF1E293B)),
                  ),
                  child: Row(
                    children: [
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 10),
                        child: Icon(Icons.search, color: TacticalColors.outline, size: 18),
                      ),
                      Expanded(
                        child: TextField(
                          controller: _searchController,
                          onChanged: (_) => setState(() {}),
                          style: const TextStyle(color: TacticalColors.onSurface, fontSize: 13),
                          decoration: const InputDecoration(
                            border: InputBorder.none,
                            isDense: true,
                            hintText: 'Search team code, callsign, frequency...',
                            hintStyle: TextStyle(color: TacticalColors.outline, fontSize: 13),
                          ),
                        ),
                      ),
                      if (_searchController.text.isNotEmpty)
                        IconButton(
                          icon: const Icon(Icons.close, color: TacticalColors.outline, size: 16),
                          onPressed: () {
                            _searchController.clear();
                            setState(() {});
                          },
                        )
                      else
                        IconButton(
                          icon: const Icon(Icons.group_add, color: TacticalColors.primary, size: 18),
                          tooltip: 'Create Rescue Team',
                          onPressed: _openCreateTeamModal,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),

                // Segmented Filter Tabs
                Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: TacticalColors.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFF1E293B)),
                  ),
                  child: Row(
                    children: [
                      _buildTab(
                        'Online (${teams.where((t) => _isOnlineTeamStatus(t.status)).length})',
                        'Active',
                        hasPulse: true,
                      ),
                      _buildTab('Nearby', 'Nearby', hasNearMe: true),
                      _buildTab('All Units (${teams.length})', 'All'),
                    ],
                  ),
                ),
              ],
            ),
          ),

          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              children: [
                // Primary Deployment Card: Team Alpha with Scenario Backdrop
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFF1E293B)),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x40000000),
                    blurRadius: 16,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(15),
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: Image.asset(
                        'assets/images/scenarios/forest_k9_search.png',
                        fit: BoxFit.cover,
                        alignment: Alignment.topRight,
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    ),
                    Positioned.fill(
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                            colors: [
                              TacticalColors.surfaceContainer.withValues(alpha: 0.96),
                              TacticalColors.surfaceContainer.withValues(alpha: 0.90),
                              TacticalColors.surfaceContainer.withValues(alpha: 0.65),
                            ],
                            stops: const [0.0, 0.6, 1.0],
                          ),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Badges Row
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: TacticalColors.primaryContainer.withOpacity(0.3),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              'YOUR ASSIGNED UNIT',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: TacticalColors.primary,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: TacticalColors.tertiaryContainer.withOpacity(0.3),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Row(
                              children: [
                                Icon(Icons.circle, color: TacticalColors.tertiary, size: 6),
                                SizedBox(width: 4),
                                Text(
                                  'OPR-READY',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: TacticalColors.tertiary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: TacticalColors.surfaceContainerHigh,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.sensors, color: TacticalColors.primary, size: 14),
                            SizedBox(width: 4),
                            Text(
                              '4/4 SYNCED',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: TacticalColors.primary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  Text(
                    teamAlpha.name,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: TacticalColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      const Icon(Icons.terrain, color: TacticalColors.tertiary, size: 14),
                      const SizedBox(width: 4),
                      Text(
                        teamAlpha.sector,
                        style: const TextStyle(
                          fontSize: 12,
                          color: TacticalColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Team Leader / Commander Section
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: TacticalColors.surfaceContainerHigh,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF1E293B)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: const [
                            Row(
                              children: [
                                Icon(Icons.military_tech, color: TacticalColors.primary, size: 14),
                                SizedBox(width: 4),
                                Text(
                                  'FIELD COMMANDER',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: TacticalColors.primary,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ],
                            ),
                            Text(
                              '12 Yrs NDRF Veteran',
                              style: TextStyle(
                                fontSize: 11,
                                color: TacticalColors.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Container(
                              width: 46,
                              height: 46,
                              decoration: BoxDecoration(
                                color: TacticalColors.surfaceContainerHighest,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Icon(
                                Icons.person,
                                color: TacticalColors.primary,
                                size: 28,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        teamAlpha.commanderName,
                                        style: const TextStyle(
                                          fontSize: 15,
                                          fontWeight: FontWeight.bold,
                                          color: TacticalColors.onSurface,
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                        decoration: BoxDecoration(
                                          color: TacticalColors.surfaceVariant,
                                          borderRadius: BorderRadius.circular(4),
                                        ),
                                        child: Text(
                                          teamAlpha.commanderBloodGroup,
                                          style: const TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.bold,
                                            color: TacticalColors.secondary,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const Text(
                                    'Incident Commander & Alpine Specialist',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: TacticalColors.onSurfaceVariant,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Row(
                                    children: const [
                                      Icon(Icons.radio, color: TacticalColors.primary, size: 12),
                                      SizedBox(width: 4),
                                      Text(
                                        'Ch 4A (156.8MHz)',
                                        style: TextStyle(
                                          fontSize: 10,
                                          color: TacticalColors.primary,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      SizedBox(width: 8),
                                      Icon(Icons.circle, color: TacticalColors.tertiary, size: 6),
                                      SizedBox(width: 4),
                                      Text(
                                        'Active On-Site',
                                        style: TextStyle(
                                          fontSize: 10,
                                          color: TacticalColors.tertiary,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            // Direct Call Button
                            InkWell(
                              onTap: () {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text('Calling Commander at ${teamAlpha.commanderPhone}'),
                                  ),
                                );
                              },
                              borderRadius: BorderRadius.circular(10),
                              child: Container(
                                width: 38,
                                height: 38,
                                decoration: BoxDecoration(
                                  color: TacticalColors.surfaceBright,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: const Icon(Icons.call, color: TacticalColors.primary, size: 18),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Member Telemetry & Live Radar Widget
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: const [
                      Row(
                        children: [
                          Icon(Icons.radar, color: TacticalColors.tertiary, size: 16),
                          SizedBox(width: 6),
                          Text(
                            'Member Telemetry & GPS',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                              color: TacticalColors.onSurface,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        'Mesh 100%',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: TacticalColors.tertiary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),

                  // Radar Custom Animation Canvas
                  TacticalRadarWidget(
                    onMemberTapped: (name) {
                      setState(() => _highlightedMember = name);
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Focusing GPS Telemetry on $name'),
                          duration: const Duration(seconds: 1),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 14),

                  // Member Roster Cards
                  ...teamAlpha.members.map((member) {
                    final isHighlighted = _highlightedMember == member.name;
                    return _buildMemberCard(member, isHighlighted);
                  }),

                  const SizedBox(height: 14),
                  // Open Tactical Team Chat CTA
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed: widget.onOpenTeamChat,
                      icon: const Icon(Icons.forum, size: 18),
                      label: const Text(
                        'Open Tactical Team Chat (Ch 4-Alpha)',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 18),
            _buildTeamDirectorySection(teams, activeTeam),
            const SizedBox(height: 84),
          ],
        ),
      ),
    ],
  ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreateTeamModal,
        backgroundColor: TacticalColors.primary,
        foregroundColor: Colors.black,
        icon: const Icon(Icons.group_add),
        label: const Text(
          'Create Team',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
        ),
      ),
);
  }

  bool _isOnlineTeamStatus(String status) {
    final s = status.trim().toUpperCase();
    return s != 'OFFLINE' && s != 'INACTIVE';
  }

  List<RescueTeam> _filterTeams(List<RescueTeam> teams, RescueTeam activeTeam) {
    final q = _searchController.text.trim().toLowerCase();
    return teams.where((team) {
      if (_activeTab == 'Active' && !_isOnlineTeamStatus(team.status)) {
        return false;
      }
      if (_activeTab == 'Nearby') {
        final activeSector = activeTeam.sector.trim().toLowerCase();
        final teamSector = team.sector.trim().toLowerCase();
        if (team.id != activeTeam.id &&
            activeSector.isNotEmpty &&
            teamSector.isNotEmpty &&
            teamSector != activeSector) {
          return false;
        }
      }
      if (q.isEmpty) return true;
      final inMeta = team.name.toLowerCase().contains(q) ||
          team.id.toLowerCase().contains(q) ||
          team.callsign.toLowerCase().contains(q) ||
          team.frequency.toLowerCase().contains(q) ||
          team.sector.toLowerCase().contains(q) ||
          team.commanderName.toLowerCase().contains(q) ||
          team.status.toLowerCase().contains(q);
      if (inMeta) return true;
      return team.members.any(
        (m) =>
            m.name.toLowerCase().contains(q) ||
            m.role.toLowerCase().contains(q) ||
            m.specialty.toLowerCase().contains(q),
      );
    }).toList();
  }

  Widget _buildTeamDirectorySection(List<RescueTeam> teams, RescueTeam activeTeam) {
    final filtered = _filterTeams(teams, activeTeam);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'ALL RESCUE UNITS (${filtered.length}/${teams.length})',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                letterSpacing: 1.0,
                color: TacticalColors.onSurfaceVariant,
              ),
            ),
            TextButton.icon(
              onPressed: _openCreateTeamModal,
              icon: const Icon(Icons.add_circle_outline, size: 16, color: TacticalColors.primary),
              label: const Text(
                'New Team',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: TacticalColors.primary,
                ),
              ),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (filtered.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: TacticalColors.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF1E293B)),
            ),
            child: Column(
              children: [
                const Icon(Icons.groups_outlined, color: TacticalColors.outline, size: 28),
                const SizedBox(height: 8),
                Text(
                  _searchController.text.trim().isNotEmpty
                      ? 'No teams matching "${_searchController.text.trim()}"'
                      : 'No teams match this filter',
                  style: const TextStyle(
                    fontSize: 13,
                    color: TacticalColors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          )
        else
          ...filtered.map((team) => _buildDirectoryTeamCard(team, team.id == activeTeam.id)),
      ],
    );
  }

  Widget _buildDirectoryTeamCard(RescueTeam team, bool isActive) {
    final isOffline = !_isOnlineTeamStatus(team.status);
    final statusColor = isOffline ? TacticalColors.outline : TacticalColors.tertiary;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: TacticalColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isActive ? TacticalColors.primary : const Color(0xFF1E293B),
          width: isActive ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: isActive
                      ? TacticalColors.primaryContainer.withValues(alpha: 0.4)
                      : TacticalColors.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  Icons.shield_outlined,
                  color: isActive ? TacticalColors.primary : TacticalColors.onSurfaceVariant,
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
                        Flexible(
                          child: Text(
                            team.name,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                              color: TacticalColors.onSurface,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: statusColor.withValues(alpha: 0.16),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            team.status.toUpperCase(),
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                              color: statusColor,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${team.callsign} • ${team.frequency} • ${team.sector}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        color: TacticalColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (isActive)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: TacticalColors.primary.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'ACTIVE',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: TacticalColors.primary,
                      letterSpacing: 0.6,
                    ),
                  ),
                )
              else
                OutlinedButton(
                  onPressed: () {
                    widget.appState.selectActiveTeam(team);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        backgroundColor: TacticalColors.surfaceContainerHighest,
                        content: Text(
                          'Active unit switched to ${team.name}',
                          style: const TextStyle(color: TacticalColors.onSurface),
                        ),
                      ),
                    );
                  },
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: TacticalColors.primary),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text(
                    'Activate',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: TacticalColors.primary,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(Icons.person_outline, size: 14, color: TacticalColors.outline),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  team.commanderName.isNotEmpty ? team.commanderName : 'Command Lead Unassigned',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, color: TacticalColors.onSurfaceVariant),
                ),
              ),
              const SizedBox(width: 10),
              const Icon(Icons.groups, size: 14, color: TacticalColors.outline),
              const SizedBox(width: 4),
              Text(
                '${team.totalCount} responders',
                style: const TextStyle(fontSize: 11, color: TacticalColors.onSurfaceVariant),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _openCreateTeamModal() {
    final teams = widget.appState.teams;
    final RescueTeam? activeTeam = teams.isEmpty
        ? null
        : teams.firstWhere(
            (t) =>
                t.id == widget.appState.teamId ||
                t.name.toLowerCase() == widget.appState.teamName.toLowerCase(),
            orElse: () => teams.first,
          );
    final nameController = TextEditingController();
    final callsignController = TextEditingController();
    final sectorController = TextEditingController(
      text: (activeTeam?.sector.isNotEmpty ?? false)
          ? activeTeam!.sector
          : 'Sector 4-North',
    );
    final commanderController = TextEditingController(
      text: (activeTeam?.commanderName.isNotEmpty ?? false)
          ? activeTeam!.commanderName
          : widget.appState.userName,
    );
    final phoneController = TextEditingController(
      text: (activeTeam?.commanderPhone.isNotEmpty ?? false)
          ? activeTeam!.commanderPhone
          : widget.appState.userPhone,
    );
    final frequencyController = TextEditingController(
      text: (activeTeam?.frequency.isNotEmpty ?? false)
          ? activeTeam!.frequency
          : 'CH-16 (156.8 MHz)',
    );

    const specializations = ['SAR', 'MEDICAL', 'FIRE', 'HAZMAT', 'K9', 'WATER'];
    String selectedSpec = 'SAR';
    int responders = 4;
    bool setAsActive = true;
    bool submitting = false;
    String? formError;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: TacticalColors.surfaceContainer,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 16,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Create Rescue Team',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: TacticalColors.onSurface,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, color: TacticalColors.onSurfaceVariant),
                          onPressed: submitting ? null : () => Navigator.of(sheetCtx).pop(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (formError != null) ...[
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.redAccent.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.redAccent.withValues(alpha: 0.5)),
                        ),
                        child: Text(
                          formError!,
                          style: const TextStyle(color: Colors.redAccent, fontSize: 12),
                        ),
                      ),
                      const SizedBox(height: 10),
                    ],
                    _buildModalField(
                      controller: nameController,
                      label: 'Team Name *',
                      hint: 'e.g. Bravo Rapid Unit',
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: _buildModalField(
                            controller: callsignController,
                            label: 'Callsign (optional)',
                            hint: 'e.g. BRAVO-02',
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _buildModalField(
                            controller: frequencyController,
                            label: 'Radio Channel',
                            hint: 'CH-16 (156.8 MHz)',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    _buildModalField(
                      controller: sectorController,
                      label: 'Operational Sector',
                      hint: 'e.g. Sector 4-North',
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: _buildModalField(
                            controller: commanderController,
                            label: 'Team Commander',
                            hint: 'Commander name',
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _buildModalField(
                            controller: phoneController,
                            label: 'Commander Phone',
                            hint: '+91-98...',
                            keyboardType: TextInputType.phone,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Specialization',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: TacticalColors.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: specializations.map((spec) {
                        final selected = selectedSpec == spec;
                        return ChoiceChip(
                          label: Text(spec),
                          selected: selected,
                          onSelected: submitting
                              ? null
                              : (_) => setModalState(() => selectedSpec = spec),
                          selectedColor: TacticalColors.primary,
                          backgroundColor: TacticalColors.surfaceContainerHigh,
                          labelStyle: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: selected ? Colors.black : TacticalColors.onSurface,
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Responders Count',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: TacticalColors.onSurface,
                          ),
                        ),
                        Row(
                          children: [
                            IconButton(
                              onPressed: submitting || responders <= 1
                                  ? null
                                  : () => setModalState(() => responders--),
                              icon: const Icon(Icons.remove_circle_outline),
                              color: TacticalColors.primary,
                            ),
                            Text(
                              '$responders',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: TacticalColors.onSurface,
                              ),
                            ),
                            IconButton(
                              onPressed: submitting || responders >= 50
                                  ? null
                                  : () => setModalState(() => responders++),
                              icon: const Icon(Icons.add_circle_outline),
                              color: TacticalColors.primary,
                            ),
                          ],
                        ),
                      ],
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      value: setAsActive,
                      activeThumbColor: TacticalColors.primary,
                      title: const Text(
                        'Set as my active rescue unit',
                        style: TextStyle(fontSize: 13, color: TacticalColors.onSurface),
                      ),
                      onChanged: submitting
                          ? null
                          : (val) => setModalState(() => setAsActive = val),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      height: 46,
                      child: ElevatedButton.icon(
                        onPressed: submitting
                            ? null
                            : () async {
                                final teamName = nameController.text.trim();
                                if (teamName.length < 2) {
                                  setModalState(() => formError = 'Please enter a team name (min 2 chars).');
                                  return;
                                }
                                setModalState(() {
                                  submitting = true;
                                  formError = null;
                                });
                                final res = await widget.appState.createRescueTeam(
                                  name: teamName,
                                  callsign: callsignController.text.trim(),
                                  specialization: selectedSpec,
                                  responders: responders,
                                  sector: sectorController.text.trim(),
                                  commanderName: commanderController.text.trim(),
                                  commanderPhone: phoneController.text.trim(),
                                  frequency: frequencyController.text.trim(),
                                  setAsActive: setAsActive,
                                );
                                if (!sheetCtx.mounted) return;
                                if (res.ok) {
                                  Navigator.of(sheetCtx).pop();
                                  if (!mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      backgroundColor: res.offline
                                          ? Colors.orange.shade800
                                          : TacticalColors.primary,
                                      content: Text(
                                        res.offline
                                            ? '${res.team?.name ?? teamName} saved locally — will sync when online'
                                            : '${res.team?.name ?? teamName} created and saved',
                                        style: TextStyle(
                                          color: res.offline ? Colors.white : Colors.black,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  );
                                } else {
                                  setModalState(() {
                                    submitting = false;
                                    formError = res.error ?? 'Could not create team.';
                                  });
                                }
                              },
                        icon: submitting
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                              )
                            : const Icon(Icons.check_circle_outline),
                        label: Text(
                          submitting ? 'Creating Team...' : 'Create Rescue Team',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    ).whenComplete(() {
      nameController.dispose();
      callsignController.dispose();
      sectorController.dispose();
      commanderController.dispose();
      phoneController.dispose();
      frequencyController.dispose();
    });
  }

  Widget _buildModalField({
    required TextEditingController controller,
    required String label,
    required String hint,
    TextInputType keyboardType = TextInputType.text,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      style: const TextStyle(color: TacticalColors.onSurface, fontSize: 13),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        labelStyle: const TextStyle(color: TacticalColors.onSurfaceVariant, fontSize: 12),
        hintStyle: const TextStyle(color: TacticalColors.outline, fontSize: 12),
        filled: true,
        fillColor: TacticalColors.surfaceContainerHigh,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF1E293B)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF1E293B)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: TacticalColors.primary),
        ),
      ),
    );
  }


  Widget _buildTab(String label, String key, {bool hasPulse = false, bool hasNearMe = false}) {
    final isSelected = _activeTab == key;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _activeTab = key),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? TacticalColors.surfaceContainer : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (hasPulse) ...[
                Container(
                  width: 6,
                  height: 6,
                  decoration: const BoxDecoration(
                    color: TacticalColors.tertiary,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 4),
              ],
              if (hasNearMe) ...[
                const Icon(Icons.near_me, color: TacticalColors.primary, size: 12),
                const SizedBox(width: 4),
              ],
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: isSelected ? TacticalColors.primary : TacticalColors.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMemberCard(TeamMember member, bool isHighlighted) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: TacticalColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isHighlighted ? TacticalColors.tertiary : const Color(0xFF1E293B),
          width: isHighlighted ? 1.5 : 1,
        ),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: TacticalColors.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Center(
                      child: Text(
                        member.name.split(' ').map((s) => s.isNotEmpty ? s[0] : '').take(2).join(),
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: TacticalColors.primary,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            member.name,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                              color: TacticalColors.onSurface,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(
                              color: TacticalColors.tertiaryContainer.withOpacity(0.3),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              member.role,
                              style: const TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.bold,
                                color: TacticalColors.tertiary,
                              ),
                            ),
                          ),
                        ],
                      ),
                      Text(
                        member.specialty,
                        style: const TextStyle(
                          fontSize: 11,
                          color: TacticalColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: TacticalColors.surfaceVariant,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.battery_5_bar, color: TacticalColors.tertiary, size: 14),
                    const SizedBox(width: 2),
                    Text(
                      '${member.batteryLevel}%',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: TacticalColors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: TacticalColors.surfaceContainerLowest.withOpacity(0.5),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: TacticalColors.tertiary,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          member.status,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: TacticalColors.tertiary,
                          ),
                        ),
                        const Text(' • ', style: TextStyle(color: TacticalColors.outline)),
                        Text(
                          member.distance,
                          style: const TextStyle(
                            fontSize: 11,
                            color: TacticalColors.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'GPS: ${member.gpsCoords}',
                      style: const TextStyle(
                        fontSize: 9,
                        fontFamily: 'monospace',
                        color: TacticalColors.outline,
                      ),
                    ),
                  ],
                ),
                InkWell(
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Tracking ${member.name} at ${member.gpsCoords}'),
                      ),
                    );
                  },
                  borderRadius: BorderRadius.circular(6),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: TacticalColors.surfaceContainer,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: const Color(0xFF1E293B)),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.pin_drop, color: TacticalColors.primary, size: 12),
                        SizedBox(width: 4),
                        Text(
                          'Track',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: TacticalColors.primary,
                          ),
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
    );
  }
}
