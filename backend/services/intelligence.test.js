import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOperationalIntelligence } from './intelligence.js';

test('computeOperationalIntelligence aggregates real response telemetry, hotspots, resources, and shelters', () => {
  const now = Date.parse('2026-11-16T00:40:00Z');
  const report = computeOperationalIntelligence({
    now,
    sectors: [
      { id: 'SEC-1', name: 'Clock Tower Sector', shortName: 'Clock Tower' },
      { id: 'SEC-2', name: 'Rispana River Sector', shortName: 'Rispana' }
    ],
    incidents: [
      {
        id: 'INC-1',
        title: 'Flood at Rispana',
        severity: 'Critical',
        status: 'Resolved',
        affected: 12,
        sectorId: 'SEC-2',
        assignedTeam: 'Alpha',
        eta: '6 min',
        coordinates: { lat: 30.305, lng: 78.035 },
        createdAt: '2026-11-16T00:20:00Z',
        updatedAt: '2026-11-16T00:35:00Z'
      },
      {
        id: 'INC-2',
        title: 'Building fire near Clock Tower',
        severity: 'High',
        status: 'Responding',
        affected: 8,
        sectorId: 'SEC-1',
        assignedTeam: 'Bravo',
        eta: '10 min',
        coordinates: { lat: 30.324, lng: 78.041 },
        createdAt: '2026-11-16T00:30:00Z',
        updatedAt: '2026-11-16T00:34:00Z'
      }
    ],
    assignments: [
      { incident_id: 'INC-1', assigned_at: '2026-11-16 00:22:00', completed_at: '2026-11-16 00:35:00' },
      { incident_id: 'INC-2', assigned_at: '2026-11-16 00:33:00' }
    ],
    teams: [
      { id: 'T1', name: 'Alpha', status: 'Available', responders: 5, battery: 92 },
      { id: 'T2', name: 'Bravo', status: 'Deployed', responders: 6, battery: 81, task: 'INC-2', eta: '10 min' }
    ],
    shelters: [
      { id: 'SH-1', name: 'Parade Ground', capacity: 200, occupied: 50 },
      { id: 'SH-2', name: 'ISBT Hall', capacity: 300, occupied: 100 }
    ],
    resources: [
      { id: 'ambulance', name: 'Ambulances', total: 6, available: 4 },
      { id: 'boat', name: 'Rescue Boats', total: 4, available: 4 }
    ],
    telemetry: [
      { teamId: 'T2', battery: 80, signal: 'Strong', speed: 36, lat: 30.32, lng: 78.039, recordedAt: '2026-11-16 00:39:00' }
    ],
    telemetryCount: 14
  });

  assert.equal(report.summary.totalIncidents, 2);
  assert.equal(report.summary.resolvedIncidents, 1);
  assert.equal(report.summary.activeIncidents, 1);
  assert.equal(report.summary.resolutionRatePct, 50);
  assert.equal(report.summary.evacuatedTotal, 150);
  assert.equal(report.summary.shelterCapacityTotal, 500);
  assert.equal(report.summary.operationalShelters, 2);
  assert.equal(report.summary.deployedTeams, 1);
  assert.equal(report.summary.rescueCapacityPct, 50);
  // INC-1 dispatch = 120s (2m), INC-2 dispatch = 180s (3m) -> avg = 2.5 min
  assert.equal(report.summary.avgResponseSeconds, 150);
  assert.equal(report.summary.avgResponseMinutes, 2.5);
  assert.equal(report.summary.avgTurnaroundMinutes, 15);
  assert.equal(report.summary.avgEtaMinutes, 8);
  assert.equal(report.summary.telemetryRecordsTotal, 14);

  assert.equal(report.zoneResponseTimes.length, 2);
  assert.equal(report.hotspots.length, 2);
  assert.equal(report.resourceInventory[0].inUse, 2);
  assert.equal(report.resourceInventory[0].pct, 33);
  assert.equal(report.resourceInventory[2].id, 'shelter_capacity');
  assert.equal(report.telemetryFeed[0].teamId, 'T2');
  assert.equal(report.telemetryFeed[0].battery, 80);
});
