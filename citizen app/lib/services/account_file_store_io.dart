import 'dart:io';

File _fallbackFile() =>
    File('${Directory.systemTemp.path}/resqcore_accounts.json');

Future<String?> readAccountsFile() async {
  final file = _fallbackFile();
  if (!await file.exists()) return null;
  return file.readAsString();
}

Future<void> writeAccountsFile(String content) async {
  await _fallbackFile().writeAsString(content);
}
