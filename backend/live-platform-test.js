/**
 * ResQCore Platform - Live End-to-End Multi-Client Platform Test
 * Simulates authenticated real-time interaction between:
 * 1. Command Center (SSE Stream + REST)
 * 2. Citizen App (REST SOS + Status Tracker)
 * 3. Rescue Team Tactical Unit (WebSocket + REST)
 */

import assert from 'node:assert/strict';
import {
  startTestServer,
  request,
  connectSSE,
  connectWS,
  waitFor,
  TEST_CODES
} from './test-utils.js';

async function runLiveDrill() {
  console.log('\n================================================================');
  console.log('   RESQCORE PLATFORM - LIVE REAL-TIME TRI-CLIENT DRILL');
  console.log('================================================================');

  const srv = await startTestServer();
  let cmdSse = null;
  let rescueWs = null;

  try {
    // Provision real authenticated identities for all 3 clients
    const cmdReg = await request(srv.baseUrl, 'POST', '/api/auth/register', {
      body: {
        name: 'Ananya Kumar',
        email: 'ananya@resqcore.test',
        password: 'CommandPassword!1',
        role: 'command',
        inviteCode: TEST_CODES.command
      }
    });
    assert.equal(cmdReg.status, 201, `command register failed: ${cmdReg.raw}`);
    const cmdToken = cmdReg.data.token;

    const rescueReg = await request(srv.baseUrl, 'POST', '/api/auth/register', {
      body: {
        name: 'Capt. Rajesh Negi',
        email: 'rajesh@resqcore.test',
        password: 'RescuePassword!1',
        role: 'rescue',
        inviteCode: TEST_CODES.rescue,
        teamName: 'Alpha 01',
        callsign: 'ALPHA-01',
        specialization: 'Water Rescue'
      }
    });
    assert.equal(rescueReg.status, 201, `rescue register failed: ${rescueReg.raw}`);
    const rescueToken = rescueReg.data.token;
    const teamId = rescueReg.data.teamId;
    assert.ok(teamId, 'rescue registration must return teamId');

    const citizenReg = await request(srv.baseUrl, 'POST', '/api/auth/register', {
      body: {
        name: 'Devank',
        phone: '+91 98470 21836',
        password: 'CitizenPassword!1',
        role: 'citizen'
      }
    });
    assert.equal(citizenReg.status, 201, `citizen register failed: ${citizenReg.raw}`);
    const citizenToken = citizenReg.data.token;

    // Step 1: Connect Command Center over SSE
    console.log('\n[1/7] Connecting Command Center Web Client (SSE Stream)...');
    cmdSse = await connectSSE(srv.baseUrl, cmdToken);
    assert.equal(cmdSse.status, 200);
    console.log(`      ✓ Command Center connected to ${srv.baseUrl}/api/stream`);

    // Step 2: Connect Rescue Team over WebSocket
    console.log('\n[2/7] Connecting Rescue Team Tactical Client (WebSocket)...');
    rescueWs = await connectWS(srv.baseUrl, rescueToken);
    assert.equal(rescueWs.status, 101);
    await waitFor(
      () => rescueWs.messages.some((m) => m.event === 'connected'),
      3000,
      'rescue WS connected welcome'
    );
    console.log(`      ✓ Rescue Team (${teamId}) connected to WS`);

    // Step 3: Citizen App triggers Emergency SOS
    console.log('\n[3/7] Citizen App: Triggering 1-Touch Emergency SOS...');
    const sosRes = await request(srv.baseUrl, 'POST', '/api/citizen/sos', {
      token: citizenToken,
      body: {
        title: 'CRITICAL FLASH FLOOD RESCUE',
        type: 'Flood',
        location: 'Fort Kochi Boat Jetty Perimeter',
        fullAddress: 'Plot 12, Ferry Road, Fort Kochi, Kerala',
        description: '4 civilians trapped on rooftop due to rapid canal breach. Water rising.',
        contactNumber: '+91 98470 21836',
        citizenName: 'Devank (Citizen)',
        severity: 'High',
        coordinates: { lat: 9.9658, lng: 76.2421 }
      }
    });
    assert.equal(sosRes.status, 201, `SOS failed: ${sosRes.raw}`);
    const incidentId = sosRes.data.incident.id;
    console.log(`      ✓ SOS Submitted. Incident ID: ${incidentId}`);

    await waitFor(
      () => cmdSse.events.some((e) => e.type === 'new_citizen_sos' && e.data.id === incidentId),
      3000,
      'Command Center SSE new_citizen_sos'
    );
    console.log('      ✓ Command Center SSE Received SOS: YES (INSTANT)');

    // Step 4: Command Center Dispatches Rescue Team
    console.log(`\n[4/7] Command Center: Dispatching ${teamId} to ${incidentId}...`);
    const dispatchRes = await request(srv.baseUrl, 'POST', '/api/command/dispatch', {
      token: cmdToken,
      body: {
        incidentId,
        teamId,
        eta: '5 min',
        notes: 'NDRF Speedboat Unit deployed with 2 medic specialists'
      }
    });
    assert.equal(dispatchRes.status, 200, `dispatch failed: ${dispatchRes.raw}`);
    assert.equal(dispatchRes.data.incident.assignedTeamId, teamId);
    console.log(`      ✓ Dispatch sent. Status: ${dispatchRes.data.incident.status}, Team: ${dispatchRes.data.incident.assignedTeam}`);

    await waitFor(
      () => rescueWs.messages.some((m) => m.event === 'incident_assigned' && m.data.incidentId === incidentId),
      3000,
      'Rescue Team WS incident_assigned'
    );

    const citizenCheck = await request(srv.baseUrl, 'GET', `/api/citizen/status/${incidentId}`, {
      token: citizenToken
    });
    assert.equal(citizenCheck.status, 200);
    assert.equal(citizenCheck.data.incident.assignedTeamId, teamId);
    console.log(`      ✓ Citizen App Live Tracking: "${citizenCheck.data.incident.substatus}"`);

    // Step 5: Rescue Team Sends GPS Telemetry & Updates Field Status
    console.log('\n[5/7] Rescue Team: Sending GPS Telemetry & Updating Field Status...');
    const telemRes = await request(srv.baseUrl, 'POST', '/api/teams/telemetry', {
      token: rescueToken,
      body: {
        lat: 9.9659,
        lng: 76.2423,
        battery: 94,
        status: 'Deployed'
      }
    });
    assert.equal(telemRes.status, 200, `telemetry failed: ${telemRes.raw}`);
    assert.equal(telemRes.data.team.id, teamId);

    const onSiteRes = await request(srv.baseUrl, 'POST', '/api/incidents/update', {
      token: rescueToken,
      body: {
        incidentId,
        status: 'On site',
        notes: 'Team Alpha arrived on scene. Deploying safety harnesses.'
      }
    });
    assert.equal(onSiteRes.status, 200, `on-site update failed: ${onSiteRes.raw}`);
    assert.equal(onSiteRes.data.incident.status, 'On site');
    console.log(`      ✓ Rescue Team Status Updated to: ${onSiteRes.data.incident.status}`);

    await waitFor(
      () => cmdSse.events.some((e) => e.type === 'team_telemetry_update' && e.data.teamId === teamId),
      3000,
      'Command SSE team_telemetry_update'
    );
    await waitFor(
      () => cmdSse.events.some((e) => e.type === 'incident_status_changed' && e.data.status === 'On site'),
      3000,
      'Command SSE incident_status_changed (On site)'
    );

    // Step 6: Real-Time Tactical Chat & Broadcast
    console.log('\n[6/7] Real-Time Tactical Chat Communication...');
    rescueWs.send({
      type: 'chat_message',
      data: {
        channel: 'command-net',
        text: 'Civilians secured on speedboat. Commencing evacuation to Govt Camp.'
      }
    });

    await waitFor(
      () => cmdSse.events.some((e) => e.type === 'new_chat_message' && e.data.message?.senderId === rescueReg.data.user.id),
      3000,
      'Command SSE rescue chat_message'
    );

    const cmdChatRes = await request(srv.baseUrl, 'POST', '/api/chat/send', {
      token: cmdToken,
      body: {
        channel: 'command-net',
        text: 'Copy Alpha 01. Medical tent at Govt Higher Secondary Camp alerted.'
      }
    });
    assert.equal(cmdChatRes.status, 201, `cmd chat failed: ${cmdChatRes.raw}`);

    await waitFor(
      () => rescueWs.messages.some((m) => m.event === 'new_chat_message' && m.data.message?.senderId === cmdReg.data.user.id),
      3000,
      'Rescue WS command chat_message'
    );

    console.log('      Command Center Dispatches Emergency Mass Broadcast...');
    const bcastRes = await request(srv.baseUrl, 'POST', '/api/command/broadcast', {
      token: cmdToken,
      body: {
        recipients: 'Sector 04 Residents & Units',
        message: 'High tide alert in effect until 18:00 IST. Follow NDRF boat evacuation routes.',
        severity: 'Critical'
      }
    });
    assert.equal(bcastRes.status, 201, `broadcast failed: ${bcastRes.raw}`);

    await waitFor(
      () => rescueWs.messages.some((m) => m.event === 'emergency_broadcast' && m.data.alert?.id === bcastRes.data.alert.id),
      3000,
      'Rescue WS emergency_broadcast'
    );

    // Step 7: Incident Resolution
    console.log(`\n[7/7] Rescue Team: Resolving Incident ${incidentId}...`);
    const resolveRes = await request(srv.baseUrl, 'POST', '/api/incidents/update', {
      token: rescueToken,
      body: {
        incidentId,
        status: 'Resolved',
        notes: 'All 4 civilians safely transferred to Govt Higher Secondary Camp. Zero casualties.'
      }
    });
    assert.equal(resolveRes.status, 200, `resolve failed: ${resolveRes.raw}`);
    assert.equal(resolveRes.data.incident.status, 'Resolved');
    console.log(`      ✓ Final Status: ${resolveRes.data.incident.status}`);

    const finalCitizenCheck = await request(srv.baseUrl, 'GET', `/api/citizen/status/${incidentId}`, {
      token: citizenToken
    });
    assert.equal(finalCitizenCheck.status, 200);
    assert.equal(finalCitizenCheck.data.incident.status, 'Resolved');
    console.log(`      ✓ Citizen Final Confirmation: Status = ${finalCitizenCheck.data.incident.status}`);

    console.log('\n================================================================');
    console.log('   LIVE TRI-CLIENT PLATFORM TEST COMPLETED WITH 100% SUCCESS!');
    console.log('================================================================');
    console.log(`   • Command Center SSE Events Captured: ${cmdSse.events.length}`);
    console.log(`   • Rescue Team WS Messages Processed:  ${rescueWs.messages.length}`);
    console.log('   • Citizen App Real-Time Updates:      VERIFIED');
    console.log('   • Command Center Real-Time Fanout:    VERIFIED');
    console.log('   • Rescue Team WebSocket Sync:         VERIFIED');
    console.log('================================================================\n');
  } finally {
    try { cmdSse?.close(); } catch (_) {}
    try { rescueWs?.close(); } catch (_) {}
    await srv.stop();
  }
}

runLiveDrill().catch((err) => {
  console.error('[DRILL ERROR]:', err);
  process.exit(1);
});
