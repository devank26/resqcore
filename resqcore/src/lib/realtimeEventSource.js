import { supabase, mapAlert, mapIncident, mapMessage, mapTeam } from './supabase';

export function createRealtimeEventSource(userId) {
  const listeners = new Map();
  let channel;
  const source = {
    onopen: null,
    onerror: null,
    addEventListener(name, callback) {
      const callbacks = listeners.get(name) || new Set();
      callbacks.add(callback);
      listeners.set(name, callbacks);
    },
    close() {
      if (supabase && channel) supabase.removeChannel(channel);
    },
  };

  if (!supabase) {
    queueMicrotask(() => source.onerror?.());
    return source;
  }

  const emit = (name, payload) => {
    const event = { data: JSON.stringify(payload) };
    listeners.get(name)?.forEach((callback) => callback(event));
  };

  channel = supabase.channel(`command:all:${userId}`);

  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, (change) => {
    if (change.eventType === 'DELETE') return;
    const incident = mapIncident(change.new);
    if (change.eventType === 'INSERT') {
      if (incident.isRescueSOS) emit('new_rescue_sos', { sosIncident: incident, teamName: incident.assignedTeam });
      else if (incident.isCitizenSOS) emit('new_citizen_sos', incident);
      else emit('incident_reported', { incident });
      return;
    }

    const previous = change.old || {};
    if (incident.assignedTeam && incident.assignedTeam !== previous.assigned_team) {
      emit('incident_assigned', {
        incidentId: incident.id,
        incident,
        teamName: incident.assignedTeam,
        eta: incident.eta,
      });
    }
    if (incident.status !== previous.status || incident.response_detail !== previous.response_detail) {
      emit('incident_status_changed', {
        incidentId: incident.id,
        incident,
        status: incident.status,
        notes: incident.responseDetail,
      });
    }
  });

  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, (change) => {
    if (change.eventType === 'DELETE') return;
    const team = mapTeam(change.new);
    emit('team_telemetry_update', {
      teamId: team.id,
      team,
      lat: team.coordinates?.lat,
      lng: team.coordinates?.lng,
      battery: team.battery,
      status: team.status,
    });
  });

  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (change) => {
    const channelId = change.new.channel_id === 'command:all' ? 'ernakulam-command' : change.new.channel_id;
    const message = { ...mapMessage(change.new, userId), channel: channelId, channelId };
    emit('new_chat_message', { channel: channelId, message });
  });

  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (change) => {
    emit('emergency_broadcast', { alert: mapAlert(change.new) });
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') source.onopen?.();
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') source.onerror?.();
  });

  return source;
}
