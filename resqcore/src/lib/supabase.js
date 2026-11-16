import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabaseConfigured = Boolean(supabaseUrl && publishableKey);
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  : null;

export const backendBaseUrl = (import.meta.env.VITE_BACKEND_URL || 'https://resqcore-backend.vercel.app').replace(/\/$/, '');

export async function apiFetch(path, options = {}) {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

  const route = path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(`${backendBaseUrl}${route}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Backend request failed (${response.status}).`);
  return payload;
}

export function mapIncident(row) {
  const coordinates = row.coordinates || {};
  return {
    ...row,
    shortLocation: row.shortLocation || row.short_location || row.location,
    affectedCount: row.affectedCount ?? row.affected,
    responseSummary: row.responseSummary ?? row.response_summary,
    responseDetail: row.responseDetail ?? row.response_detail,
    fieldReport: row.fieldReport ?? row.field_report,
    contactNumber: row.contactNumber ?? row.contact_number,
    citizenName: row.citizenName ?? row.citizen_name,
    assignedTeam: row.assignedTeam ?? row.assigned_team,
    teamAssigned: row.teamAssigned ?? row.assigned_team,
    teamId: row.teamId ?? row.team_id,
    sectorId: row.sectorId ?? row.sector_id,
    isCitizenSOS: row.isCitizenSOS ?? row.is_citizen_sos,
    isRescueSOS: row.isRescueSOS ?? row.is_rescue_sos,
    coordinates: {
      ...coordinates,
      latitude: coordinates.latitude ?? coordinates.lat ?? 30.5593,
      longitude: coordinates.longitude ?? coordinates.lng ?? 79.5644,
      x: coordinates.x ?? 50,
      y: coordinates.y ?? 50,
    },
    createdAt: row.createdAt ?? row.created_at,
  };
}

export function mapTeam(row) {
  return {
    ...row,
    type: row.type ?? row.specialization,
    responders: row.responders ?? row.personnel ?? 0,
    sectorId: row.sectorId ?? row.sector_id,
    lastUpdate: row.lastUpdate ?? row.updated_at,
    coordinates: row.coordinates || { lat: row.lat, lng: row.lng },
  };
}

export function mapMessage(row, userId) {
  const isSelf = Boolean(row.is_self ?? row.isSelf) || Boolean(userId && row.created_by === userId);
  const sender = row.sender || '';
  return {
    ...row,
    channel: row.channel ?? row.channel_id,
    channelId: row.channelId ?? row.channel_id,
    sender: isSelf && !sender.endsWith(' · You') ? `${sender} · You` : sender,
    locationTag: row.locationTag ?? row.location_tag,
    attachmentUrl: row.attachmentUrl ?? row.attachment_url,
    isAlert: row.isAlert ?? row.is_alert,
    isSelf,
    time: row.time ?? new Date(row.created_at || Date.now()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function mapAlert(row) {
  return {
    ...row,
    issuedBy: row.issuedBy ?? row.issued_by,
    timeAgo: row.timeAgo ?? 'Just now',
    createdAt: row.createdAt ?? row.created_at,
  };
}
