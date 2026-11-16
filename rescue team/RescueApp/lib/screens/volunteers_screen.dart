import 'dart:async';
import 'package:flutter/material.dart';
import '../theme/tactical_theme.dart';
import '../models/app_state.dart';
import '../models/incident.dart';
import '../widgets/tactical_header.dart';

class VolunteersScreen extends StatefulWidget {
  final AppState appState;
  final VoidCallback onSosPressed;

  const VolunteersScreen({
    super.key,
    required this.appState,
    required this.onSosPressed,
  });

  @override
  State<VolunteersScreen> createState() => _VolunteersScreenState();
}

class _VolunteersScreenState extends State<VolunteersScreen> {
  bool _loading = false;
  String _errorMsg = '';
  Timer? _refreshTimer;
  String _filterStatus = 'All';
  final TextEditingController _searchController = TextEditingController();

  final List<String> _statusFilters = [
    'All',
    'Available',
    'Active',
    'Assigned',
    'Resting',
  ];

  @override
  void initState() {
    super.initState();
    _loading = widget.appState.volunteers.isEmpty && !widget.appState.isDemoMode;
    _fetchVolunteers();
    _refreshTimer =
        Timer.periodic(const Duration(seconds: 15), (_) => _fetchVolunteers());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetchVolunteers() async {
    try {
      await widget.appState.fetchVolunteers();
      if (mounted) {
        setState(() {
          _loading = false;
          _errorMsg = '';
        });
      }
      return;
    } catch (_) {}
    if (mounted) {
      setState(() {
        _loading = false;
        _errorMsg = widget.appState.volunteers.isEmpty ? 'Backend not reachable' : '';
      });
    }
  }

  Future<void> _registerAsVolunteer() async {
    final nameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController(text: widget.appState.userPhone);
    final selectedSkills = <String>{};
    const availableSkills = [
      'First Aid', 'Search & Rescue', 'Medical', 'Logistics',
      'Communication', 'Mountain Rescue', 'Drone Operation', 'Counseling',
      'Translation', 'Rope Work', 'Triage', 'Shelter Management',
    ];

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: TacticalColors.surfaceContainerHigh,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModal) => Padding(
          padding: EdgeInsets.only(
            left: 20, right: 20, top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.volunteer_activism, color: TacticalColors.primary, size: 20),
                  const SizedBox(width: 8),
                  const Text('Register as Volunteer', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close, color: TacticalColors.onSurfaceVariant, size: 20),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ]),
                const SizedBox(height: 16),
                _buildTextField(nameCtrl, 'Full Name *'),
                const SizedBox(height: 10),
                _buildTextField(phoneCtrl, 'Phone Number'),
                const SizedBox(height: 12),
                const Text(
                  'Skills (select all that apply):',
                  style: TextStyle(color: TacticalColors.onSurfaceVariant, fontSize: 12),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6, runSpacing: 6,
                  children: availableSkills.map((skill) => FilterChip(
                    label: Text(
                      skill,
                      style: TextStyle(
                        fontSize: 11,
                        color: selectedSkills.contains(skill)
                            ? Colors.white
                            : TacticalColors.onSurfaceVariant,
                      ),
                    ),
                    selected: selectedSkills.contains(skill),
                    onSelected: (v) => setModal(() =>
                        v ? selectedSkills.add(skill) : selectedSkills.remove(skill)),
                    selectedColor: TacticalColors.primary.withOpacity(0.3),
                    backgroundColor: TacticalColors.surfaceContainerLowest,
                    checkmarkColor: TacticalColors.primary,
                    side: BorderSide(
                      color: selectedSkills.contains(skill)
                          ? TacticalColors.primary
                          : const Color(0xFF1E293B),
                    ),
                  )).toList(),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: TacticalColors.primary,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: () async {
                      if (nameCtrl.text.trim().isEmpty) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(content: Text('Name is required')),
                        );
                        return;
                      }
                      Navigator.pop(ctx);
                      await _submitVolunteer(
                        nameCtrl.text.trim(),
                        phoneCtrl.text.trim(),
                        selectedSkills.toList(),
                      );
                    },
                    icon: const Icon(Icons.check, size: 18),
                    label: const Text('Register', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField(TextEditingController ctrl, String label) {
    return TextField(
      controller: ctrl,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: TacticalColors.onSurfaceVariant),
        border: const OutlineInputBorder(),
        enabledBorder: const OutlineInputBorder(
          borderSide: BorderSide(color: Color(0xFF1E293B)),
        ),
        focusedBorder: const OutlineInputBorder(
          borderSide: BorderSide(color: TacticalColors.primary),
        ),
        filled: true,
        fillColor: TacticalColors.surfaceContainerLowest,
      ),
    );
  }

  Future<void> _submitVolunteer(
      String name, String phone, List<String> skills) async {
    final res = await widget.appState.registerVolunteer(
      name: name,
      phone: phone,
      skills: skills,
    );
    if (!mounted) return;
    if (res['offline'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: Colors.orange.shade800,
          content: Text('$name saved offline — will sync when online'),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: TacticalColors.primary,
          content: Text('$name registered as volunteer!',
              style: const TextStyle(color: Colors.black)),
        ),
      );
    }
    setState(() {
      _loading = false;
      _errorMsg = '';
    });
  }

  List<Map<String, dynamic>> _computeFiltered(
      List<Map<String, dynamic>> volunteers) {
    var list = volunteers;
    if (_filterStatus != 'All') {
      list = list.where((v) => v['status'] == _filterStatus).toList();
    }
    final query = _searchController.text.toLowerCase();
    if (query.isNotEmpty) {
      list = list.where((v) {
        final name = (v['name'] as String? ?? '').toLowerCase();
        final skills = (v['skills'] as List<dynamic>? ?? []).join(' ').toLowerCase();
        return name.contains(query) || skills.contains(query);
      }).toList();
    }
    return list;
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'Available':
        return TacticalColors.fieldGreen;
      case 'Active':
        return TacticalColors.primary;
      case 'Assigned':
      case 'Deployed':
        return TacticalColors.warningAmber;
      case 'Resting':
        return TacticalColors.onSurfaceVariant;
      default:
        return TacticalColors.onSurfaceVariant;
    }
  }

  Future<void> _releaseVolunteer(Map<String, dynamic> vol) async {
    final id = (vol['id'] ?? '').toString();
    final name = (vol['name'] ?? 'Volunteer').toString();
    if (id.isEmpty) return;

    final res = await widget.appState.unassignVolunteerFromMission(volunteerId: id);
    if (!mounted) return;
    if (res['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: TacticalColors.fieldGreen,
          content: Text(
            '$name returned to Available state',
            style: const TextStyle(color: Colors.black),
          ),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: TacticalColors.emergencyRed,
          content: Text((res['error'] ?? 'Unable to release volunteer').toString()),
        ),
      );
    }
  }

  Future<void> _assignVolunteerDialog(Map<String, dynamic> vol) async {
    final missions = widget.appState.assignedIncidents;
    if (missions.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: TacticalColors.warningAmber,
          content: Text(
            'Your team needs an active mission before assigning volunteers.',
            style: TextStyle(color: Colors.black, fontWeight: FontWeight.w600),
          ),
        ),
      );
      return;
    }

    final volId = (vol['id'] ?? '').toString();
    final volName = (vol['name'] ?? 'Volunteer').toString();

    final Incident? picked = await showModalBottomSheet<Incident>(
      context: context,
      backgroundColor: TacticalColors.surfaceContainerHigh,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Assign $volName to ${widget.appState.teamName}',
              style: const TextStyle(
                color: TacticalColors.onSurface,
                fontWeight: FontWeight.bold,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Volunteer stays locked to your team for this incident until resolved or released.',
              style: TextStyle(
                color: TacticalColors.onSurfaceVariant,
                fontSize: 11.5,
              ),
            ),
            const SizedBox(height: 12),
            ...missions.map((inc) => Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  decoration: BoxDecoration(
                    color: TacticalColors.surfaceContainerLowest,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF334155)),
                  ),
                  child: ListTile(
                    leading: const Icon(
                      Icons.assignment_turned_in_outlined,
                      color: TacticalColors.primary,
                    ),
                    title: Text(
                      '${inc.id} · ${inc.title}',
                      style: const TextStyle(
                        color: TacticalColors.onSurface,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                    subtitle: Text(
                      '${inc.location} · ${inc.displayStatus}',
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
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    onTap: () => Navigator.of(ctx).pop(inc),
                  ),
                )),
          ],
        ),
      ),
    );

    if (picked == null || !mounted) return;
    final res = await widget.appState.assignVolunteerToMission(
      volunteerId: volId,
      incidentId: picked.id,
    );
    if (!mounted) return;
    if (res['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: TacticalColors.primary,
          content: Text(
            '$volName assigned to ${picked.id} (${widget.appState.teamName})',
            style: const TextStyle(color: Colors.black),
          ),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: TacticalColors.emergencyRed,
          content: Text(
            (res['error'] ?? 'Could not assign volunteer').toString(),
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.appState,
      builder: (context, _) {
        final allVolunteers = widget.appState.volunteers;
        final filtered = _computeFiltered(allVolunteers);
        final availableCount = allVolunteers
            .where((v) => v['status'] == 'Available')
            .length;
        final activeCount =
            allVolunteers.where((v) => v['status'] == 'Active').length;
        final assignedCount = allVolunteers
            .where((v) =>
                v['status'] == 'Assigned' ||
                (v['assignedIncidentId'] ?? '').toString().trim().isNotEmpty)
            .length;

        return Scaffold(
          backgroundColor: TacticalColors.surface,
          appBar: TacticalHeader(
            title: 'Volunteers',
            appState: widget.appState,
            onSosPressed: widget.onSosPressed,
          ),
          floatingActionButton: FloatingActionButton.extended(
            backgroundColor: TacticalColors.primary,
            foregroundColor: Colors.black,
            onPressed: _registerAsVolunteer,
            icon: const Icon(Icons.person_add, size: 18),
            label: const Text('Register',
                style: TextStyle(fontWeight: FontWeight.bold)),
          ),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Column(
                  children: [
                    // Search bar
                    Container(
                      height: 40,
                      decoration: BoxDecoration(
                        color: TacticalColors.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFF1E293B)),
                      ),
                      child: Row(
                        children: [
                          const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 10),
                            child: Icon(Icons.search,
                                color: TacticalColors.outline, size: 18),
                          ),
                          Expanded(
                            child: TextField(
                              controller: _searchController,
                              style: const TextStyle(
                                  color: TacticalColors.onSurface, fontSize: 13),
                              decoration: const InputDecoration(
                                border: InputBorder.none,
                                isDense: true,
                                hintText: 'Search name or skill...',
                                hintStyle: TextStyle(
                                    color: TacticalColors.outline, fontSize: 13),
                              ),
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    // Status filter chips
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: _statusFilters
                            .map((f) => Padding(
                                  padding: const EdgeInsets.only(right: 6),
                                  child: GestureDetector(
                                    onTap: () =>
                                        setState(() => _filterStatus = f),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 12, vertical: 5),
                                      decoration: BoxDecoration(
                                        color: _filterStatus == f
                                            ? TacticalColors.primary
                                            : TacticalColors
                                                .surfaceContainerHigh,
                                        borderRadius: BorderRadius.circular(20),
                                        border: Border.all(
                                          color: _filterStatus == f
                                              ? TacticalColors.primary
                                              : const Color(0xFF1E293B),
                                        ),
                                      ),
                                      child: Text(
                                        f,
                                        style: TextStyle(
                                          color: _filterStatus == f
                                              ? Colors.black
                                              : TacticalColors.onSurface,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ),
                                  ),
                                ))
                            .toList(),
                      ),
                    ),
                  ],
                ),
              ),
              // Stats summary bar
              Container(
                margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: TacticalColors.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF1E293B)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _statBadge('Total', allVolunteers.length.toString(),
                        TacticalColors.primary),
                    _statBadge('Available', availableCount.toString(),
                        TacticalColors.fieldGreen),
                    _statBadge('Active', activeCount.toString(),
                        TacticalColors.primary),
                    _statBadge('Assigned', assignedCount.toString(),
                        TacticalColors.warningAmber),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // Volunteer list
              Expanded(
                child: _loading && allVolunteers.isEmpty
                    ? const Center(
                        child: CircularProgressIndicator(
                            color: TacticalColors.primary))
                    : _errorMsg.isNotEmpty && allVolunteers.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.wifi_off,
                                    color: TacticalColors.onSurfaceVariant,
                                    size: 40),
                                const SizedBox(height: 8),
                                Text(_errorMsg,
                                    style: const TextStyle(
                                        color: TacticalColors.onSurfaceVariant,
                                        fontSize: 12)),
                                const SizedBox(height: 8),
                                TextButton(
                                  onPressed: _fetchVolunteers,
                                  child: const Text('Retry',
                                      style: TextStyle(
                                          color: TacticalColors.primary)),
                                ),
                              ],
                            ),
                          )
                        : filtered.isEmpty
                            ? const Center(
                                child: Text('No volunteers found',
                                    style: TextStyle(
                                        color:
                                            TacticalColors.onSurfaceVariant)),
                              )
                            : ListView.builder(
                                padding:
                                    const EdgeInsets.fromLTRB(16, 0, 16, 90),
                                itemCount: filtered.length,
                                itemBuilder: (ctx, i) =>
                                    _buildVolunteerCard(filtered[i]),
                              ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _statBadge(String label, String value, Color color) {
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Text(value,
          style: TextStyle(
              color: color, fontSize: 16, fontWeight: FontWeight.bold)),
      Text(label,
          style: const TextStyle(
              color: TacticalColors.onSurfaceVariant, fontSize: 10)),
    ]);
  }

  Widget _buildVolunteerCard(Map<String, dynamic> vol) {
    final skills = (vol['skills'] as List<dynamic>? ?? []).cast<String>();
    final status = vol['status'] as String? ?? 'Unknown';
    final name = vol['name'] as String? ?? 'Unknown';
    final phone = vol['phone'] as String? ?? '';
    final assignedTeamId =
        (vol['assignedTeamId'] ?? vol['teamId'] ?? '').toString().trim();
    final assignedTeamName =
        (vol['assignedTeamName'] ?? '').toString().trim();
    final assignedIncId =
        (vol['assignedIncidentId'] ?? '').toString().trim();
    final bool isAssigned =
        assignedIncId.isNotEmpty || assignedTeamId.isNotEmpty;
    final bool assignedToMyTeam =
        isAssigned && widget.appState.isVolunteerAssignedToCurrentTeam(vol);
    final bool canAssign = widget.appState.isVolunteerAssignable(vol);
    final teamLabel =
        assignedTeamName.isNotEmpty ? assignedTeamName : assignedTeamId;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: TacticalColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: assignedToMyTeam
              ? TacticalColors.warningAmber.withValues(alpha: 0.6)
              : isAssigned
                  ? const Color(0xFF334155)
                  : const Color(0xFF1E293B),
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
                  color: TacticalColors.primary.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: TacticalColors.primary.withValues(alpha: 0.4)),
                ),
                alignment: Alignment.center,
                child: Text(
                  name.isNotEmpty ? name[0].toUpperCase() : '?',
                  style: const TextStyle(
                      color: TacticalColors.primary,
                      fontWeight: FontWeight.bold,
                      fontSize: 16),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        style: const TextStyle(
                            color: TacticalColors.onSurface,
                            fontWeight: FontWeight.bold,
                            fontSize: 13)),
                    if (phone.isNotEmpty)
                      Text(phone,
                          style: const TextStyle(
                              color: TacticalColors.onSurfaceVariant,
                              fontSize: 11)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: _statusColor(status).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                      color: _statusColor(status).withValues(alpha: 0.5)),
                ),
                child: Text(
                  status,
                  style: TextStyle(
                      color: _statusColor(status),
                      fontSize: 10,
                      fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          if (skills.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: skills
                  .map((s) => Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: TacticalColors.surfaceContainerLowest,
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: const Color(0xFF1E293B)),
                        ),
                        child: Text(s,
                            style: const TextStyle(
                                color: TacticalColors.tertiary, fontSize: 9)),
                      ))
                  .toList(),
            ),
          ],
          if (isAssigned) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                color: assignedToMyTeam
                    ? TacticalColors.warningAmber.withValues(alpha: 0.12)
                    : TacticalColors.surfaceContainerLowest,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: assignedToMyTeam
                      ? TacticalColors.warningAmber.withValues(alpha: 0.45)
                      : const Color(0xFF334155),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    assignedToMyTeam
                        ? Icons.assignment_turned_in_outlined
                        : Icons.lock_outline,
                    size: 14,
                    color: assignedToMyTeam
                        ? TacticalColors.warningAmber
                        : TacticalColors.onSurfaceVariant,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      assignedToMyTeam
                          ? 'Assigned to Your Team${assignedIncId.isNotEmpty ? ' · $assignedIncId' : ''}'
                          : 'Assigned to ${teamLabel.isNotEmpty ? teamLabel : 'another team'}${assignedIncId.isNotEmpty ? ' · $assignedIncId' : ''} (Locked)',
                      style: TextStyle(
                        color: assignedToMyTeam
                            ? TacticalColors.warningAmber
                            : TacticalColors.onSurfaceVariant,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (assignedToMyTeam)
                    TextButton(
                      style: TextButton.styleFrom(
                        foregroundColor: TacticalColors.tertiary,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      onPressed: () => _releaseVolunteer(vol),
                      child: const Text(
                        'Release',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.bold),
                      ),
                    ),
                ],
              ),
            ),
          ] else if (canAssign) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: TacticalColors.primary,
                  side: const BorderSide(color: TacticalColors.primary),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                onPressed: () => _assignVolunteerDialog(vol),
                icon: const Icon(Icons.group_add, size: 15),
                label: Text(
                  widget.appState.assignedIncidents.isNotEmpty
                      ? 'Assign to Mission (${widget.appState.teamName})'
                      : 'Assign to Mission (Requires Active Mission)',
                  style: const TextStyle(
                      fontSize: 11.5, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
