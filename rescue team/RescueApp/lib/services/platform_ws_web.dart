import 'dart:async';
import 'dart:js_interop';
import 'package:web/web.dart' as web;
import 'platform_ws_interface.dart';

class _WebWebSocket implements PlatformWebSocket {
  final web.WebSocket _ws;
  final StreamController<dynamic> _controller =
      StreamController<dynamic>.broadcast();
  final List<StreamSubscription<web.Event>> _subs = [];
  bool _closed = false;

  _WebWebSocket._(this._ws) {
    _subs.add(web.EventStreamProviders.messageEvent.forTarget(_ws).listen((e) {
      final raw = e.data;
      if (raw != null && raw.isA<JSString>()) {
        _controller.add((raw as JSString).toDart);
      } else if (raw != null) {
        _controller.add(raw.dartify());
      }
    }));
    _subs.add(web.EventStreamProviders.errorEvent.forTarget(_ws).listen((_) {
      if (!_controller.isClosed) {
        _controller.addError(StateError('WebSocket error'));
      }
    }));
    _subs.add(web.EventStreamProviders.closeEvent.forTarget(_ws).listen((_) {
      _dispose();
    }));
  }

  static Future<_WebWebSocket> open(String url, Duration timeout) async {
    final ws = web.WebSocket(url);
    final completer = Completer<_WebWebSocket>();
    late StreamSubscription<web.Event> openSub;
    late StreamSubscription<web.Event> errSub;
    late StreamSubscription<web.CloseEvent> closeSub;

    void cleanup() {
      openSub.cancel();
      errSub.cancel();
      closeSub.cancel();
    }

    openSub = web.EventStreamProviders.openEvent.forTarget(ws).listen((_) {
      cleanup();
      if (!completer.isCompleted) {
        completer.complete(_WebWebSocket._(ws));
      }
    });
    errSub = web.EventStreamProviders.errorEvent.forTarget(ws).listen((_) {
      cleanup();
      if (!completer.isCompleted) {
        completer.completeError(StateError('WebSocket connection failed'));
      }
    });
    closeSub = web.EventStreamProviders.closeEvent.forTarget(ws).listen((_) {
      cleanup();
      if (!completer.isCompleted) {
        completer.completeError(StateError('WebSocket closed before opening'));
      }
    });

    return completer.future.timeout(timeout, onTimeout: () {
      cleanup();
      try {
        ws.close();
      } catch (_) {}
      throw TimeoutException('WebSocket connection timed out', timeout);
    });
  }

  @override
  bool get isOpen => !_closed && _ws.readyState == web.WebSocket.OPEN;

  @override
  Stream<dynamic> get stream => _controller.stream;

  @override
  void send(String data) {
    if (isOpen) {
      _ws.send(data.toJS);
    }
  }

  void _dispose() {
    if (_closed) return;
    _closed = true;
    for (final sub in _subs) {
      sub.cancel();
    }
    _subs.clear();
    if (!_controller.isClosed) {
      _controller.close();
    }
  }

  @override
  Future<void> close() async {
    try {
      _ws.close();
    } catch (_) {}
    _dispose();
  }
}

Future<PlatformWebSocket> connectPlatformWebSocket(
  String url, {
  Map<String, String>? headers,
  Duration timeout = const Duration(seconds: 4),
}) =>
    _WebWebSocket.open(url, timeout);
