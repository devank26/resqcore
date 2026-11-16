import { EventEmitter } from 'events';

/**
 * Decides what (if anything) a given viewer may see of a realtime event.
 * viewer = { id, role, teamId }. Returns the (possibly reduced) payload or null to drop the event.
 *
 *  - command : everything
 *  - rescue  : everything except citizen-only broadcasts and other teams' private chat channels (team-<id>)
 *  - citizen : only events about their OWN incidents, plus broadcasts addressed to citizens/all
 */
export function projectForViewer(viewer, eventType, data) {
  if (!viewer) return null;

  if (viewer.role === 'command') return data;

  if (viewer.role === 'rescue') {
    if (eventType === 'emergency_broadcast' && data?.alert?.audience === 'citizens') return null;
    if (eventType === 'new_chat_message') {
      const channel = data?.channel || '';
      if (channel.startsWith('team-') && channel !== `team-${viewer.teamId}`) return null;
    }
    return data;
  }

  if (viewer.role === 'citizen') {
    if (eventType === 'emergency_broadcast' || eventType === 'alert_created') {
      const audience = data?.alert?.audience || 'all';
      return audience === 'all' || audience === 'citizens' ? data : null;
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
