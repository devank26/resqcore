import 'package:flutter/material.dart';
import 'emergency_type.dart';

enum RequestStatus {
  inProgress,
  pending,
  assigned,
  resolved;

  String get label {
    switch (this) {
      case RequestStatus.inProgress:
        return 'In progress';
      case RequestStatus.pending:
        return 'Pending';
      case RequestStatus.assigned:
        return 'Assigned';
      case RequestStatus.resolved:
        return 'Resolved';
    }
  }

  Color get dotColor {
    switch (this) {
      case RequestStatus.inProgress:
        return const Color(0xFF60A5FA);
      case RequestStatus.pending:
        return const Color(0xFFFBBF24);
      case RequestStatus.assigned:
        return const Color(0xFFADC6FF);
      case RequestStatus.resolved:
        return const Color(0xFF34D399);
    }
  }

  Color get textColor {
    switch (this) {
      case RequestStatus.inProgress:
        return const Color(0xFF60A5FA);
      case RequestStatus.pending:
        return const Color(0xFFFBBF24);
      case RequestStatus.assigned:
        return const Color(0xFFADC6FF);
      case RequestStatus.resolved:
        return const Color(0xFF34D399);
    }
  }

  Color get backgroundColor {
    switch (this) {
      case RequestStatus.inProgress:
        return const Color(0x332563EB);
      case RequestStatus.pending:
        return const Color(0x33F59E0B);
      case RequestStatus.assigned:
        return const Color(0x330566D9);
      case RequestStatus.resolved:
        return const Color(0x3310B981);
    }
  }
}

class RequestedResource {
  final String resourceId;
  final String name;
  final int quantity;

  const RequestedResource({
    required this.resourceId,
    required this.name,
    required this.quantity,
  });

  Map<String, dynamic> toJson() => {
        'resourceId': resourceId,
        'name': name,
        'quantity': quantity,
      };

  factory RequestedResource.fromJson(Map<String, dynamic> json) {
    final id = (json['resourceId'] ?? json['id'] ?? '').toString();
    final label = (json['name'] ?? id).toString();
    final qty = int.tryParse((json['quantity'] ?? 0).toString()) ?? 0;
    return RequestedResource(
      resourceId: id,
      name: label,
      quantity: qty,
    );
  }
}

class EmergencyRequest {
  final String id;
  final String title;
  final EmergencyType type;
  final RequestStatus status;
  final String timeLabel;
  final String location;
  final String fullAddress;
  final String dispatchUpdate;
  final IconData dispatchIcon;
  final String description;
  final String contactNumber;
  final int photoCount;
  final String? photoAssetPath;
  final List<RequestedResource> requestedResources;
  final String? assignedTeam;
  final String? assignedTeamId;
  final DateTime createdAt;
  final bool isRecent;

  bool get hasAssignedTeam {
    final t = (assignedTeam ?? '').trim();
    if (t.isNotEmpty && t.toLowerCase() != 'unassigned' && t.toLowerCase() != 'null') {
      return true;
    }
    final tid = (assignedTeamId ?? '').trim();
    return tid.isNotEmpty && tid.toLowerCase() != 'null';
  }

  const EmergencyRequest({
    required this.id,
    required this.title,
    required this.type,
    required this.status,
    required this.timeLabel,
    required this.location,
    required this.fullAddress,
    required this.dispatchUpdate,
    required this.dispatchIcon,
    required this.description,
    required this.contactNumber,
    this.photoCount = 1,
    this.photoAssetPath,
    this.requestedResources = const [],
    this.assignedTeam,
    this.assignedTeamId,
    required this.createdAt,
    this.isRecent = true,
  });

