import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/rescue_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_text_styles.dart';
import '../models/user_profile.dart';
import 'main_shell.dart';

class CreateAccountScreen extends StatefulWidget {
  const CreateAccountScreen({super.key});

  @override
  State<CreateAccountScreen> createState() => _CreateAccountScreenState();
}

class _CreateAccountScreenState extends State<CreateAccountScreen>
    with TickerProviderStateMixin {
  final PageController _pageController = PageController();
  late AnimationController _progressController;

  int _currentStep = 0;
  final int _totalSteps = 3;
  bool _isSubmitting = false;

  // Step 1 – Identity
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  String _authMethod = 'phone';

  // Step 2 – Profile
  String _selectedBloodGroup = '';
  final _addressController = TextEditingController();
  final _sectorController = TextEditingController();
  final _medicalController = TextEditingController();

  // Step 3 – Emergency Contact
  final _emergencyNameController = TextEditingController();
  final _emergencyPhoneController = TextEditingController();
  bool _consentChecked = false;

  // Validation errors
  String? _step1Error;
  String? _step2Error;
  String? _step3Error;

  static const _bloodGroups = [
    'A+ Positive', 'A- Negative',
    'B+ Positive', 'B- Negative',
    'AB+ Positive', 'AB- Negative',
    'O+ Positive', 'O- Negative',
  ];

  @override
  void initState() {
    super.initState();
    _progressController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _progressController.value = 1 / _totalSteps;
  }

  @override
  void dispose() {
    _pageController.dispose();
    _progressController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _addressController.dispose();
    _sectorController.dispose();
    _medicalController.dispose();
    _emergencyNameController.dispose();
    _emergencyPhoneController.dispose();
    super.dispose();
  }

  void _goToStep(int step) {
    setState(() => _currentStep = step);
    _pageController.animateToPage(
      step,
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeInOut,
    );
    _progressController.animateTo(
      (step + 1) / _totalSteps,
      duration: const Duration(milliseconds: 400),
      curve: Curves.easeInOut,
    );
  }

  bool _validateStep1() {
    if (_nameController.text.trim().length < 2) {
      setState(() => _step1Error = 'Please enter your full name.');
      return false;
    }
    if (_authMethod == 'phone' && _phoneController.text.trim().length < 8) {
      setState(() => _step1Error = 'Enter a valid mobile number.');
      return false;
    }
    if (_authMethod == 'email' && !_emailController.text.contains('@')) {
      setState(() => _step1Error = 'Enter a valid email address.');
      return false;
    }
    if (_passwordController.text.trim().length < 6) {
      setState(() => _step1Error = 'Password must be at least 6 characters.');
      return false;
    }
    if (_passwordController.text.trim() != _confirmPasswordController.text.trim()) {
      setState(() => _step1Error = 'Passwords do not match.');
      return false;
    }
    setState(() => _step1Error = null);
    return true;
  }

  bool _validateStep2() {
    if (_selectedBloodGroup.isEmpty) {
      setState(() => _step2Error = 'Please select your blood group.');
      return false;
    }
    if (_addressController.text.trim().length < 5) {
      setState(() => _step2Error = 'Enter a valid address.');
      return false;
    }
    setState(() => _step2Error = null);
    return true;
  }

  bool _validateStep3() {
    if (_emergencyNameController.text.trim().length < 2) {
      setState(() => _step3Error = 'Enter emergency contact name.');
      return false;
    }
    if (_emergencyPhoneController.text.trim().length < 8) {
      setState(() => _step3Error = 'Enter a valid emergency contact number.');
      return false;
    }
    if (!_consentChecked) {
      setState(() => _step3Error = 'Please agree to the terms to continue.');
      return false;
    }
    setState(() => _step3Error = null);
    return true;
  }

  Future<void> _submit() async {
    if (!_validateStep3()) return;
    setState(() => _isSubmitting = true);
    await Future.delayed(const Duration(milliseconds: 300));

    try {
      final profile = UserProfile(
        fullName: _nameController.text.trim(),
        phoneNumber: _authMethod == 'phone'
            ? '+91 ${_phoneController.text.trim()}'
            : '',
        email: _emailController.text.trim(),
        bloodGroup: _selectedBloodGroup,
        emergencyContactName: _emergencyNameController.text.trim(),
        emergencyContactPhone: _emergencyPhoneController.text.trim(),
        address: _addressController.text.trim(),
        sector: _sectorController.text.trim(),
        medicalNotes: _medicalController.text.trim(),
        isRegistered: true,
        password: _passwordController.text.trim(),
      );

      if (!mounted) return;
      final provider = context.read<RescueProvider>();
      await provider.registerNewAccount(profile);

      if (!mounted) return;
      setState(() => _isSubmitting = false);

      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const MainShell()),
        (route) => false,
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _step3Error = 'Failed to create account: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RescueProvider>();
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Row(
                children: [
                  InkWell(
                    onTap: () {
                      if (_currentStep > 0) {
                        _goToStep(_currentStep - 1);
                      } else {
                        Navigator.of(context).pop();
                      }
                    },
                    borderRadius: BorderRadius.circular(20),
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.surfaceContainer,
                      ),
                      child: const Icon(Icons.arrow_back,
                          color: AppColors.onSurface, size: 20),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _stepTitle(),
                          style: AppTextStyles.headlineSm.copyWith(
                            fontWeight: FontWeight.w700,
                            color: AppColors.textWhite,
                          ),
                        ),
                        Text(
                          'Step ${_currentStep + 1} of $_totalSteps',
                          style: AppTextStyles.bodySm.copyWith(
                            color: AppColors.textTertiary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => provider.toggleTheme(),
                    icon: Icon(
                      provider.isDarkMode ? Icons.light_mode : Icons.dark_mode,
                      color: AppColors.tertiary,
                      size: 22,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Progress bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: AnimatedBuilder(
                animation: _progressController,
                builder: (_, __) => ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: _progressController.value,
                    backgroundColor: AppColors.surfaceContainerHigh,
                    valueColor: const AlwaysStoppedAnimation<Color>(
                        AppColors.primaryContainer),
                    minHeight: 4,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),

            // Step dots
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_totalSteps, (i) {
                final done = i < _currentStep;
                final active = i == _currentStep;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: active ? 24 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: (done || active)
                        ? AppColors.primaryContainer
                        : AppColors.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(4),
                  ),
                );
              }),
            ),
            const SizedBox(height: 16),

            // Pages
            Expanded(
              child: PageView(
                controller: _pageController,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _buildStep1(),
                  _buildStep2(),
                  _buildStep3(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _stepTitle() {
    switch (_currentStep) {
      case 0: return 'Your identity';
      case 1: return 'Your profile';
      case 2: return 'Emergency contact';
      default: return '';
    }
  }

  // ── Step 1: Identity ───────────────────────────────────────────────────
  Widget _buildStep1() {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _stepIcon(Icons.person_outline, AppColors.primary,
              AppColors.primaryContainer),
          const SizedBox(height: 14),
          Text('Tell us who you are',
              style: AppTextStyles.headlineXlMobile
                  .copyWith(color: AppColors.textWhite, height: 1.2)),
          const SizedBox(height: 6),
          Text(
            'This helps rescue teams identify and reach you quickly during an emergency.',
            style: AppTextStyles.bodyMd
                .copyWith(color: AppColors.textSecondary, height: 1.4),
          ),
          const SizedBox(height: 24),
          _fieldLabel('Full name'),
          const SizedBox(height: 6),
          _inputField(
              controller: _nameController,
              hint: 'e.g. Priya Menon',
              icon: Icons.badge_outlined,
              keyboard: TextInputType.name),
          const SizedBox(height: 16),
          _fieldLabel('Sign in with'),
          const SizedBox(height: 8),
          _authToggle(),
          const SizedBox(height: 12),
          if (_authMethod == 'phone') ...[
            _fieldLabel('Mobile number'),
            const SizedBox(height: 6),
            _inputField(
                controller: _phoneController,
                hint: 'Enter mobile number',
                icon: Icons.call_outlined,
                prefix: '+91 ',
                keyboard: TextInputType.phone),
          ] else ...[
            _fieldLabel('Email address'),
            const SizedBox(height: 6),
            _inputField(
                controller: _emailController,
                hint: 'your@email.com',
                icon: Icons.email_outlined,
                keyboard: TextInputType.emailAddress),
          ],
          const SizedBox(height: 14),
          _fieldLabel('Password'),
          const SizedBox(height: 6),
          _inputField(
            controller: _passwordController,
            hint: 'At least 6 characters',
            icon: Icons.lock_outline,
            obscureText: _obscurePassword,
            suffix: IconButton(
              icon: Icon(
                _obscurePassword ? Icons.visibility_off : Icons.visibility,
                size: 20,
                color: AppColors.textTertiary,
              ),
              onPressed: () =>
                  setState(() => _obscurePassword = !_obscurePassword),
            ),
          ),
          const SizedBox(height: 14),
          _fieldLabel('Confirm password'),
          const SizedBox(height: 6),
          _inputField(
            controller: _confirmPasswordController,
            hint: 'Re-enter your password',
            icon: Icons.lock_outline,
            obscureText: _obscureConfirmPassword,
            suffix: IconButton(
              icon: Icon(
                _obscureConfirmPassword ? Icons.visibility_off : Icons.visibility,
                size: 20,
                color: AppColors.textTertiary,
              ),
              onPressed: () => setState(
                  () => _obscureConfirmPassword = !_obscureConfirmPassword),
            ),
          ),
          if (_step1Error != null) ...[
            const SizedBox(height: 10),
            _errorBanner(_step1Error!),
          ],
          const SizedBox(height: 28),
          _primaryButton(
              label: 'Continue',
              onTap: () { if (_validateStep1()) _goToStep(1); }),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  // ── Step 2: Profile ────────────────────────────────────────────────────
  Widget _buildStep2() {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _stepIcon(Icons.favorite_border, AppColors.successLight,
              AppColors.successContainer),
          const SizedBox(height: 14),
          Text('Your health profile',
              style: AppTextStyles.headlineXlMobile
                  .copyWith(color: AppColors.textWhite, height: 1.2)),
          const SizedBox(height: 6),
          Text(
            'Medical details help responders provide the right care in critical moments.',
            style: AppTextStyles.bodyMd
                .copyWith(color: AppColors.textSecondary, height: 1.4),
          ),
          const SizedBox(height: 24),
          _fieldLabel('Blood group'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _bloodGroups.map((bg) {
              final selected = _selectedBloodGroup == bg;
              return GestureDetector(
                onTap: () => setState(() => _selectedBloodGroup = bg),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 9),
                  decoration: BoxDecoration(
                    color: selected
                        ? AppColors.primaryContainer
                        : AppColors.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: selected
                          ? AppColors.primaryContainer
                          : AppColors.strokeBorder,
                    ),
                  ),
                  child: Text(
                    bg,
                    style: AppTextStyles.labelSm.copyWith(
                      color: selected ? Colors.white : AppColors.textSecondary,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 18),
          _fieldLabel('Home address'),
          const SizedBox(height: 6),
          _inputField(
              controller: _addressController,
              hint: 'e.g. 12, MG Road, Ernakulam',
              icon: Icons.home_outlined,
              keyboard: TextInputType.streetAddress),
          const SizedBox(height: 14),
          _fieldLabel('Area / Sector (optional)'),
          const SizedBox(height: 6),
          _inputField(
              controller: _sectorController,
              hint: 'e.g. Sector 4-B, Fort Kochi',
              icon: Icons.location_city_outlined),
          const SizedBox(height: 14),
          _fieldLabel('Medical notes (optional)'),
          const SizedBox(height: 6),
          _inputField(
              controller: _medicalController,
              hint: 'e.g. Diabetic, asthmatic, wheelchair user...',
              icon: Icons.medical_services_outlined,
              maxLines: 2),
          if (_step2Error != null) ...[
            const SizedBox(height: 10),
            _errorBanner(_step2Error!),
          ],
          const SizedBox(height: 28),
          _primaryButton(
              label: 'Continue',
              onTap: () { if (_validateStep2()) _goToStep(2); }),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  // ── Step 3: Emergency Contact ──────────────────────────────────────────
  Widget _buildStep3() {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _stepIcon(Icons.emergency_outlined, AppColors.tertiary,
              AppColors.tertiaryContainer),
          const SizedBox(height: 14),
          Text('Emergency contact',
              style: AppTextStyles.headlineXlMobile
                  .copyWith(color: AppColors.textWhite, height: 1.2)),
          const SizedBox(height: 6),
          Text(
            'Rescue teams will notify this person if you are admitted to a relief centre.',
            style: AppTextStyles.bodyMd
                .copyWith(color: AppColors.textSecondary, height: 1.4),
          ),
          const SizedBox(height: 24),
          _fieldLabel("Contact person's name"),
          const SizedBox(height: 6),
          _inputField(
              controller: _emergencyNameController,
              hint: 'e.g. Rahul Menon (Brother)',
              icon: Icons.person_pin_outlined,
              keyboard: TextInputType.name),
          const SizedBox(height: 14),
          _fieldLabel('Contact phone number'),
          const SizedBox(height: 6),
          _inputField(
              controller: _emergencyPhoneController,
              hint: 'Enter phone number',
              icon: Icons.phone_outlined,
              prefix: '+91 ',
              keyboard: TextInputType.phone),
          const SizedBox(height: 20),

          // Consent checkbox
          GestureDetector(
            onTap: () =>
                setState(() => _consentChecked = !_consentChecked),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: _consentChecked
                    ? AppColors.primaryContainer.withValues(alpha: 0.1)
                    : AppColors.surfaceContainerLow,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _consentChecked
                      ? AppColors.primaryContainer.withValues(alpha: 0.5)
                      : AppColors.strokeBorder,
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: 22,
                    height: 22,
                    decoration: BoxDecoration(
                      color: _consentChecked
                          ? AppColors.primaryContainer
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: _consentChecked
                            ? AppColors.primaryContainer
                            : AppColors.outline,
                        width: 1.5,
                      ),
                    ),
                    child: _consentChecked
                        ? const Icon(Icons.check,
                            color: Colors.white, size: 15)
                        : null,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      "I agree to ResQCore's Terms of Service and Privacy Policy. My data will only be shared with authorized response teams during active emergencies.",
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          if (_step3Error != null) ...[
            const SizedBox(height: 10),
            _errorBanner(_step3Error!),
          ],
          const SizedBox(height: 28),

          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              onPressed: _isSubmitting ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryContainer,
                foregroundColor: Colors.white,
                elevation: 4,
                shadowColor:
                    AppColors.primaryContainer.withValues(alpha: 0.5),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: _isSubmitting
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        valueColor:
                            AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.shield_outlined,
                            size: 18, color: Colors.white),
                        const SizedBox(width: 8),
                        Text(
                          'Create my account',
                          style: AppTextStyles.labelLg.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: Text(
              'Your data is encrypted and stored securely.\nNever shared without your consent.',
              style: AppTextStyles.bodySm.copyWith(
                  color: AppColors.textTertiary, fontSize: 11),
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  // ── Shared helper widgets ──────────────────────────────────────────────
  Widget _stepIcon(IconData icon, Color iconColor, Color bgColor) =>
      Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: bgColor.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: bgColor.withValues(alpha: 0.4)),
        ),
        child: Icon(icon, color: iconColor, size: 28),
      );

  Widget _fieldLabel(String label) => Text(
        label,
        style: AppTextStyles.labelMd.copyWith(
          color: AppColors.textWhite,
          fontWeight: FontWeight.w600,
        ),
      );

  Widget _authToggle() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: AppColors.strokeBorder.withValues(alpha: 0.6)),
      ),
      child: Row(
        children: [
          _authTab('Phone number', 'phone'),
          _authTab('Email address', 'email'),
        ],
      ),
    );
  }

  Widget _authTab(String label, String method) {
    final selected = _authMethod == method;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _authMethod = method),
        borderRadius: BorderRadius.circular(8),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.surfaceContainerHigh
                : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(
            child: Text(
              label,
              style: AppTextStyles.labelMd.copyWith(
                color: selected
                    ? AppColors.textWhite
                    : AppColors.textSecondary,
                fontWeight:
                    selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _inputField({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    String? prefix,
    TextInputType keyboard = TextInputType.text,
    int maxLines = 1,
    bool obscureText = false,
    Widget? suffix,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.strokeBorder),
      ),
      child: Row(
        crossAxisAlignment: maxLines > 1
            ? CrossAxisAlignment.start
            : CrossAxisAlignment.center,
        children: [
          Padding(
            padding:
                EdgeInsets.only(top: maxLines > 1 ? 14 : 0),
            child: Icon(icon, size: 18, color: AppColors.primary),
          ),
          if (prefix != null) ...[
            const SizedBox(width: 6),
            Text(prefix,
                style: AppTextStyles.bodyMd.copyWith(
                    color: AppColors.textWhite,
                    fontWeight: FontWeight.w600)),
          ],
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              keyboardType: keyboard,
              maxLines: maxLines,
              obscureText: obscureText,
              style: AppTextStyles.bodyMd.copyWith(
                  color: AppColors.textWhite, fontSize: 15),
              decoration: InputDecoration(
                border: InputBorder.none,
                hintText: hint,
                hintStyle: AppTextStyles.bodyMd
                    .copyWith(color: AppColors.outline),
                isDense: true,
                contentPadding: EdgeInsets.symmetric(
                    vertical: maxLines > 1 ? 12 : 14),
              ),
            ),
          ),
          if (suffix != null) suffix,
        ],
      ),
    );
  }

  Widget _primaryButton(
      {required String label, required VoidCallback onTap}) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryContainer,
          foregroundColor: Colors.white,
          elevation: 4,
          shadowColor:
              AppColors.primaryContainer.withValues(alpha: 0.5),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(label,
                style: AppTextStyles.labelLg.copyWith(
                    color: Colors.white, fontWeight: FontWeight.w700)),
            const SizedBox(width: 8),
            const Icon(Icons.arrow_forward, size: 18, color: Colors.white),
          ],
        ),
      ),
    );
  }

  Widget _errorBanner(String message) {
    return Container(
      padding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.errorContainer.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
            color: AppColors.error.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline,
              color: AppColors.error, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message,
                style: AppTextStyles.bodySm
                    .copyWith(color: AppColors.onErrorContainer)),
          ),
        ],
      ),
    );
  }
}
