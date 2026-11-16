import { EventEmitter } from 'events';

export function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function phonesMatch(a, b) {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) return false;
  return da === db || (da.length >= 6 && db.length >= 6 && (da.includes(db) || db.includes(da)));
}

function sanitizeChatEventPayload(data) {
  if (!data || typeof data !== 'object') return data;
  const { _assignedTeamId, _citizenUserId, _contactNumber, ...clean } = data;
  return clean;
}

/**
 * Decides what (if anything) a given viewer may see of a realtime event.
 * viewer = { id, role, teamId, phone }. Returns the (possibly reduced) payload or null to drop the event.
 *
 *  - command : everything
 *  - rescue  : everything except citizen-only broadcasts, other teams' private chat channels (team-<id>),
 *              and incident-<id> chats not assigned to this team
 *  - citizen : only events about their OWN incidents (including incident-<id> chat),
 *              plus broadcasts addressed to citizens/all
 */
export function projectForViewer(viewer, eventType, data) {
  if (!viewer) return null;

  if (viewer.role === 'command') {
    return eventType === 'new_chat_message' ? sanitizeChatEventPayload(data) : data;
  }

  if (viewer.role === 'rescue') {
    if (eventType === 'emergency_broadcast' && data?.alert?.audience === 'citizens') return null;
    if (eventType === 'new_chat_message') {
      const channel = data?.channel || '';
      if (channel.startsWith('team-') && channel !== `team-${viewer.teamId}`) return null;
      if (channel.startsWith('incident-')) {
        if (!viewer.teamId || !data?._assignedTeamId || data._assignedTeamId !== viewer.teamId) {
          return null;
        }
      }
      return sanitizeChatEventPayload(data);
    }
    return data;
  }

  if (viewer.role === 'citizen') {
    if (eventType === 'emergency_broadcast' || eventType === 'alert_created') {
      const audience = data?.alert?.audience || 'all';
      return audience === 'all' || audience === 'citizens' ? data : null;
    }
    if (eventType === 'new_chat_message') {
      const channel = data?.channel || '';
      if (!channel.startsWith('incident-')) return null;
      const ownerMatch = Boolean(data?._citizenUserId && data._citizenUserId === viewer.id);
      const phoneMatch = Boolean(viewer.phone && data?._contactNumber && phonesMatch(data._contactNumber, viewer.phone));
      if (!ownerMatch && !phoneMatch) return null;
      return sanitizeChatEventPayload(data);
    }
    const citizenEvents = ['new_citizen_sos', 'incident_assigned', 'incident_verified', 'incident_status_changed'];
    if (!citizenEvents.includes(eventType)) return null;
    const owner = data?.citizenUserId ?? data?.incident?.citizenUserId;
    if (!owner || owner !== viewer.id) return null;
    if (eventType === 'incident_assigned') {
      const { team, ...rest } = data; // do not leak team contact/telemetry details to citizens
      return rest;
    }
    return data;
  }

  return null;
}

class ResQCoreEventBus extends EventEmitter {
  constructor() {
    super();
    this.sseClients = new Set(); // { res, viewer }
    this.wsServer = null;
    this.heartbeat = setInterval(() => this.sendHeartbeat(), 25_000);
    this.heartbeat.unref();
  }

  setWebSocketServer(wsServer) {
    this.wsServer = wsServer;
  }

  addSSEClient(res, viewer) {
    const client = { res, viewer };
    this.sseClients.add(client);
    return client;
  }

  removeSSEClient(client) {
    this.sseClients.delete(client);
  }

  getSSEClientCount() {
    return this.sseClients.size;
  }

  sendHeartbeat() {
    for (const client of this.sseClients) {
      try {
        client.res.write(': ping\n\n');
      } catch (_) {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Fan an event out to every authorised SSE and WebSocket client.
   * @param {string} eventType e.g. 'new_citizen_sos'
   * @param {object} data      JSON-serialisable payload
   */
  emitRealtime(eventType, data) {
    let sse = 0;
    let ws = 0;

    for (const client of this.sseClients) {
      const view = projectForViewer(client.viewer, eventType, data);
      if (view === null) continue;
      try {
        client.res.write(`event: ${eventType}\ndata: ${JSON.stringify(view)}\n\n`);
        sse++;
      } catch (_) {
        this.sseClients.delete(client);
      }
    }

    if (this.wsServer) {
      for (const client of this.wsServer.clients) {
        const view = projectForViewer(client.viewer, eventType, data);
        if (view === null) continue;
        this.wsServer.sendToClient(client, { type: eventType, event: eventType, data: view, timestamp: new Date().toISOString() });
        ws++;
      }
    }

    this.emit(eventType, data);
    this.emit('*', { event: eventType, data });

    if (process.env.EVENTBUS_LOG !== 'off') {
      console.log(`[EventBus] '${eventType}' -> SSE(${sse}/${this.sseClients.size}) WS(${ws}/${this.wsServer ? this.wsServer.getConnectedCount() : 0})`);
    }
  }
}

export const eventBus = new ResQCoreEventBus();