  EmergencyRequest copyWith({
    String? id,
    String? title,
    EmergencyType? type,
    RequestStatus? status,
    String? timeLabel,
    String? location,
    String? fullAddress,
    String? dispatchUpdate,
    IconData? dispatchIcon,
    String? description,
    String? contactNumber,
    int? photoCount,
    String? photoAssetPath,
    List<RequestedResource>? requestedResources,
    String? assignedTeam,
    String? assignedTeamId,
    DateTime? createdAt,
    bool? isRecent,
  }) {
    return EmergencyRequest(
      id: id ?? this.id,
      title: title ?? this.title,
      type: type ?? this.type,
      status: status ?? this.status,
      timeLabel: timeLabel ?? this.timeLabel,
      location: location ?? this.location,
      fullAddress: fullAddress ?? this.fullAddress,
      dispatchUpdate: dispatchUpdate ?? this.dispatchUpdate,
      dispatchIcon: dispatchIcon ?? this.dispatchIcon,
      description: description ?? this.description,
      contactNumber: contactNumber ?? this.contactNumber,
      photoCount: photoCount ?? this.photoCount,
      photoAssetPath: photoAssetPath ?? this.photoAssetPath,
      requestedResources: requestedResources ?? this.requestedResources,
      assignedTeam: assignedTeam ?? this.assignedTeam,
      assignedTeamId: assignedTeamId ?? this.assignedTeamId,
      createdAt: createdAt ?? this.createdAt,
      isRecent: isRecent ?? this.isRecent,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'type': type.name,
        'status': status.name,
        'timeLabel': timeLabel,
        'location': location,
        'fullAddress': fullAddress,
        'dispatchUpdate': dispatchUpdate,
        'description': description,
        'contactNumber': contactNumber,
        'photoCount': photoCount,
        'photoAssetPath': photoAssetPath,
        'requestedResources': requestedResources.map((r) => r.toJson()).toList(),
        'assignedTeam': assignedTeam,
        'assignedTeamId': assignedTeamId,
        'createdAt': createdAt.toIso8601String(),
        'isRecent': isRecent,
      };

  static IconData _iconFor(EmergencyType type, RequestStatus status) {
    if (status == RequestStatus.resolved) return Icons.check_circle;
    if (status == RequestStatus.assigned) return Icons.engineering;
    if (status == RequestStatus.pending) return Icons.hourglass_top;
    if (type == EmergencyType.flood) return Icons.directions_boat;
    if (type == EmergencyType.fire) return Icons.local_fire_department;
    if (type == EmergencyType.earthquake) return Icons.landslide;
    return Icons.emergency;
  }

  factory EmergencyRequest.fromJson(Map<String, dynamic> json) {
    final typeName = (json['type'] ?? 'other').toString();
    final type = EmergencyType.values.firstWhere(
      (e) => e.name == typeName,
      orElse: () => EmergencyType.other,
    );
    final statusName = (json['status'] ?? 'pending').toString();
    final status = RequestStatus.values.firstWhere(
      (s) => s.name == statusName,
      orElse: () => RequestStatus.pending,
    );
    final rawResources = json['requestedResources'];
    final resources = rawResources is List
        ? rawResources
            .whereType<Map>()
            .map((r) => RequestedResource.fromJson(Map<String, dynamic>.from(r)))
            .toList()
        : const <RequestedResource>[];
    final createdAt = DateTime.tryParse((json['createdAt'] ?? '').toString()) ?? DateTime.now();

    return EmergencyRequest(
      id: (json['id'] ?? 'SOS-${createdAt.millisecondsSinceEpoch}').toString(),
      title: (json['title'] ?? 'Emergency Request').toString(),
      type: type,
      status: status,
      timeLabel: (json['timeLabel'] ?? 'Saved').toString(),
      location: (json['location'] ?? '').toString(),
      fullAddress: (json['fullAddress'] ?? '').toString(),
      dispatchUpdate: (json['dispatchUpdate'] ?? '').toString(),
      dispatchIcon: _iconFor(type, status),
      description: (json['description'] ?? '').toString(),
      contactNumber: (json['contactNumber'] ?? '').toString(),
      photoCount: (json['photoCount'] as num?)?.toInt() ?? 0,
      photoAssetPath: json['photoAssetPath']?.toString(),
      requestedResources: resources,
      assignedTeam: json['assignedTeam']?.toString(),
      assignedTeamId: json['assignedTeamId']?.toString(),
      createdAt: createdAt,
      isRecent: json['isRecent'] == true,
    );
  }
}
