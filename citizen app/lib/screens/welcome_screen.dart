import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/rescue_provider.dart';
import '../models/user_profile.dart';
import '../theme/app_colors.dart';
import '../theme/app_text_styles.dart';
import '../widgets/tactical_radar_graphic.dart';
import 'verification_screen.dart';
import 'main_shell.dart';
import 'create_account_screen.dart';
import 'dialogs/call_112_dialog.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  late TextEditingController _inputController;
  late TextEditingController _passwordController;
  bool _obscurePassword = true;
  bool _isLoggingIn = false;
  String? _authError;
  bool _isGoogleLoading = false;

  // Saved account lookup state
  UserProfile? _savedAccount;
  bool _isLookingUp = false;

  @override
  void initState() {
    super.initState();
    final provider = context.read<RescueProvider>();
    _inputController = TextEditingController(
      text: provider.authMethod == 'phone'
          ? provider.phoneNumber
          : provider.email,
    );
    _passwordController = TextEditingController();
    // Try lookup on init in case input was pre-filled
    if (_inputController.text.isNotEmpty) {
      _lookupAccount(_inputController.text);
    }
  }

  @override
  void dispose() {
    _inputController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _loginWithPassword() async {
    final identifier = _inputController.text.trim();
    final password = _passwordController.text.trim();

    if (identifier.isEmpty) {
      setState(() => _authError = 'Please enter your phone number or email.');
      return;
    }
    if (password.isEmpty) {
      setState(() => _authError = 'Please enter your password.');
      return;
    }

    setState(() {
      _isLoggingIn = true;
      _authError = null;
    });

    final provider = context.read<RescueProvider>();
    final error = await provider.loginWithPassword(
      identifier: identifier,
      password: password,
    );

    if (!mounted) return;
    setState(() => _isLoggingIn = false);

    if (error != null) {
      setState(() => _authError = error);
    } else {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const MainShell()),
        (route) => false,
      );
    }
  }

  /// Debounced lookup: called when the input field changes.
  Future<void> _lookupAccount(String value) async {
    if (value.trim().length < 5) {
      if (_savedAccount != null) setState(() => _savedAccount = null);
      return;
    }
    setState(() => _isLookingUp = true);
    final provider = context.read<RescueProvider>();
    final isPhone = provider.authMethod == 'phone';
    final found = await provider.lookupAccount(
      phone: isPhone ? value : null,
      email: isPhone ? null : value,
    );
    if (!mounted) return;
    setState(() {
      _savedAccount = found;
      _isLookingUp = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RescueProvider>();
    final isPhone = provider.authMethod == 'phone';

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: Stack(
        children: [
          // Tactical Rescue Hero Background Image
          Positioned.fill(
            child: Image.asset(
              'assets/images/hero_rescue.png',
              fit: BoxFit.cover,
              alignment: Alignment.topCenter,
              errorBuilder: (_, _, _) => const SizedBox.shrink(),
            ),
          ),
          // Gradient Scrim for high contrast & anti-glare
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    AppColors.surface.withValues(alpha: 0.78),
                    AppColors.surface.withValues(alpha: 0.92),
                    AppColors.surface,
                  ],
                  stops: const [0.0, 0.38, 0.75],
                ),
              ),
            ),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
              // Top Bar: Brand & Demo Tag
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: AppColors.primaryContainer,
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.primaryContainer.withValues(alpha: 0.3),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.shield,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'ResQCore',
                        style: AppTextStyles.headlineSm.copyWith(
                          fontWeight: FontWeight.w700,
                          color: AppColors.textWhite,
                        ),
                      ),
                    ],
                  ),
                  IconButton(
                    onPressed: () => provider.toggleTheme(),
                    tooltip: provider.isDarkMode ? 'Light Mode' : 'Dark Mode',
                    icon: Icon(
                      provider.isDarkMode ? Icons.light_mode : Icons.dark_mode,
                      color: provider.isDarkMode
                          ? AppColors.tertiary
                          : AppColors.primaryContainer,
                      size: 22,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Hero Visual / Tactical Core Radar Graphic
              const Center(
                child: TacticalRadarGraphic(),
              ),
              const SizedBox(height: 8),

              // Hero Titles
              Text(
                'When it matters,\nhelp starts here.',
                style: AppTextStyles.headlineXlMobile.copyWith(
                  color: AppColors.textWhite,
                  height: 1.25,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Report an emergency, follow your request and stay informed about risks near you.',
                style: AppTextStyles.bodyMd.copyWith(
                  color: AppColors.textSecondary,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 24),

              // Authentication Segmented Track
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppColors.strokeBorder.withValues(alpha: 0.6),
                    width: 0.5,
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () {
                          provider.setAuthMethod('phone');
                          _inputController.text = provider.phoneNumber;
                        },
                        borderRadius: BorderRadius.circular(8),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: isPhone
                                ? AppColors.surfaceContainerHigh
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(8),
                            boxShadow: isPhone
                                ? [
                                    const BoxShadow(
                                      color: Color(0x33000000),
                                      blurRadius: 4,
                                    ),
                                  ]
                                : null,
                          ),
                          child: Center(
                            child: Text(
                              'Phone number',
                              style: AppTextStyles.labelMd.copyWith(
                                color: isPhone
                                    ? AppColors.textWhite
                                    : AppColors.textSecondary,
                                fontWeight: isPhone
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: InkWell(
                        onTap: () {
                          provider.setAuthMethod('email');
                          _inputController.text = provider.email;
                        },
                        borderRadius: BorderRadius.circular(8),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: !isPhone
                                ? AppColors.surfaceContainerHigh
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(8),
                            boxShadow: !isPhone
                                ? [
                                    const BoxShadow(
                                      color: Color(0x33000000),
                                      blurRadius: 4,
                                    ),
                                  ]
                                : null,
                          ),
                          child: Center(
                            child: Text(
                              'Email address',
                              style: AppTextStyles.labelMd.copyWith(
                                color: !isPhone
                                    ? AppColors.textWhite
                                    : AppColors.textSecondary,
                                fontWeight: !isPhone
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Form Input Section
              Text(
                isPhone ? 'Mobile number' : 'Email address',
                style: AppTextStyles.labelMd.copyWith(
                  color: AppColors.textWhite,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 6),
              Container(
                height: 50,
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
                    if (isPhone) ...[
                      const Icon(
                        Icons.call,
                        size: 18,
                        color: AppColors.primary,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '+91',
                        style: AppTextStyles.bodyMd.copyWith(
                          color: AppColors.textWhite,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 10),
                    ] else ...[
                      const Icon(
                        Icons.email,
                        size: 18,
                        color: AppColors.primary,
                      ),
                      const SizedBox(width: 10),
                    ],
                     Expanded(
                      child: TextField(
                        controller: _inputController,
                        style: AppTextStyles.bodyMd.copyWith(
                          color: AppColors.textWhite,
                          fontSize: 15,
                        ),
                        keyboardType: isPhone
                            ? TextInputType.phone
                            : TextInputType.emailAddress,
                        decoration: InputDecoration(
                          border: InputBorder.none,
                          hintText: isPhone
                              ? 'Enter mobile number'
                              : 'your@email.com',
                          hintStyle: AppTextStyles.bodyMd.copyWith(
                            color: AppColors.outline,
                          ),
                          isDense: true,
                          contentPadding: EdgeInsets.zero,
                        ),
                        onChanged: (val) {
                          if (isPhone) {
                            provider.setPhoneNumber(val);
                          } else {
                            provider.setEmail(val);
                          }
                          // Trigger saved-account lookup
                          _lookupAccount(val);
                        },
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // Password input section
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Password',
                    style: AppTextStyles.labelMd.copyWith(
                      color: AppColors.textWhite,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  TextButton(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => const VerificationScreen(),
                        ),
                      );
                    },
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text(
                      'Forgot password?',
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Container(
                height: 50,
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
                      Icons.lock_outline,
                      size: 18,
                      color: AppColors.primary,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        style: AppTextStyles.bodyMd.copyWith(
                          color: AppColors.textWhite,
                          fontSize: 15,
                        ),
                        decoration: InputDecoration(
                          border: InputBorder.none,
                          hintText: 'Enter your password',
                          hintStyle: AppTextStyles.bodyMd.copyWith(
                            color: AppColors.outline,
                          ),
                          isDense: true,
                          contentPadding: EdgeInsets.zero,
                        ),
                        onSubmitted: (_) => _loginWithPassword(),
                      ),
                    ),
                    IconButton(
                      icon: Icon(
                        _obscurePassword ? Icons.visibility_off : Icons.visibility,
                        size: 20,
                        color: AppColors.textTertiary,
                      ),
                      onPressed: () =>
                          setState(() => _obscurePassword = !_obscurePassword),
                    ),
                  ],
                ),
              ),
              if (_authError != null) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.errorContainer.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: AppColors.error.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline,
                          size: 16, color: AppColors.error),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _authError!,
                          style: AppTextStyles.bodySm
                              .copyWith(color: AppColors.errorLight),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 16),

              // ── Saved Account Card (appears when a match is found) ───────
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 300),
                transitionBuilder: (child, animation) => FadeTransition(
                  opacity: animation,
                  child: SizeTransition(
                    sizeFactor: animation,
                    child: child,
                  ),
                ),
                child: _isLookingUp
                    ? Padding(
                        key: const ValueKey('loading'),
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                          children: [
                            const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                    AppColors.primary),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Text(
                              'Looking up account…',
                              style: AppTextStyles.bodySm.copyWith(
                                  color: AppColors.textTertiary),
                            ),
                          ],
                        ),
                      )
                    : _savedAccount != null
                        ? _buildSavedAccountCard(_savedAccount!)
                        : const SizedBox.shrink(key: ValueKey('empty')),
              ),

              const SizedBox(height: 4),

              // Primary CTA Button: Log in securely with Password
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _isLoggingIn ? null : _loginWithPassword,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryContainer,
                    foregroundColor: Colors.white,
                    elevation: 4,
                    shadowColor: AppColors.primaryContainer.withValues(alpha: 0.5),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _isLoggingIn
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
                            Text(
                              'Log in securely',
                              style: AppTextStyles.labelLg.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Icon(
                              Icons.arrow_forward,
                              size: 18,
                              color: Colors.white,
                            ),
                          ],
                        ),
                ),
              ),
              const SizedBox(height: 8),

              // OTP fallback option
              Center(
                child: TextButton.icon(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const VerificationScreen(),
                      ),
                    );
                  },
                  icon: const Icon(Icons.sms_outlined, size: 16, color: AppColors.textSecondary),
                  label: Text(
                    'Sign in with OTP code instead',
                    style: AppTextStyles.bodySm.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),

              // ── OR divider ──────────────────────────────────────────────
              Row(
                children: [
                  Expanded(
                    child: Divider(
                      color: AppColors.strokeBorder.withValues(alpha: 0.5),
                      thickness: 0.8,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      'or',
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.textTertiary,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Divider(
                      color: AppColors.strokeBorder.withValues(alpha: 0.5),
                      thickness: 0.8,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // ── Google Sign-In Button ───────────────────────────────────
              SizedBox(
                width: double.infinity,
                height: 52,
                child: OutlinedButton(
                  onPressed: _isGoogleLoading
                      ? null
                      : () async {
                          setState(() => _isGoogleLoading = true);
                          final provider = context.read<RescueProvider>();
                          final error = await provider.loginWithGoogle();
                          if (!mounted) return;
                          setState(() => _isGoogleLoading = false);
                          if (error != null) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  'Google Sign-In failed. Please try again.',
                                  style: const TextStyle(color: Colors.white),
                                ),
                                backgroundColor: AppColors.errorContainer,
                                duration: const Duration(seconds: 3),
                              ),
                            );
                          } else if (provider.isLoggedIn) {
                            Navigator.of(context).pushReplacement(
                              MaterialPageRoute(
                                builder: (_) => const MainShell(),
                              ),
                            );
                          }
                        },
                  style: OutlinedButton.styleFrom(
                    backgroundColor: const Color(0xFF1C2333),
                    foregroundColor: AppColors.textWhite,
                    side: BorderSide(
                      color: AppColors.strokeBorder.withValues(alpha: 0.8),
                      width: 1,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 0,
                  ),
                  child: _isGoogleLoading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            // Google "G" logo using coloured icon segments
                            Container(
                              width: 22,
                              height: 22,
                              decoration: const BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.white,
                              ),
                              child: Center(
                                child: Text(
                                  'G',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: const Color(0xFF4285F4),
                                    height: 1,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Text(
                              'Continue with Google',
                              style: AppTextStyles.labelLg.copyWith(
                                color: AppColors.textWhite,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                ),
              ),
              const SizedBox(height: 12),

              // Create Account Link
              Center(
                child: Wrap(
                  alignment: WrapAlignment.center,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      'New to ResQCore? ',
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    InkWell(
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const CreateAccountScreen(),
                          ),
                        );
                      },
                      child: Text(
                        'Create an account',
                        style: AppTextStyles.labelSm.copyWith(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),

              // DEMO MODE (Instant Access without login / fake data)
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      const Color(0xFF1E3A8A).withValues(alpha: 0.35),
                      const Color(0xFF0F172A),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: const Color(0xFF3B82F6).withValues(alpha: 0.6),
                    width: 1.5,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF1D4ED8).withValues(alpha: 0.25),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () {
                      provider.enterDemoMode();
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(builder: (_) => const MainShell()),
                      );
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer,
                              borderRadius: BorderRadius.circular(12),
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.primaryContainer.withValues(alpha: 0.4),
                                  blurRadius: 10,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: const Icon(
                              Icons.play_arrow_rounded,
                              color: Colors.white,
                              size: 28,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Wrap(
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  spacing: 6,
                                  children: [
                                    Text(
                                      'Explore Demo Mode',
                                      style: AppTextStyles.labelLg.copyWith(
                                        color: AppColors.textWhite,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF10B981).withValues(alpha: 0.2),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: const Text(
                                        'NO LOGIN',
                                        style: TextStyle(
                                          color: Color(0xFF34D399),
                                          fontSize: 9,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  'Explore all app screens instantly with simulated Kerala flood & rescue fleet data',
                                  style: AppTextStyles.bodySm.copyWith(
                                    color: AppColors.textSecondary,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(
                            Icons.arrow_forward_ios_rounded,
                            size: 16,
                            color: AppColors.primary,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Direct Emergency Callout Card
              InkWell(
                onTap: () => Call112Dialog.show(context),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppColors.strokeBorder,
                      width: 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: AppColors.errorContainer.withValues(alpha: 0.4),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(
                          Icons.phone_in_talk,
                          color: AppColors.error,
                          size: 18,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Immediate danger? Call 112',
                              style: AppTextStyles.labelMd.copyWith(
                                color: AppColors.textWhite,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Do not wait for an app response.',
                              style: AppTextStyles.bodySm.copyWith(
                                color: AppColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Terms & Regional Footer
              Center(
                child: Column(
                  children: [
                    Text(
                      'By continuing, you agree to our Terms & Privacy Policy.',
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.outline,
                        fontSize: 11,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Citizen app · Illustrative Kerala scenario',
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.outline,
                        fontSize: 11,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    ],
  ),
);
  }

  // ── Saved account card ──────────────────────────────────────────────────
  Widget _buildSavedAccountCard(UserProfile account) {
    final initials = account.fullName.isNotEmpty
        ? account.fullName
            .trim()
            .split(' ')
            .where((w) => w.isNotEmpty)
            .take(2)
            .map((w) => w[0].toUpperCase())
            .join()
        : '?';

    return Container(
      key: const ValueKey('savedCard'),
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppColors.primaryContainer.withValues(alpha: 0.4),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.primaryContainer.withValues(alpha: 0.08),
            blurRadius: 12,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Row(
        children: [
          // Avatar circle with initials
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                colors: [Color(0xFF2563EB), Color(0xFF1D4ED8)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Center(
              child: Text(
                initials,
                style: AppTextStyles.labelLg.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),

          // Name + details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Welcome back label
                Row(
                  children: [
                    const Icon(Icons.check_circle,
                        size: 13, color: AppColors.success),
                    const SizedBox(width: 4),
                    Text(
                      'Account found',
                      style: AppTextStyles.labelSm.copyWith(
                        color: AppColors.success,
                        fontWeight: FontWeight.w600,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  account.fullName,
                  style: AppTextStyles.labelLg.copyWith(
                    color: AppColors.textWhite,
                    fontWeight: FontWeight.w700,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    if (account.bloodGroup.isNotEmpty) ...[  
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(
                          color:
                              AppColors.errorContainer.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          account.bloodGroup.split(' ').first,
                          style: AppTextStyles.labelSm.copyWith(
                            color: AppColors.errorLight,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                    ],
                    Flexible(
                      child: Text(
                        account.phoneNumber.isNotEmpty
                            ? account.phoneNumber
                            : account.email,
                        style: AppTextStyles.bodySm.copyWith(
                          color: AppColors.textSecondary,
                          fontSize: 11,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),

          // Quick login button
          ElevatedButton(
            onPressed: () {
              final provider = context.read<RescueProvider>();
              provider.loginWithSavedAccount(account);
              Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const MainShell()),
                (route) => false,
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryContainer,
              foregroundColor: Colors.white,
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
              elevation: 0,
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.login, size: 16, color: Colors.white),
                const SizedBox(height: 2),
                Text(
                  'Log in',
                  style: AppTextStyles.labelSm.copyWith(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
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
