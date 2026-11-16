import crypto from 'crypto';

const WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class SimpleWebSocketServer {
  /**
   * options.path           upgrade path (default /ws)
   * options.authenticate   (req, url) => viewer | null   (required; null => 401)
   * options.isOriginAllowed (origin) => boolean          (browser CSWSH protection)
   * options.maxPayload     max bytes per frame (default 1 MiB)
   */
  constructor(httpServer, options = {}) {
    this.httpServer = httpServer;
    this.path = options.path || '/ws';
    this.authenticate = options.authenticate || (() => null);
    this.isOriginAllowed = options.isOriginAllowed || (() => true);
    this.maxPayload = options.maxPayload || 1024 * 1024;
    this.clients = new Set();
    this.messageHandlers = new Set();

    this.httpServer.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });

    // Keep-alive ping interval (every 25 seconds)
    this.pingInterval = setInterval(() => {
      this.pingAll();
    }, 25000);
    this.pingInterval.unref();
  }

  reject(socket, statusLine) {
    try { socket.write(`HTTP/1.1 ${statusLine}\r\nConnection: close\r\n\r\n`); } catch (_) { /* ignore */ }
    socket.destroy();
  }

  async handleUpgrade(req, socket, head) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname !== this.path) {
      return this.reject(socket, '404 Not Found');
    }

    if (req.headers.origin && !this.isOriginAllowed(req.headers.origin, req)) {
      return this.reject(socket, '403 Forbidden');
    }

    let viewer = null;
    try {
      viewer = await this.authenticate(req, url);
    } catch (_) {
      viewer = null;
    }
    if (socket.destroyed) return;
    if (!viewer) {
      return this.reject(socket, '401 Unauthorized');
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      return this.reject(socket, '400 Bad Request');
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
      viewer,                // authenticated identity: { id, role, name, teamId, exp }
      role: viewer.role,
      meta: { name: viewer.name, teamId: viewer.teamId },
      alive: true,
      buffer: Buffer.alloc(0)
    };

    this.clients.add(client);
    console.log(`[WebSocket] ${viewer.role} connected: ${client.id}`);

    // Drop the connection when the access token expires.
    if (viewer.exp) {
      const ms = Math.min(Math.max(viewer.exp * 1000 - Date.now(), 0), 2 ** 31 - 1);
      client.expiryTimer = setTimeout(() => {
        this.sendToClient(client, { event: 'token_expired', data: { message: 'Access token expired, please log in again' } });
        try { socket.end(); } catch (_) { /* ignore */ }
      }, ms);
      client.expiryTimer.unref();
    }

    // If initial payload had head data
    if (head && head.length > 0) {
      this.processData(client, head);
    }

    socket.on('data', (chunk) => {
      this.processData(client, chunk);
    });

    socket.on('close', () => {
      clearTimeout(client.expiryTimer);
      this.clients.delete(client);
      console.log(`[WebSocket] Client disconnected: ${client.id}`);
    });

    socket.on('error', (err) => {
      console.warn(`[WebSocket] Error for client ${client.id}:`, err.message);
      clearTimeout(client.expiryTimer);
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
        user: { id: viewer.id, role: viewer.role, name: viewer.name, teamId: viewer.teamId || null },
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
        payloadLength = Number(client.buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      if (payloadLength > this.maxPayload) {
        // 1009 = message too big
        try { client.socket.write(Buffer.from([0x88, 0x02, 0x03, 0xf1])); client.socket.end(); } catch (_) { /* ignore */ }
        this.clients.delete(client);
        client.buffer = Buffer.alloc(0);
        return;
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

        // Legacy 'register' handshake. Identity comes from the verified token only;
        // role / team claims sent by the client are ignored.
        if (parsed.type === 'register' || parsed.event === 'register') {
          this.sendToClient(client, {
            event: 'registered',
            data: { role: client.viewer.role, id: client.id, userId: client.viewer.id, teamId: client.viewer.teamId || null }
          });
          return;
        }

        if (parsed.type === 'ping' || parsed.event === 'ping') {
          this.sendToClient(client, { event: 'pong', data: { time: Date.now() } });
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
