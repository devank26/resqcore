import 'dart:io';
import 'platform_ws_interface.dart';

class _IoWebSocket implements PlatformWebSocket {
  final WebSocket _ws;
  _IoWebSocket(this._ws);

  @override
  bool get isOpen => _ws.readyState == WebSocket.open;

  @override
  Stream<dynamic> get stream => _ws;

  @override
  void send(String data) => _ws.add(data);

  @override
  Future<void> close() => _ws.close();
}

Future<PlatformWebSocket> connectPlatformWebSocket(
  String url, {
  Map<String, String>? headers,
  Duration timeout = const Duration(seconds: 4),
}) async {
  final ws = await WebSocket.connect(url, headers: headers).timeout(timeout);
  return _IoWebSocket(ws);
}
