import 'package:flutter/material.dart';
import '../theme/tactical_theme.dart';
import '../models/app_state.dart';
import '../services/tactical_sync_service.dart';
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
  List<Map<String, dynamic>> _volunteers = [];
  bool _loading = true;
  String _errorMsg = '';
  String _filterStatus = 'All';
  final TextEditingController _searchController = TextEditingController();

  final List<String> _statusFilters = ['All', 'Active', 'Available', 'Resting'];

  @override
  void initState() {
    super.initState();
    _fetchVolunteers();
    TacticalSyncService.watchVolunteers(_fetchVolunteers);
  }

  @override
  void dispose() {
    TacticalSyncService.stopWatchingVolunteers();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetchVolunteers() async {
    final list = await TacticalSyncService.fetchVolunteers();
    if (!mounted) return;
    setState(() {
      _volunteers = list;
      _loading = false;
      _errorMsg = list.isEmpty ? 'No volunteers are assigned to this team yet.' : '';
    });
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

  Future<void> _submitVolunteer(String name, String phone, List<String> skills) async {
    final result = await TacticalSyncService.registerVolunteer(name: name, phone: phone, skills: skills);
    if (result == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Registration failed. Check your staff access and connection.')),
        );
      }
      return;
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        backgroundColor: TacticalColors.primary,
        content: Text('$name registered as volunteer!', style: const TextStyle(color: Colors.black)),
      ));
    }
    await _fetchVolunteers();
  }

  List<Map<String, dynamic>> get _filteredVolunteers {
    var list = _volunteers;
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
      case 'Active':
        return TacticalColors.emergencyRed;
      case 'Available':
        return TacticalColors.secondary;
      case 'Resting':
        return TacticalColors.tertiary;
      default:
        return TacticalColors.onSurfaceVariant;
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredVolunteers;

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
        label: const Text('Register', style: TextStyle(fontWeight: FontWeight.bold)),
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
                        child: Icon(Icons.search, color: TacticalColors.outline, size: 18),
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
                                onTap: () => setState(() => _filterStatus = f),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: _filterStatus == f
                                        ? TacticalColors.primary
                                        : TacticalColors.surfaceContainerHigh,
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
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: TacticalColors.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFF1E293B)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _statBadge('Total', _volunteers.length.toString(),
                    TacticalColors.primary),
                _statBadge(
                    'Active',
                    _volunteers
                        .where((v) => v['status'] == 'Active')
                        .length
                        .toString(),
                    TacticalColors.emergencyRed),
                _statBadge(
                    'Available',
                    _volunteers
                        .where((v) => v['status'] == 'Available')
                        .length
                        .toString(),
                    TacticalColors.secondary),
                _statBadge(
                    'Resting',
                    _volunteers
                        .where((v) => v['status'] == 'Resting')
                        .length
                        .toString(),
                    TacticalColors.onSurfaceVariant),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // Volunteer list
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: TacticalColors.primary))
                : _errorMsg.isNotEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.wifi_off,
                                color: TacticalColors.onSurfaceVariant, size: 40),
                            const SizedBox(height: 8),
                            Text(_errorMsg,
                                style: const TextStyle(
                                    color: TacticalColors.onSurfaceVariant,
                                    fontSize: 12)),
                            const SizedBox(height: 8),
                            TextButton(
                              onPressed: _fetchVolunteers,
                              child: const Text('Retry',
                                  style: TextStyle(color: TacticalColors.primary)),
                            ),
                          ],
                        ),
                      )
                    : filtered.isEmpty
                        ? const Center(
                            child: Text('No volunteers found',
                                style: TextStyle(
                                    color: TacticalColors.onSurfaceVariant)),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 90),
                            itemCount: filtered.length,
                            itemBuilder: (ctx, i) =>
                                _buildVolunteerCard(filtered[i]),
                          ),
          ),
        ],
      ),
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

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
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
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: TacticalColors.primary.withOpacity(0.15),
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: TacticalColors.primary.withOpacity(0.4)),
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
                  color: _statusColor(status).withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                  border:
                      Border.all(color: _statusColor(status).withOpacity(0.5)),
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
        ],
      ),
    );
  }
}
