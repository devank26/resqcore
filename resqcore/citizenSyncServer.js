import http from 'http';

const PORT = 5000;

// In-memory sync store
let citizenRequests = [];
let sseClients = [];

// Helper to broadcast SSE event to all connected Command Center browsers
function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(payload);
    } catch (err) {
      // client disconnected
    }
  });
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. Health check
  if (url.pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'online',
        service: 'ResQCore Citizen App Bridge',
        activeRequests: citizenRequests.length,
        connectedCommandCenters: sseClients.length,
        timestamp: new Date().toISOString()
      })
    );
    return;
  }

  // 2. Server-Sent Events (SSE) Stream for Command Center Real-Time Sync
  if (url.pathname === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`);
    sseClients.push(res);

    req.on('close', () => {
      sseClients = sseClients.filter((c) => c !== res);
    });
    return;
  }

  // 3. Citizen App Submits SOS / Emergency Request
  if (url.pathname === '/api/citizen/sos' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const now = new Date();
        const requestId =
          data.id ||
          `RQ-${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

        const newRequest = {
          id: requestId,
          title: data.title || 'Emergency SOS',
          type: data.type || 'General',
          status: 'pending', // 'pending' | 'assigned' | 'inProgress' | 'resolved'
          timeLabel: `Today · ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          location: data.location || 'Dehradun, Uttarakhand',
          fullAddress: data.fullAddress || data.location || 'Dehradun, Uttarakhand',
          dispatchUpdate: 'Awaiting triage by Command Center',
          description: data.description || 'Citizen requested emergency response assistance.',
          contactNumber: data.contactNumber || '+91 98470 21836',
          citizenName: data.citizenName || 'Citizen User',
          coordinates: data.coordinates || { lat: 30.3165, lng: 78.0322 },
          severity: data.severity || 'High',
          createdAt: now.toISOString()
        };

        // Add to top of list
        citizenRequests.unshift(newRequest);

        // Real-time broadcast to Command Center
        broadcastSSE('new_citizen_sos', newRequest);

        console.log(`[Citizen Bridge] Received SOS from ${newRequest.citizenName}: ${newRequest.id}`);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, request: newRequest }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // 4. Get all Citizen Requests
  if (url.pathname === '/api/citizen/requests' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, count: citizenRequests.length, requests: citizenRequests }));
    return;
  }

  // 5. Command Center Dispatches Team to Citizen Request
  if (url.pathname === '/api/command/dispatch' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const { requestId, teamName, eta } = JSON.parse(body || '{}');
        const reqIndex = citizenRequests.findIndex((r) => r.id === requestId);

        if (reqIndex !== -1) {
          citizenRequests[reqIndex].status = 'assigned';
          citizenRequests[reqIndex].assignedTeam = teamName || 'Alpha 01';
          citizenRequests[reqIndex].dispatchUpdate = `${teamName || 'Bravo 02'} is en route · ETA ${eta || '10 min'}`;
          citizenRequests[reqIndex].eta = eta || '10 min';

          // Broadcast update to all
          broadcastSSE('dispatch_updated', citizenRequests[reqIndex]);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, request: citizenRequests[reqIndex] }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request not found' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  // 6. Citizen App Polls Request Status
  if (url.pathname.startsWith('/api/citizen/status/') && req.method === 'GET') {
    const id = url.pathname.replace('/api/citizen/status/', '');
    const found = citizenRequests.find((r) => r.id === id);
    if (found) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, request: found }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request not found' }));
    }
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ResQCore Citizen Bridge] Running on http://localhost:${PORT}`);
  console.log(`[ResQCore Citizen Bridge] SSE endpoint: http://localhost:${PORT}/api/stream`);
  console.log(`[ResQCore Citizen Bridge] Citizen SOS endpoint: http://localhost:${PORT}/api/citizen/sos`);
});
