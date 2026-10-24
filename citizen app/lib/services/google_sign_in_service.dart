import 'package:google_sign_in/google_sign_in.dart';
import '../models/user_profile.dart';

class GoogleSignInService {
  static final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: ['email', 'profile'],
  );

  /// Triggers the Google OAuth flow.
  /// Returns a [UserProfile] on success, null if the user cancels.
  /// Throws an exception if something goes wrong.
  static Future<UserProfile?> signIn() async {
    try {
      // Sign out first to force account picker every time
      await _googleSignIn.signOut();

      final GoogleSignInAccount? account = await _googleSignIn.signIn();
      if (account == null) return null; // User cancelled

      return UserProfile(
        fullName: account.displayName ?? 'Citizen',
        email: account.email,
        phoneNumber: '',
        bloodGroup: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        address: '',
        sector: '',
        medicalNotes: '',
        isRegistered: true,
        avatarUrl: account.photoUrl,
      );
    } catch (e) {
      throw Exception('Google Sign-In failed: $e');
    }
  }

  /// Signs the user out of their Google account.
  static Future<void> signOut() async {
    await _googleSignIn.signOut();
  }
}
