class ChatMessage {
  final String id;
  final String channel;
  final String sender;
  final String? senderId;
  final String? senderRole;
  final String initials;
  final String role;
  final String time;
  final String text;
  final String? locationTag;
  final String? attachmentUrl;
  final String? attachmentCoords;
  final String? createdAt;
  final bool isAlert;
  final bool isBot;
  final bool isMe;

  const ChatMessage({
    required this.id,
    this.channel = 'command-net',
    required this.sender,
    this.senderId,
    this.senderRole,
    required this.initials,
    required this.role,
    required this.time,
    required this.text,
    this.locationTag,
    this.attachmentUrl,
    this.attachmentCoords,
    this.createdAt,
    this.isAlert = false,
    this.isBot = false,
    this.isMe = false,
  });

  factory ChatMessage.fromJson(
    Map<String, dynamic> json, {
    String currentUserName = '',
    String currentUserRole = 'rescue',
    String currentTeamId = '',
  }) {
    final senderName = (json['sender'] ?? 'Operator').toString();
    final senderId = json['senderId']?.toString();
    final senderRole = json['senderRole']?.toString();
    final channel =
        (json['channel'] ?? json['channelId'] ?? 'command-net').toString();
    final sameRole = senderRole == null ||
        senderRole.isEmpty ||
        senderRole == currentUserRole;
    final matchesTeam =
        currentTeamId.isNotEmpty && senderId == 'usr-$currentTeamId';
    final matchesName = currentUserName.isNotEmpty &&
        (senderName == currentUserName || senderName.contains(currentUserName));
    final isCurrentSelf =
        (json['isSelf'] == true) || (sameRole && (matchesTeam || matchesName));

    final rawInitials = (json['initials'] ?? '').toString().trim();
    final fallbackInitials = senderName.trim().isNotEmpty
        ? senderName
            .trim()
            .split(RegExp(r'\s+'))
            .where((s) => s.isNotEmpty)
            .take(2)
            .map((s) => s[0].toUpperCase())
            .join()
        : 'OP';
    final rawLocTag = json['locationTag']?.toString();

    return ChatMessage(
      id: (json['id'] ?? 'msg-${DateTime.now().millisecondsSinceEpoch}')
          .toString(),
      channel: channel.isNotEmpty ? channel : 'command-net',
      sender: senderName,
      senderId: senderId,
      senderRole: senderRole,
      initials: rawInitials.isNotEmpty ? rawInitials : fallbackInitials,
      role: (json['role'] ?? 'Tactical Unit').toString(),
      time: (json['time'] ?? 'Just now').toString(),
      text: (json['text'] ?? '').toString(),
      locationTag: (rawLocTag != null && rawLocTag.isNotEmpty) ? rawLocTag : null,
      attachmentUrl: json['attachmentUrl'] as String?,
      attachmentCoords: json['attachmentCoords'] as String?,
      createdAt: (json['createdAt'] ?? json['timestamp'])?.toString(),
      isAlert: json['isAlert'] == true,
      isBot: json['isBot'] == true,
      isMe: isCurrentSelf,
    );
  }

  static List<ChatMessage> mockMessages() {
    return [
      const ChatMessage(
        id: 'MSG-01',
        sender: 'Capt. Rajesh Negi',
        initials: 'RN',
        role: 'Lead Comms',
        time: '10:14 AM',
        text: 'Priya, what is the status of the elderly gentleman from Ward 4?',
      ),
      const ChatMessage(
        id: 'MSG-02',
        sender: 'Paramedic Priya Sharma',
        initials: 'PS',
        role: 'Triage Specialist',
        time: '10:16 AM',
        text: 'Stabilized with IV fluid. Sunita is bringing the transport buggy to coordinate evacuation to Govt Higher Secondary Camp.',
        locationTag: 'Ward 4 Clinic (Sector B)',
      ),
      const ChatMessage(
        id: 'MSG-03',
        sender: 'Drone Spec Amit Joshi',
        initials: 'AJ',
        role: 'FLIR Thermal Lead',
        time: '10:19 AM',
        text: 'Thermal camera spotted 2 missing individuals near the old flour mill coordinates (30.5571, 79.5690). Tagged in tactical map.',
        attachmentUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCSBBd9bUHxizGSwEvCYnW41MH4p62S7HTfbgBJzDq65R66r7Ygd36uuWLBqpvVoqRUhPXsrzHZFxeJrDild2aDHyTuRNZLvEVqxYAjTFbmm2o9dbF2CtIxdx_NT7zHaDVLo8Dl74Qpxu1mR54EkmRugV1W5UgNo0U0nvtIAmPWriVzFiD3gpWRfw65aJuAzaRJ40KEaSiKPw5eQ909QJXTVurDNXVbzRzQ-E5XtD470_sWtbJ0buS1',
        attachmentCoords: '30.5571, 79.5690',
      ),
      const ChatMessage(
        id: 'MSG-04',
        sender: 'Dispatch Bot',
        initials: 'BOT',
        role: 'PRIORITY 1',
        time: '10:21 AM',
        text: 'SOS Request received from Sunita Devi (+91 98765-11223) — Trapped on 2nd floor, 3 people.',
        isAlert: true,
        isBot: true,
      ),
    ];
  }
}
