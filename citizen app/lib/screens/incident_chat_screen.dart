import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/emergency_request.dart';
import '../providers/rescue_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_text_styles.dart';
import '../widgets/status_badge.dart';

class CitizenTeamChatScreen extends StatefulWidget {
  final EmergencyRequest initialRequest;

  const CitizenTeamChatScreen({
    super.key,
    required this.initialRequest,
  });

  @override
  State<CitizenTeamChatScreen> createState() => _CitizenTeamChatScreenState();
}

class _CitizenTeamChatScreenState extends State<CitizenTeamChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  Timer? _pollTimer;
  bool _sending = false;
  int _lastRenderedCount = 0;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshChat();
    });
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      _refreshChat();
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _refreshChat() async {
    if (!mounted) return;
    final err = await context.read<RescueProvider>().loadIncidentChat(widget.initialRequest.id);
    if (!mounted) return;
    if (err != _loadError) {
      setState(() => _loadError = err);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _sendText([String? preset]) async {
    final text = (preset ?? _controller.text).trim();
    if (text.isEmpty || _sending) return;
    if (preset == null) _controller.clear();
    setState(() => _sending = true);

    final res = await context.read<RescueProvider>().sendIncidentChatMessage(
          incidentId: widget.initialRequest.id,
          text: text,
        );
    if (!mounted) return;
    setState(() => _sending = false);

    if (!res.ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res.error ?? 'Failed to send message'),
          backgroundColor: AppColors.error,
        ),
      );
    } else {
      _scrollToBottom();
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RescueProvider>();
    final liveReq = provider.allRequests.firstWhere(
      (r) => r.id == widget.initialRequest.id,
      orElse: () => widget.initialRequest,
    );
    final messages = provider.chatMessagesForIncident(liveReq.id);
    if (messages.length != _lastRenderedCount) {
      _lastRenderedCount = messages.length;
      _scrollToBottom();
    }

    final teamLabel = liveReq.assignedTeam?.trim().isNotEmpty == true
        ? liveReq.assignedTeam!.trim()
        : 'Assigned Rescue Team';

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surfaceContainerLow,
        foregroundColor: AppColors.textWhite,
        elevation: 0,
        titleSpacing: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              liveReq.hasAssignedTeam ? teamLabel : 'Rescue Team Chat',
              style: AppTextStyles.labelMd.copyWith(
                color: AppColors.textWhite,
                fontWeight: FontWeight.w700,
              ),
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              'Report ${liveReq.id} · Direct Encrypted Line',
              style: AppTextStyles.bodySm.copyWith(
                color: AppColors.textSecondary,
                fontSize: 11,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh Messages',
            icon: const Icon(Icons.refresh, color: AppColors.primary, size: 20),
            onPressed: _refreshChat,
          ),
        ],
      ),
      body: Column(
        children: [
          // Report + Dispatch Summary Bar
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: const BoxDecoration(
              color: AppColors.surfaceContainer,
              border: Border(
                bottom: BorderSide(color: AppColors.strokeBorder, width: 1),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        liveReq.title,
                        style: AppTextStyles.labelMd.copyWith(
                          color: AppColors.textWhite,
                          fontWeight: FontWeight.w700,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        liveReq.dispatchUpdate,
                        style: AppTextStyles.bodySm.copyWith(
                          color: liveReq.hasAssignedTeam
                              ? AppColors.successLight
                              : AppColors.tertiary,
                          fontSize: 12,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                StatusBadge(status: liveReq.status),
              ],
            ),
          ),

          if (_loadError != null && liveReq.hasAssignedTeam)
            Container(
              margin: const EdgeInsets.fromLTRB(14, 10, 14, 0),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.errorContainer.withValues(alpha: 0.45),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.error.withValues(alpha: 0.6)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, color: AppColors.errorLight, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _loadError!,
                      style: AppTextStyles.bodySm.copyWith(color: AppColors.onErrorContainer, fontSize: 12),
                    ),
                  ),
                  TextButton(
                    onPressed: _refreshChat,
                    child: const Text('Retry', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ),

          if (!liveReq.hasAssignedTeam)
            Container(
              margin: const EdgeInsets.all(14),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.amberContainer.withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.amberWarning.withValues(alpha: 0.45),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.lock_clock_outlined,
                    color: AppColors.amberWarning,
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Waiting for Command Center to assign a rescue team to ${liveReq.id}. Chat unlocks automatically once a team is dispatched.',
                      style: AppTextStyles.bodySm.copyWith(
                        color: AppColors.textWhite,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // Message Feed
          Expanded(
            child: messages.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 28),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer.withValues(alpha: 0.16),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.forum_outlined,
                              color: AppColors.primary,
                              size: 28,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            liveReq.hasAssignedTeam
                                ? 'Direct Line Ready with $teamLabel'
                                : 'No Messages Yet',
                            style: AppTextStyles.headlineSm.copyWith(
                              color: AppColors.textWhite,
                              fontWeight: FontWeight.w700,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            liveReq.hasAssignedTeam
                                ? 'Share exact building, floor, injured persons count, or landmark updates with the rescue crew assigned to your report.'
                                : 'Messages will appear here as soon as a rescue unit is assigned.',
                            style: AppTextStyles.bodySm.copyWith(
                              color: AppColors.textSecondary,
                              height: 1.45,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
                    itemCount: messages.length,
                    itemBuilder: (context, index) {
                      return _buildMessageBubble(messages[index]);
                    },
                  ),
          ),

          // Quick Citizen Replies
          if (liveReq.hasAssignedTeam)
            SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                children: [
                  _quickChip('We are safe upstairs'),
                  _quickChip('Need medical assistance'),
                  _quickChip('Near main road / gate'),
                  _quickChip('Please confirm ETA'),
                ],
              ),
            ),

          // Composer Bar
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            decoration: const BoxDecoration(
              color: AppColors.surfaceContainerLow,
              border: Border(
                top: BorderSide(color: AppColors.strokeBorder, width: 1),
              ),
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      enabled: liveReq.hasAssignedTeam && !_sending,
                      style: AppTextStyles.bodyMd.copyWith(color: AppColors.textWhite),
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _sendText(),
                      decoration: InputDecoration(
                        hintText: liveReq.hasAssignedTeam
                            ? 'Message $teamLabel...'
                            : 'Chat locked until team assigned...',
                        hintStyle: AppTextStyles.bodySm.copyWith(
                          color: AppColors.textTertiary,
                        ),
                        filled: true,
                        fillColor: AppColors.surfaceContainer,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 11,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: AppColors.strokeBorder),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: AppColors.strokeBorder),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: AppColors.primaryBright),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    height: 44,
                    width: 44,
                    child: ElevatedButton(
                      onPressed: (liveReq.hasAssignedTeam && !_sending) ? _sendText : null,
                      style: ElevatedButton.styleFrom(
                        padding: EdgeInsets.zero,
                        backgroundColor: AppColors.primaryContainer,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: AppColors.surfaceContainerHighest,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: _sending
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.send_rounded, size: 20),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _quickChip(String text) {
    return Padding(
      padding: const EdgeInsets.only(right: 8, bottom: 6),
      child: ActionChip(
        label: Text(
          text,
          style: AppTextStyles.bodySm.copyWith(
            color: AppColors.primary,
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
        backgroundColor: AppColors.surfaceContainerHigh,
        side: BorderSide(color: AppColors.primary.withValues(alpha: 0.3)),
        onPressed: _sending ? null : () => _sendText(text),
      ),
    );
  }

  Widget _buildMessageBubble(Map<String, dynamic> msg) {
    final senderRole = (msg['senderRole'] ?? '').toString().toLowerCase();
    final isMine = senderRole == 'citizen' || msg['isSelf'] == true;
    final sender = (msg['sender'] ?? (isMine ? 'You' : 'Rescue Team')).toString();
    final role = (msg['role'] ?? (senderRole == 'command' ? 'Command Center' : 'Rescue Unit')).toString();
    final time = (msg['time'] ?? '').toString();
    final text = (msg['text'] ?? '').toString();
    final locationTag = (msg['locationTag'] ?? '').toString();

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.8,
        ),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
        decoration: BoxDecoration(
          color: isMine ? AppColors.primaryContainer : AppColors.surfaceContainerHigh,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(isMine ? 14 : 4),
            bottomRight: Radius.circular(isMine ? 4 : 14),
          ),
          border: Border.all(
            color: isMine
                ? AppColors.primaryBright.withValues(alpha: 0.6)
                : AppColors.strokeBorder,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  isMine ? 'You ($sender)' : sender,
                  style: AppTextStyles.labelSm.copyWith(
                    color: isMine ? Colors.white : AppColors.primary,
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.22),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    isMine ? 'CITIZEN' : role.toUpperCase(),
                    style: AppTextStyles.labelSm.copyWith(
                      color: isMine ? Colors.white70 : AppColors.successLight,
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (time.isNotEmpty) ...[
                  const SizedBox(width: 6),
                  Text(
                    time,
                    style: AppTextStyles.bodySm.copyWith(
                      color: isMine ? Colors.white70 : AppColors.textTertiary,
                      fontSize: 10,
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 5),
            Text(
              text,
              style: AppTextStyles.bodyMd.copyWith(
                color: Colors.white,
                height: 1.38,
              ),
            ),
            if (locationTag.isNotEmpty) ...[
              const SizedBox(height: 6),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.location_on_outlined,
                    size: 12,
                    color: isMine ? Colors.white70 : AppColors.textTertiary,
                  ),
                  const SizedBox(width: 3),
                  Flexible(
                    child: Text(
                      locationTag,
                      style: AppTextStyles.bodySm.copyWith(
                        color: isMine ? Colors.white70 : AppColors.textTertiary,
                        fontSize: 10,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
