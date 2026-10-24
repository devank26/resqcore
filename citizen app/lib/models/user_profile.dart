class UserProfile {
  final String fullName;
  final String phoneNumber;
  final String email;
  final String bloodGroup;
  final String emergencyContactName;
  final String emergencyContactPhone;
  final String address;
  final String sector;
  final String medicalNotes;
  final bool isRegistered;
  final String? avatarUrl; // Google profile picture URL
  final String password;

  const UserProfile({
    required this.fullName,
    required this.phoneNumber,
    required this.email,
    required this.bloodGroup,
    required this.emergencyContactName,
    required this.emergencyContactPhone,
    required this.address,
    required this.sector,
    required this.medicalNotes,
    this.isRegistered = true,
    this.avatarUrl,
    this.password = '',
  });

  // ── Serialisation ───────────────────────────────────────────────────────
  Map<String, dynamic> toJson() => {
        'fullName': fullName,
        'phoneNumber': phoneNumber,
        'email': email,
        'bloodGroup': bloodGroup,
        'emergencyContactName': emergencyContactName,
        'emergencyContactPhone': emergencyContactPhone,
        'address': address,
        'sector': sector,
        'medicalNotes': medicalNotes,
        'isRegistered': isRegistered,
        'avatarUrl': avatarUrl,
        'password': password,
      };

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        fullName: json['fullName'] as String? ?? '',
        phoneNumber: json['phoneNumber'] as String? ?? '',
        email: json['email'] as String? ?? '',
        bloodGroup: json['bloodGroup'] as String? ?? '',
        emergencyContactName: json['emergencyContactName'] as String? ?? '',
        emergencyContactPhone: json['emergencyContactPhone'] as String? ?? '',
        address: json['address'] as String? ?? '',
        sector: json['sector'] as String? ?? '',
        medicalNotes: json['medicalNotes'] as String? ?? '',
        isRegistered: json['isRegistered'] as bool? ?? true,
        avatarUrl: json['avatarUrl'] as String?,
        password: json['password'] as String? ?? '',
      );

  // ── Lookup helpers ──────────────────────────────────────────────────────
  /// Returns true if this profile matches the given phone number (ignoring +91 prefix / spaces).
  bool matchesPhone(String phone) {
    final clean = phone.replaceAll(RegExp(r'[\s\-+]'), '');
    final stored = phoneNumber.replaceAll(RegExp(r'[\s\-+]'), '');
    return stored.isNotEmpty && (stored.endsWith(clean) || clean.endsWith(stored));
  }

  /// Returns true if this profile matches the given email (case-insensitive).
  bool matchesEmail(String email) {
    return this.email.trim().toLowerCase() == email.trim().toLowerCase();
  }

  /// Verifies password (allows empty if account was created without a password e.g. Google OAuth)
  bool verifyPassword(String attempt) {
    if (password.isEmpty) return true;
    return password == attempt;
  }

  UserProfile copyWith({
    String? fullName,
    String? phoneNumber,
    String? email,
    String? bloodGroup,
    String? emergencyContactName,
    String? emergencyContactPhone,
    String? address,
    String? sector,
    String? medicalNotes,
    bool? isRegistered,
    String? avatarUrl,
    String? password,
  }) {
    return UserProfile(
      fullName: fullName ?? this.fullName,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      email: email ?? this.email,
      bloodGroup: bloodGroup ?? this.bloodGroup,
      emergencyContactName: emergencyContactName ?? this.emergencyContactName,
      emergencyContactPhone: emergencyContactPhone ?? this.emergencyContactPhone,
      address: address ?? this.address,
      sector: sector ?? this.sector,
      medicalNotes: medicalNotes ?? this.medicalNotes,
      isRegistered: isRegistered ?? this.isRegistered,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      password: password ?? this.password,
    );
  }
}
