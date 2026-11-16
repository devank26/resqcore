abstract class PlatformWebSocket {
  bool get isOpen;
  Stream<dynamic> get stream;
  void send(String data);
  Future<void> close();
}
