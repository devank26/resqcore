import 'package:flutter/material.dart';
import 'incident.dart';
import 'team_member.dart';
import 'chat_message.dart';
import 'shelter_model.dart';

class AppState extends ChangeNotifier {
  String _userRole = 'Commander';
  String _userName = 'Devank (HQ Commander)';
  String _userPhone = '+91 98110 44201';
  bool _isAuthenticated = false;
  int _activeTabIndex = 0;
  bool _nightOpsEnabled = true;
  bool _sosActive = false;

  List<Incident> _incidents = Incident.mockIncidents();
  List<RescueTeam> _teams = RescueTeam.mockTeams();
  List<ChatMessage> _messages = ChatMessage.mockMessages();
  List<Shelter> _shelters = Shelter.mockShelters();
  List<Evacuee> _evacuees = Evacuee.mockEvacuees();

  // Getters
  String get userRole => _userRole;
  String get userName => _userName;
  String get userPhone => _userPhone;
  bool get isAuthenticated => _isAuthenticated;
  int get activeTabIndex => _activeTabIndex;
  bool get nightOpsEnabled => _nightOpsEnabled;
  bool get sosActive => _sosActive;

  List<Incident> get incidents => _incidents;
  List<RescueTeam> get teams => _teams;
  List<ChatMessage> get messages => _messages;
  List<Shelter> get shelters => _shelters;
  List<Evacuee> get evacuees => _evacuees;

  int get affectedTotal => 247;
  int get rescuedTotal => _evacuees.where((e) => e.status == 'Rescued').length * 47 + 1;
  int get missingTotal => _evacuees.where((e) => e.status == 'Missing').length * 7;

  // Actions
  void setDemoRole(String role, String phone, String name) {
    _userRole = role;
    _userPhone = phone;
    _userName = name;
    _isAuthenticated = true;
    notifyListeners();
  }

  void login(String role, String phone) {
    _userRole = role;
    _userPhone = phone;
    _userName = role == 'Civilian' ? 'Citizen Distress User' : 'Field Operative Devank';
    _isAuthenticated = true;
    notifyListeners();
  }

  void logout() {
    _isAuthenticated = false;
    notifyListeners();
  }

  void setTabIndex(int index) {
    _activeTabIndex = index;
    notifyListeners();
  }

  void toggleNightOps() {
    _nightOpsEnabled = !_nightOpsEnabled;
    notifyListeners();
  }

  void triggerSos() {
    _sosActive = true;
    _messages.insert(
      0,
      ChatMessage(
        id: 'SOS-${DateTime.now().millisecondsSinceEpoch}',
        sender: 'DISPATCH ALERT',
        initials: 'SOS',
        role: 'EMERGENCY BEACON',
        time: 'Just now',
        text: 'EMERGENCY SOS ACTIVATED by $_userName at GPS 30.3165° N, 78.0322° E (Dehradun). Team Alpha dispatched!',
        isAlert: true,
        isBot: true,
      ),
    );
    notifyListeners();
  }

  void cancelSos() {
    _sosActive = false;
    notifyListeners();
  }

  void addMessage(String text, {String? locationTag}) {
    if (text.trim().isEmpty) return;
    _messages.add(
      ChatMessage(
        id: 'MSG-${DateTime.now().millisecondsSinceEpoch}',
        sender: _userName,
        initials: _userName.isNotEmpty ? _userName[0].toUpperCase() : 'ME',
        role: _userRole,
        time: 'Just now',
        text: text,
        locationTag: locationTag,
        isMe: true,
      ),
    );
    notifyListeners();
  }

  void reportIncident({
    required String title,
    required String location,
    required String severity,
    required String description,
    String? photoAssetPath,
  }) {
    final newIncident = Incident(
      id: 'INC-${_incidents.length + 101}',
      title: title,
      location: location,
      timestamp: 'Today · Just now',
      severity: severity,
      status: 'Active',
      teamAssigned: 'En route / Assigning',
      eta: '10 min',
      affectedCount: 12,
      coordinates: '30.5562° N, 79.5670° E',
      description: description,
      substatus: 'Immediate triage in progress',
      photoAssetPath: photoAssetPath ?? 'assets/images/scenarios/earthquake_rubble_collapse.png',
    );
    _incidents.insert(0, newIncident);
    notifyListeners();
  }
}
