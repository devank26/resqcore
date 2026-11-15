import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/rescue_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_text_styles.dart';
import '../../widgets/app_top_bar.dart';
import 'report_submission_success_screen.dart';

class AddReportDetailsScreen extends StatefulWidget {
  const AddReportDetailsScreen({super.key});

  @override
  State<AddReportDetailsScreen> createState() => _AddReportDetailsScreenState();
}

class _AddReportDetailsScreenState extends State<AddReportDetailsScreen> {
  late TextEditingController _descController;
  late TextEditingController _contactController;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    final provider = context.read<RescueProvider>();
    _descController = TextEditingController(text: provider.draftDescription);
    _contactController = TextEditingController(
      text: provider.draftContact.isNotEmpty
          ? provider.draftContact
          : provider.currentUser.phoneNumber,
    );
    if (!provider.isDemoMode && provider.availableResources.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.read<RescueProvider>().loadResourcesFromBackend();
      });
    }
  }

  @override
  void dispose() {
    _descController.dispose();
    _contactController.dispose();
    super.dispose();
  }

  Future<void> _onSubmitReport() async {
    final provider = context.read<RescueProvider>();
    final contact = _contactController.text.trim();
    if (contact.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter a contact number so responders can reach you.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }
    if (!provider.draftConsent) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please confirm consent to share this report with responders.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    provider.setDraftDescription(_descController.text.trim());
    provider.setDraftContact(contact);

    try {
      await provider.submitDraftReport();
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
      });
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => const ReportSubmissionSuccessScreen(),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Bad state: ', '')),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  IconData _resourceIcon(String id) {
    switch (id) {
      case 'medical_kit':
        return Icons.medical_services;
      case 'ambulance':
        return Icons.local_hospital;
      case 'boat':
        return Icons.directions_boat;
      case 'drone':
        return Icons.radar;
      case 'helicopter':
        return Icons.flight;
      default:
        return Icons.inventory_2;
    }
  }

  Widget _buildResourceSelector(RescueProvider provider) {
    final resources = provider.availableResources;
    final totalSelected = provider.selectedResourceCount;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Text(
                  'Choose needed resources',
                  style: AppTextStyles.labelMd.copyWith(
                    color: AppColors.textWhite,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: totalSelected > 0
                        ? AppColors.primaryContainer.withValues(alpha: 0.25)
                        : AppColors.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    totalSelected > 0 ? '$totalSelected selected' : 'Optional',
                    style: AppTextStyles.labelSm.copyWith(
                      color: totalSelected > 0
                          ? AppColors.primary
                          : AppColors.textSecondary,
                      fontWeight: FontWeight.w700,
                      fontSize: 10.5,
                    ),
                  ),
                ),
              ],
            ),
            if (!provider.isDemoMode)
              InkWell(
                onTap: provider.loadingResources
                    ? null
                    : () => provider.loadResourcesFromBackend(),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  child: Row(
                    children: [
                      Icon(
                        Icons.refresh,
                        size: 14,
                        color: AppColors.primary,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Refresh',
                        style: AppTextStyles.labelSm.copyWith(
                          color: AppColors.primary,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          'Select dispatch equipment and quantity needed at your location.',
          style: AppTextStyles.bodySm.copyWith(color: AppColors.textSecondary),
        ),
        const SizedBox(height: 10),
        if (provider.loadingResources && resources.isEmpty)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.strokeBorder),
            ),
            child: const Row(
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                SizedBox(width: 10),
                Text(
                  'Loading live district resource inventory...',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                ),
              ],
            ),
          )
        else if (resources.isEmpty)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.strokeBorder),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    provider.resourcesError ?? 'Resource catalog unavailable right now.',
                    style: AppTextStyles.bodySm.copyWith(color: AppColors.textSecondary),
                  ),
                ),
                if (!provider.isDemoMode)
                  TextButton(
                    onPressed: () => provider.loadResourcesFromBackend(),
                    child: const Text('Retry'),
                  ),
              ],
            ),
          )
        else
          Column(
            children: resources.map((res) {
              final id = (res['id'] ?? '').toString();
              final name = (res['name'] ?? id).toString();
              final available = int.tryParse((res['available'] ?? 0).toString()) ?? 0;
              final total = int.tryParse((res['total'] ?? available).toString()) ?? 1;
              final maxCap = total > 0 ? total : 10;
              final qty = provider.resourceQuantity(id);
              final isSelected = qty > 0;

              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: isSelected
                      ? AppColors.primaryContainer.withValues(alpha: 0.12)
                      : AppColors.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isSelected
                        ? AppColors.primaryContainer
                        : AppColors.strokeBorder,
                    width: isSelected ? 1.5 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: (isSelected
                                ? AppColors.primaryContainer
                                : AppColors.surfaceContainerHigh)
                            .withValues(alpha: isSelected ? 0.25 : 1.0),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        _resourceIcon(id),
                        size: 18,
                        color: isSelected ? AppColors.primary : AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            style: AppTextStyles.bodyMd.copyWith(
                              color: AppColors.textWhite,
                              fontWeight: FontWeight.w700,
                              fontSize: 13.5,
                            ),
                          ),
                          Text(
                            '$available available · fleet max $total',
                            style: AppTextStyles.bodySm.copyWith(
                              color: AppColors.textSecondary,
                              fontSize: 11.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        InkWell(
                          onTap: qty > 0 ? () => provider.decrementResource(id) : null,
                          borderRadius: BorderRadius.circular(8),
                          child: Semantics(
                            label: 'Decrease $name',
                            button: true,
                            child: Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: qty > 0
                                    ? AppColors.surfaceContainerHigh
                                    : AppColors.surfaceContainerLow,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: AppColors.strokeBorder),
                              ),
                              child: Icon(
                                Icons.remove,
                                size: 16,
                                color: qty > 0 ? Colors.white : AppColors.textTertiary,
                              ),
                            ),
                          ),
                        ),
                        SizedBox(
                          width: 34,
                          child: Text(
                            '$qty',
                            textAlign: TextAlign.center,
                            style: AppTextStyles.labelMd.copyWith(
                              color: isSelected ? Colors.white : AppColors.textSecondary,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        InkWell(
                          onTap: qty < maxCap
                              ? () => provider.incrementResource(id, max: maxCap)
                              : null,
                          borderRadius: BorderRadius.circular(8),
                          child: Semantics(
                            label: 'Increase $name',
                            button: true,
                            child: Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: qty < maxCap
                                    ? AppColors.primaryContainer
                                    : AppColors.surfaceContainerLow,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Icon(
                                Icons.add,
                                size: 16,
                                color: qty < maxCap ? Colors.white : AppColors.textTertiary,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
      ],
    );
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
                          'STEP 3 OF 3 · REPORT DETAILS',
                          style: AppTextStyles.labelSm.copyWith(
                            color: AppColors.primary,
                            letterSpacing: 1.0,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            '100%',
                            style: AppTextStyles.labelSm.copyWith(
                              fontSize: 10,
                              letterSpacing: 0.8,
                              color: AppColors.primary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    // 3-Segmented Stepper (all active)
                    Row(
                      children: List.generate(3, (index) {
                        return Expanded(
                          child: Container(
                            height: 5,
                            margin: EdgeInsets.only(right: index < 2 ? 6 : 0),
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer,
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                        );
                      }),
                    ),
                    const SizedBox(height: 18),

                    // Headline
                    Text(
                      'Tell us what’s happening.',
                      style: AppTextStyles.headlineXlMobile.copyWith(
                        color: AppColors.textWhite,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'A few details help the team prepare the right support.',
                      style: AppTextStyles.bodyMd.copyWith(
                        color: AppColors.textSecondary,
                        height: 1.35,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Incident Summary Bar
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppColors.strokeBorder,
                          width: 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              color: AppColors.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Icon(
                              provider.draftType.icon,
                              size: 18,
                              color: AppColors.secondary,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              '${provider.draftType.title} · ${provider.draftAddress}',
                              style: AppTextStyles.labelMd.copyWith(
                                color: AppColors.textWhite,
                                fontWeight: FontWeight.w600,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          InkWell(
                            onTap: () => Navigator.of(context).pop(),
                            child: const Icon(
                              Icons.edit,
                              size: 18,
                              color: AppColors.outline,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),

                    // Field 1: Situation Description
                    Row(
                      children: [
                        Text(
                          'Describe the situation ',
                          style: AppTextStyles.labelMd.copyWith(
                            color: AppColors.textWhite,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          '*',
                          style: AppTextStyles.labelMd.copyWith(
                            color: AppColors.error,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainerLowest,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppColors.strokeBorder,
                          width: 1,
                        ),
                      ),
                      child: TextField(
                        controller: _descController,
                        maxLines: 3,
                        style: AppTextStyles.bodyMd.copyWith(
                          color: AppColors.textWhite,
                          height: 1.4,
                        ),
                        decoration: const InputDecoration(
                          isDense: true,
                          contentPadding: EdgeInsets.zero,
                          border: InputBorder.none,
                          hintText: 'Describe people affected and current risk...',
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Include people affected and any urgent medical needs.',
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 18),

                    // Field 2: Photos (optional)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Photos (optional)',
                          style: AppTextStyles.labelMd.copyWith(
                            color: AppColors.textWhite,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          '1 of 3',
                          style: AppTextStyles.labelSm.copyWith(
                            color: AppColors.outline,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    Row(
                      children: [
                        // Uploaded Photo Thumbnail
                        Expanded(
                          child: InkWell(
                            onTap: () => _showPhotoPickerSheet(context, provider),
                            borderRadius: BorderRadius.circular(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  height: 96,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: AppColors.strokeBorder,
                                      width: 1,
                                    ),
                                  ),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(12),
                                    child: Stack(
                                      fit: StackFit.expand,
                                      children: [
                                        Image.asset(
                                          provider.draftPhotoAsset,
                                          fit: BoxFit.cover,
                                          errorBuilder: (context, error, stackTrace) => Container(
                                            color: AppColors.surfaceContainerHigh,
                                            child: const Icon(
                                              Icons.image,
                                              color: AppColors.outline,
                                            ),
                                          ),
                                        ),
                                        Positioned(
                                          top: 6,
                                          right: 6,
                                          child: Container(
                                            width: 22,
                                            height: 22,
                                            decoration: BoxDecoration(
                                              color: AppColors.surfaceContainerLowest
                                                  .withValues(alpha: 0.8),
                                              shape: BoxShape.circle,
                                            ),
                                            child: const Icon(
                                              Icons.cached,
                                              size: 14,
                                              color: Colors.white,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  provider.draftPhotoName,
                                  style: AppTextStyles.bodySm.copyWith(
                                    fontSize: 11,
                                    color: AppColors.textSecondary,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),

                        // Camera / Upload Action Card
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              InkWell(
                                onTap: () => _showPhotoPickerSheet(context, provider),
                                borderRadius: BorderRadius.circular(12),
                                child: Container(
                                  height: 96,
                                  decoration: BoxDecoration(
                                    color: AppColors.surfaceContainerLow,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: AppColors.strokeBorder,
                                      width: 1,
                                    ),
                                  ),
                                  child: Center(
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Container(
                                          width: 32,
                                          height: 32,
                                          decoration: const BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: AppColors.surfaceContainerHigh,
                                          ),
                                          child: const Icon(
                                            Icons.photo_camera,
                                            size: 18,
                                            color: AppColors.secondary,
                                          ),
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          'Camera / upload',
                                          style: AppTextStyles.labelSm.copyWith(
                                            color: AppColors.secondary,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '',
                                style: AppTextStyles.bodySm.copyWith(fontSize: 11),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'JPG or PNG, up to 5 MB each. Only take photos if safe.',
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 18),

                    // Field 2b: Choose Needed Resources & Quantity
                    _buildResourceSelector(provider),
                    const SizedBox(height: 18),

                    // Field 3: Contact number
                    Row(
                      children: [
                        Text(
                          'Contact number ',
                          style: AppTextStyles.labelMd.copyWith(
                            color: AppColors.textWhite,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          '*',
                          style: AppTextStyles.labelMd.copyWith(
                            color: AppColors.error,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Container(
                      height: 48,
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainerLowest,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppColors.strokeBorder,
                          width: 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.call,
                            size: 18,
                            color: AppColors.outline,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: TextField(
                              controller: _contactController,
                              style: AppTextStyles.bodyMd.copyWith(
                                color: AppColors.textWhite,
                              ),
                              keyboardType: TextInputType.phone,
                              decoration: const InputDecoration(
                                isDense: true,
                                contentPadding: EdgeInsets.zero,
                                border: InputBorder.none,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'The assigned team may call this number.',
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Consent Checkbox
                    InkWell(
                      onTap: () {
                        provider.setDraftConsent(!provider.draftConsent);
                      },
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 20,
                            height: 20,
                            margin: const EdgeInsets.only(top: 2),
                            decoration: BoxDecoration(
                              color: provider.draftConsent
                                  ? AppColors.primaryContainer
                                  : AppColors.surfaceContainerHigh,
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(
                                color: provider.draftConsent
                                    ? AppColors.primaryContainer
                                    : AppColors.strokeBorder,
                                width: 1,
                              ),
                            ),
                            child: provider.draftConsent
                                ? const Icon(
                                    Icons.check,
                                    size: 15,
                                    color: Colors.white,
                                  )
                                : null,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'I agree to share this report, location and contact details with the response team.',
                              style: AppTextStyles.bodySm.copyWith(
                                color: AppColors.textWhite,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 22),

                    // Submit CTA Button
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        onPressed: _isSubmitting ? null : _onSubmitReport,
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
                        child: _isSubmitting
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                  color: Colors.white,
                                ),
                              )
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Transform.rotate(
                                    angle: -0.4,
                                    child: const Icon(
                                      Icons.send,
                                      size: 18,
                                      color: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    'Submit emergency report',
                                    style: AppTextStyles.labelLg.copyWith(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                      ),
                    ),
                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showPhotoPickerSheet(BuildContext context, RescueProvider provider) {
    final photoOptions = [
      {
        'title': 'Swift-Water Inundation Recon',
        'asset': 'assets/images/scenarios/flood_river_boat.png',
        'name': 'flood_boat_recon.png · 1.4 MB',
      },
      {
        'title': 'Urban Street Water Rise Level',
        'asset': 'assets/images/scenarios/flood_response_street.png',
        'name': 'street_water_level.png · 1.8 MB',
      },
      {
        'title': 'Highway & Vehicle Hazard',
        'asset': 'assets/images/scenarios/highway_ambulance_storm.png',
        'name': 'highway_storm_hazard.png · 2.1 MB',
      },
      {
        'title': 'Structural Collapse & Rubble',
        'asset': 'assets/images/scenarios/earthquake_rubble_collapse.png',
        'name': 'structural_rubble.png · 1.9 MB',
      },
      {
        'title': 'Night Terrain / Ravine Sweep',
        'asset': 'assets/images/scenarios/night_canyon_search.png',
        'name': 'ravine_night_sweep.png · 1.6 MB',
      },
      {
        'title': 'High Altitude Alpine Evac',
        'asset': 'assets/images/scenarios/helicopter_mountain_alpine.png',
        'name': 'alpine_helo_evac.png · 2.3 MB',
      },
    ];

    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surfaceContainerLowest,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Attach Tactical Recon Photo',
                      style: AppTextStyles.labelLg.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: AppColors.textSecondary, size: 20),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
                Text(
                  'Select field photographic evidence for triage command:',
                  style: AppTextStyles.bodySm.copyWith(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  height: 140,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: photoOptions.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
                    itemBuilder: (_, idx) {
                      final opt = photoOptions[idx];
                      final isCurrent = provider.draftPhotoAsset == opt['asset'];
                      return InkWell(
                        onTap: () {
                          provider.setDraftPhoto(opt['asset']!, opt['name']!);
                          Navigator.pop(ctx);
                        },
                        child: Container(
                          width: 120,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: isCurrent ? AppColors.primaryContainer : AppColors.strokeBorder,
                              width: isCurrent ? 2 : 1,
                            ),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(11),
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                Image.asset(opt['asset']!, fit: BoxFit.cover),
                                Container(
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      begin: Alignment.topCenter,
                                      end: Alignment.bottomCenter,
                                      colors: [
                                        Colors.transparent,
                                        Colors.black.withValues(alpha: 0.8),
                                      ],
                                    ),
                                  ),
                                ),
                                Positioned(
                                  bottom: 6,
                                  left: 6,
                                  right: 6,
                                  child: Text(
                                    opt['title']!,
                                    style: AppTextStyles.labelSm.copyWith(
                                      color: Colors.white,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                    ),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                if (isCurrent)
                                  const Positioned(
                                    top: 6,
                                    right: 6,
                                    child: Icon(Icons.check_circle, color: AppColors.primary, size: 18),
                                  ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
        );
      },
    );
  }
}
