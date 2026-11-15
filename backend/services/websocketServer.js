import crypto from 'crypto';

const WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class SimpleWebSocketServer {
  constructor(httpServer, options = {}) {
    this.httpServer = httpServer;
    this.path = options.path || '/ws';
    this.clients = new Set();
    this.messageHandlers = new Set();

    this.httpServer.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });

    // Keep-alive ping interval (every 25 seconds)
    this.pingInterval = setInterval(() => {
      this.pingAll();
    }, 25000);
  }

  handleUpgrade(req, socket, head) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    
    // Accept /ws or root upgrade
    if (this.path && url.pathname !== this.path && url.pathname !== '/') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const acceptKey = crypto
      .createHash('sha1')
      .update(key + WS_MAGIC_STRING)
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`
    ];

    socket.write(headers.join('\r\n') + '\r\n\r\n');

    const client = {
      id: `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      socket,
      role: 'unknown',
      meta: {},
      alive: true,
      buffer: Buffer.alloc(0)
    };

    this.clients.add(client);
    console.log(`[WebSocket] Client connected: ${client.id}`);

    // If initial payload had head data
    if (head && head.length > 0) {
      this.processData(client, head);
    }

    socket.on('data', (chunk) => {
      this.processData(client, chunk);
    });

    socket.on('close', () => {
      this.clients.delete(client);
      console.log(`[WebSocket] Client disconnected: ${client.id}`);
    });

    socket.on('error', (err) => {
      console.warn(`[WebSocket] Error for client ${client.id}:`, err.message);
      this.clients.delete(client);
      try {
        socket.destroy();
      } catch (_) {}
    });

    // Send welcome frame
    this.sendToClient(client, {
      event: 'connected',
      data: {
        clientId: client.id,
        serverTime: new Date().toISOString(),
        message: 'Connected to ResQCore Real-Time WebSocket Gateway'
      }
    });
  }

  processData(client, chunk) {
    client.buffer = Buffer.concat([client.buffer, chunk]);

    while (client.buffer.length >= 2) {
      const firstByte = client.buffer[0];
      const secondByte = client.buffer[1];

      const isFinal = (firstByte & 0x80) !== 0;
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (client.buffer.length < offset + 2) return;
        payloadLength = client.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (client.buffer.length < offset + 8) return;
        // Read low 32-bit for safety in standard JS
        payloadLength = Number(client.buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      let maskingKey = null;
      if (isMasked) {
        if (client.buffer.length < offset + 4) return;
        maskingKey = client.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (client.buffer.length < offset + payloadLength) {
        // Wait for rest of frame
        return;
      }

      const payload = client.buffer.subarray(offset, offset + payloadLength);
      client.buffer = client.buffer.subarray(offset + payloadLength);

      // Unmask if masked
      if (isMasked && maskingKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskingKey[i % 4];
        }
      }

      this.handleFrame(client, opcode, payload);
    }
  }

  handleFrame(client, opcode, payload) {
    if (opcode === 0x8) {
      // Close frame
      try {
        const closeFrame = Buffer.from([0x88, 0x00]);
        client.socket.write(closeFrame);
        client.socket.end();
      } catch (_) {}
      this.clients.delete(client);
      return;
    }

    if (opcode === 0x9) {
      // Ping -> reply Pong
      const pong = this.createFrame(0xa, payload);
      try {
        client.socket.write(pong);
      } catch (_) {}
      return;
    }

    if (opcode === 0xa) {
      // Pong
      client.alive = true;
      return;
    }

    if (opcode === 0x1) {
      // Text frame
      try {
        const text = payload.toString('utf8');
        const parsed = JSON.parse(text);

        // Internal registration
        if (parsed.type === 'register' || parsed.event === 'register') {
          const regData = parsed.data || parsed;
          client.role = regData.role || client.role;
          client.meta = { ...client.meta, ...regData };
          console.log(`[WebSocket] Client ${client.id} registered as '${client.role}' (${regData.name || 'unnamed'})`);
          this.sendToClient(client, {
            event: 'registered',
            data: { role: client.role, id: client.id }
          });
          return;
        }

        // Notify registered message handlers
        for (const handler of this.messageHandlers) {
          try {
            handler(parsed, client);
          } catch (hErr) {
            console.error('[WebSocket] Message handler error:', hErr);
          }
        }
      } catch (err) {
        console.warn(`[WebSocket] Non-JSON payload received from ${client.id}:`, payload.toString('utf8').slice(0, 50));
      }
    }
  }

  createFrame(opcode, payloadBuffer) {
    const length = payloadBuffer.length;
    let header;

    if (length <= 125) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode; // FIN + opcode
      header[1] = length;
    } else if (length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    return Buffer.concat([header, payloadBuffer]);
  }

  sendToClient(client, payload) {
    if (!client.socket || client.socket.destroyed) return;
    try {
      const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const buffer = Buffer.from(jsonStr, 'utf8');
      const frame = this.createFrame(0x1, buffer);
      client.socket.write(frame);
    } catch (err) {
      console.warn(`[WebSocket] Send error to ${client.id}:`, err.message);
    }
  }

  broadcast(event, data, filterFn = null) {
    const payload = {
      event,
      data,
      timestamp: new Date().toISOString()
    };
    const jsonStr = JSON.stringify(payload);
    const buffer = Buffer.from(jsonStr, 'utf8');
    const frame = this.createFrame(0x1, buffer);

    for (const client of this.clients) {
      if (client.socket && !client.socket.destroyed) {
        if (!filterFn || filterFn(client)) {
          try {
            client.socket.write(frame);
          } catch (_) {
            this.clients.delete(client);
          }
        }
      }
    }
  }

  pingAll() {
    const pingFrame = Buffer.from([0x89, 0x00]); // Ping opcode 0x9, length 0
    for (const client of this.clients) {
      if (!client.socket || client.socket.destroyed) {
        this.clients.delete(client);
        continue;
      }
      try {
        client.socket.write(pingFrame);
      } catch (_) {
        this.clients.delete(client);
      }
    }
  }

  onMessage(callback) {
    this.messageHandlers.add(callback);
    return () => this.messageHandlers.delete(callback);
  }

  getConnectedCount() {
    return this.clients.size;
  }
}
