export function serializeIncident(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    location: row.location,
    fullAddress: row.full_address,
    shortLocation: row.short_location || row.location,
    area: row.area || row.location,
    affected: row.affected,
    affectedCount: row.affected,
    severity: row.severity,
    status: row.status,
    responseSummary: row.response_summary,
    responseDetail: row.response_detail,
    description: row.description,
    fieldReport: row.field_report,
    contactNumber: row.contact_number,
    citizenName: row.citizen_name,
    assignedTeam: row.assigned_team,
    teamAssigned: row.assigned_team,
    teamId: row.team_id,
    eta: row.eta,
    substatus: row.substatus,
    coordinates: row.coordinates || {},
    sectorId: row.sector_id,
    isCitizenSOS: row.is_citizen_sos,
    isRescueSOS: row.is_rescue_sos,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeTeam(row) {
  return {
    id: row.id,
    name: row.name,
    specialization: row.specialization,
    type: row.specialization,
    status: row.status,
    responders: row.responders,
    task: row.task,
    battery: row.battery,
    eta: row.eta,
    coordinates: { lat: row.lat, lng: row.lng, latitude: row.lat, longitude: row.lng },
    lat: row.lat,
    lng: row.lng,
    sectorId: row.sector_id,
    lastUpdate: row.updated_at,
  };
}

export function serializeMessage(row) {
  return {
    id: row.id,
    channel: row.channel_id,
    channelId: row.channel_id,
    sender: row.sender,
    role: row.role,
    initials: row.initials,
    isSelf: row.is_self,
    text: row.text,
    locationTag: row.location_tag,
    attachmentUrl: row.attachment_url,
    isAlert: row.is_alert,
    teamId: row.team_id,
    time: new Date(row.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    timestamp: row.created_at,
  };
}

export function serializeAlert(row) {
  return {
    id: row.id,
    title: row.title,
    code: row.code,
    subtitle: row.subtitle,
    severity: row.severity,
    recipients: row.recipients,
    issuedBy: row.issued_by,
    createdAt: row.created_at,
  };
}

export function serializeTrackingUpdate(row) {
  return {
    id: row.incident_id,
    status: row.status,
    assignedTeam: row.assigned_team,
    eta: row.eta,
    responseSummary: row.response_summary,
    responseDetail: row.response_detail,
    substatus: row.response_detail,
    updatedAt: row.updated_at,
  };
}
