import 'platform_ws_interface.dart';
import 'platform_ws_io.dart'
    if (dart.library.js_interop) 'platform_ws_web.dart' as impl;

export 'platform_ws_interface.dart';

Future<PlatformWebSocket> connectPlatformWebSocket(
  String url, {
  Map<String, String>? headers,
  Duration timeout = const Duration(seconds: 4),
}) =>
    impl.connectPlatformWebSocket(url, headers: headers, timeout: timeout);
