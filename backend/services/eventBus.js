import { EventEmitter } from 'events';

class ResQCoreEventBus extends EventEmitter {
  constructor() {
    super();
    this.sseClients = new Set();
    this.wsServer = null;
  }

  setWebSocketServer(wsServer) {
    this.wsServer = wsServer;
  }

  addSSEClient(res) {
    this.sseClients.add(res);
  }

  removeSSEClient(res) {
    this.sseClients.delete(res);
  }

  getSSEClientCount() {
    return this.sseClients.size;
  }

  /**
   * Broadcast an event to both SSE clients and WebSocket clients simultaneously.
   * @param {string} eventType - e.g. 'new_citizen_sos', 'incident_assigned', 'new_chat_message'
   * @param {object} data - payload
   */
  emitRealtime(eventType, data) {
    const payload = {
      event: eventType,
      data,
      timestamp: new Date().toISOString()
    };

    // 1. Broadcast to SSE (Command Center web apps)
    const sseFormatted = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(sseFormatted);
      } catch (_) {
        this.sseClients.delete(client);
      }
    }

    // 2. Broadcast to WebSockets (Rescue App, Mobile, Tactical units)
    if (this.wsServer) {
      this.wsServer.broadcast(eventType, data);
    }

    // 3. Emit on local Node event emitter for server-side listeners
    this.emit(eventType, data);
    this.emit('*', { event: eventType, data });

    console.log(`[EventBus] Broadcasted '${eventType}' -> SSE(${this.sseClients.size}) WS(${this.wsServer ? this.wsServer.getConnectedCount() : 0})`);
  }
}

export const eventBus = new ResQCoreEventBus();
