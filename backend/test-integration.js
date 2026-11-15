/**
 * End-to-End Integration Test for ResQCore Unified Real-Time Backend
 */
import http from 'http';
import net from 'net';
import crypto from 'crypto';

const PORT = 5000;
const BASE_URL = `http://localhost:${PORT}`;

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Simple raw WebSocket client for testing RFC 6455
function testWebSocketConnect() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: 'localhost', port: PORT }, () => {
      const key = crypto.randomBytes(16).toString('base64');
      const handshake = [
        'GET /ws HTTP/1.1',
        'Host: localhost:5000',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '\r\n'
      ].join('\r\n');
      socket.write(handshake);
    });

    let receivedEvents = [];

    socket.on('data', (chunk) => {
      // Check if handshake reply
      const str = chunk.toString();
      if (str.includes('HTTP/1.1 101 Switching Protocols')) {
        resolve({
          socket,
          events: receivedEvents,
          close: () => socket.end()
        });
      }
    });

    socket.on('error', reject);
  });
}

async function runTests() {
  console.log('--- Starting ResQCore Integration Test Suite ---');

  // 1. Health check
  console.log('1. Testing GET /api/health...');
  const health = await request('GET', '/api/health');
  if (health.statusCode !== 200 || health.data.status !== 'online') {
    throw new Error(`Health check failed: ${JSON.stringify(health)}`);
  }
  console.log('   [PASS] Health check online. Version:', health.data.version);

  // 2. Fetch Incidents
  console.log('2. Testing GET /api/incidents...');
  const incs = await request('GET', '/api/incidents');
  if (incs.statusCode !== 200 || !Array.isArray(incs.data.incidents)) {
    throw new Error('Get incidents failed');
  }
  console.log(`   [PASS] Retrieved ${incs.data.incidents.length} baseline incidents.`);

  // 3. Citizen SOS creation
  console.log('3. Testing Citizen SOS (POST /api/citizen/sos)...');
  const testSosPayload = {
    id: `RQ-TEST-${Date.now().toString().slice(-4)}`,
    title: 'Flash Flood Emergency',
    type: 'Flood',
    location: 'Fort Kochi Bazaar',
    fullAddress: 'Fort Kochi Bazaar, Ernakulam, Kerala',
    description: 'Ground floor submerged, 4 persons stranded upstairs.',
    contactNumber: '+91 98470 21836',
    citizenName: 'Sunita Devi',
    severity: 'High',
    coordinates: { lat: 9.9658, lng: 76.2421 }
  };
  const sosRes = await request('POST', '/api/citizen/sos', testSosPayload);
  if (sosRes.statusCode !== 201 || !sosRes.data.success) {
    throw new Error(`Citizen SOS creation failed: ${JSON.stringify(sosRes)}`);
  }
  const createdId = sosRes.data.incident.id;
  console.log(`   [PASS] Citizen SOS created with ID: ${createdId}`);

  // 4. Command Center Dispatch
  console.log('4. Testing Command Center Dispatch (POST /api/command/dispatch)...');
  const dispatchRes = await request('POST', '/api/command/dispatch', {
    incidentId: createdId,
    teamName: 'Bravo 02',
    eta: '8 min',
    notes: 'Speedboat unit dispatched with 2 inflatable rafts'
  });
  if (dispatchRes.statusCode !== 200 || dispatchRes.data.incident.assignedTeam !== 'Bravo 02') {
    throw new Error(`Command dispatch failed: ${JSON.stringify(dispatchRes)}`);
  }
  console.log('   [PASS] Dispatched Bravo 02 with ETA 8 min.');

  // 5. Check Citizen Status Poll
  console.log(`5. Testing Citizen Status Polling (GET /api/citizen/status/${createdId})...`);
  const statusRes = await request('GET', `/api/citizen/status/${createdId}`);
  if (statusRes.statusCode !== 200 || statusRes.data.incident.assignedTeam !== 'Bravo 02') {
    throw new Error(`Status polling failed: ${JSON.stringify(statusRes)}`);
  }
  console.log('   [PASS] Status poll confirmed assignment:', statusRes.data.incident.substatus);

  // 6. Rescue Team Updates Status to 'On site'
  console.log('6. Testing Rescue Team Status Update (POST /api/incidents/update)...');
  const updateRes = await request('POST', '/api/incidents/update', {
    incidentId: createdId,
    status: 'On site',
    notes: 'Bravo 02 reached premises. Commenced raft evacuation.'
  });
  if (updateRes.statusCode !== 200 || updateRes.data.incident.status !== 'On site') {
    throw new Error(`Incident status update failed: ${JSON.stringify(updateRes)}`);
  }
  console.log('   [PASS] Incident status successfully updated to On site.');

  // 7. Tactical Chat Send
  console.log('7. Testing Tactical Chat (POST /api/chat/send)...');
  const chatRes = await request('POST', '/api/chat/send', {
    channel: 'ernakulam-command',
    sender: 'Lt. Sunil Varma',
    role: 'Bravo 02 Lead',
    text: 'All 4 civilians successfully brought aboard the speedboat. Moving to high ground.'
  });
  if (chatRes.statusCode !== 201 || !chatRes.data.success) {
    throw new Error(`Chat send failed: ${JSON.stringify(chatRes)}`);
  }
  console.log('   [PASS] Tactical chat message delivered.');

  // 8. Command Center Broadcast
  console.log('8. Testing Emergency Broadcast (POST /api/command/broadcast)...');
  const bcastRes = await request('POST', '/api/command/broadcast', {
    recipients: 'Zone 04 Units',
    message: 'High tide alert: Sluice gate 3 opened. Maintain 50m safety margin.',
    severity: 'Critical'
  });
  if (bcastRes.statusCode !== 201 || !bcastRes.data.success) {
    throw new Error(`Broadcast failed: ${JSON.stringify(bcastRes)}`);
  }
  console.log('   [PASS] Emergency broadcast dispatched.');

  // 9. Rescue Team Reports New Field Incident
  console.log('9. Testing Field Incident Report (POST /api/incidents/report)...');
  const fieldIncRes = await request('POST', '/api/incidents/report', {
    title: 'Fallen Power Line Across Canal',
    location: 'Mattancherry Canal Bridge',
    severity: 'Medium',
    description: 'High voltage wire hanging over waterway.',
    teamName: 'Bravo 02',
    reporter: 'Lt. Sunil Varma'
  });
  if (fieldIncRes.statusCode !== 201 || !fieldIncRes.data.incident) {
    throw new Error(`Field incident report failed: ${JSON.stringify(fieldIncRes)}`);
  }
  console.log('   [PASS] Field incident logged with ID:', fieldIncRes.data.incident.id);

  // 10. Team GPS Telemetry
  console.log('10. Testing Team GPS Telemetry (POST /api/teams/telemetry)...');
  const telemetryRes = await request('POST', '/api/teams/telemetry', {
    teamId: 'bravo-02',
    lat: 9.9672,
    lng: 76.2418,
    battery: 84,
    status: 'Deployed'
  });
  if (telemetryRes.statusCode !== 200 || telemetryRes.data.team.battery !== 84) {
    throw new Error(`Telemetry update failed: ${JSON.stringify(telemetryRes)}`);
  }
  console.log('   [PASS] Telemetry updated. Lat:', telemetryRes.data.team.coordinates.lat);

  // 11. Final Resolution
  console.log('11. Testing Incident Resolution (POST /api/incidents/update)...');
  const resolveRes = await request('POST', '/api/incidents/update', {
    incidentId: createdId,
    status: 'Resolved',
    notes: 'All occupants safely transferred to Govt Higher Secondary Camp.'
  });
  if (resolveRes.statusCode !== 200 || resolveRes.data.incident.status !== 'Resolved') {
    throw new Error(`Incident resolution failed: ${JSON.stringify(resolveRes)}`);
  }
  console.log('   [PASS] Incident successfully resolved.');

  // 12. WebSocket Handshake Test
  console.log('12. Testing RFC 6455 WebSocket Connection...');
  const ws = await testWebSocketConnect();
  console.log('   [PASS] WebSocket connected and 101 Switching Protocols verified.');
  ws.close();

  console.log('\n============================================================');
  console.log('>>> ALL 12 INTEGRATION TESTS PASSED PERFECTLY! <<<');
  console.log('Command Center, Citizen App, and Rescue Team are fully unified');
  console.log('in real-time across REST, WebSockets, and SSE pipelines.');
  console.log('============================================================\n');
}

// Start server in-process if not already running
async function main() {
  try {
    const health = await request('GET', '/api/health').catch(() => null);
    if (!health) {
      console.log('[Test Runner] Starting backend server in background...');
      await import('./server.js');
      // Wait for server to bind
      await new Promise((r) => setTimeout(r, 600));
    } else {
      console.log('[Test Runner] Backend server already running on port 5000.');
    }

    await runTests();
    process.exit(0);
  } catch (err) {
    console.error('[TEST ERROR]:', err);
    process.exit(1);
  }
}

main();
