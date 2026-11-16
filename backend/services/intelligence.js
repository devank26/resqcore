/**
 * Pure disaster intelligence, concentration hotspot & response telemetry aggregator.
 */

export function parseTimestampMs(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return NaN;
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  // Normalize PG utc_now_text format 'YYYY-MM-DD HH:MM:SS'
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(trimmed) && !trimmed.includes('T')) {
    return Date.parse(`${trimmed.replace(' ', 'T')}Z`);
  }
  return Date.parse(trimmed);
}

export function parseEtaMinutes(eta) {
  if (!eta) return null;
  const m = String(eta).match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const val = Number(m[1]);
  return Number.isFinite(val) && val > 0 ? val : null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function cleanZoneName(raw) {
  const s = String(raw || '').split('·')[0].trim();
  return s ? s.slice(0, 48) : 'Unmapped Area';
}

export function computeOperationalIntelligence({
  incidents = [],
  teams = [],
  shelters = [],
  resources = [],
  sectors = [],
  assignments = [],
  telemetry = [],
  osSnapshot = null,
  telemetryCount = null,
  now = Date.now()
} = {}) {
  const sectorMap = new Map();
  for (const s of sectors) {
    if (s?.id) sectorMap.set(s.id, s);
  }

  const pcbMap = new Map();
  for (const p of osSnapshot?.processes || []) {
    if (p?.pid) pcbMap.set(p.pid, p);
  }

  // Earliest assignment & latest completion per incident from DB assignments table
  const assignByInc = new Map();
  for (const a of assignments) {
    const id = a.incident_id ?? a.incidentId;
    if (!id) continue;
    const assignedMs = parseTimestampMs(a.assigned_at ?? a.assignedAt);
    const completedMs = parseTimestampMs(a.completed_at ?? a.completedAt);
    const prev = assignByInc.get(id) || { assignedMs: NaN, completedMs: NaN };
    if (Number.isFinite(assignedMs) && (!Number.isFinite(prev.assignedMs) || assignedMs < prev.assignedMs)) {
      prev.assignedMs = assignedMs;
    }
    if (Number.isFinite(completedMs) && (!Number.isFinite(prev.completedMs) || completedMs > prev.completedMs)) {
      prev.completedMs = completedMs;
    }
    assignByInc.set(id, prev);
  }

  // Latest telemetry record per team
  const latestTelemByTeam = new Map();
  for (const t of telemetry) {
    const tid = t.teamId ?? t.team_id;
    if (!tid || latestTelemByTeam.has(tid)) continue;
    latestTelemByTeam.set(tid, t);
  }

  let resolved = 0;
  let unverified = 0;
  let verified = 0;
  let responding = 0;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let affectedTotal = 0;
  let plottedCount = 0;

  const responseDurationsSec = [];
  const turnaroundDurationsSec = [];
  const etaSamplesMin = [];

  const zoneBuckets = new Map();
  const hotspotBuckets = new Map();

  for (const inc of incidents) {
    const status = String(inc.status || 'Unverified');
    const sev = String(inc.severity || 'Low');
    const aff = Math.max(0, Number(inc.affected ?? inc.affectedCount ?? 0) || 0);
    affectedTotal += aff;

    if (status === 'Resolved') resolved += 1;
    else if (status === 'Unverified') unverified += 1;
    else if (status === 'Verified') verified += 1;
    else responding += 1;

    if (sev === 'Critical') criticalCount += 1;
    else if (sev === 'High') highCount += 1;
    else if (sev === 'Medium') mediumCount += 1;
    else lowCount += 1;

    const pcb = pcbMap.get(inc.id);
    const dbAssign = assignByInc.get(inc.id);
    const createdMs = parseTimestampMs(inc.createdAt ?? inc.created_at);
    const updatedMs = parseTimestampMs(inc.updatedAt ?? inc.updated_at);

    // Real dispatch response duration (seconds)
    let respSec = null;
    if (pcb?.dispatchedAt != null && pcb?.arrivalTime != null) {
      respSec = Math.max(0, (pcb.dispatchedAt - pcb.arrivalTime) / 1000);
    } else if (Number.isFinite(dbAssign?.assignedMs) && Number.isFinite(createdMs)) {
      respSec = Math.max(0, (dbAssign.assignedMs - createdMs) / 1000);
    } else if (status !== 'Unverified' && status !== 'Verified' && Number.isFinite(createdMs) && Number.isFinite(updatedMs)) {
      respSec = Math.max(0, (updatedMs - createdMs) / 1000);
    }
    if (respSec !== null && Number.isFinite(respSec)) {
      responseDurationsSec.push(respSec);
    }

    // ETA target minutes if assigned
    const etaMin = parseEtaMinutes(inc.eta);
    if (etaMin !== null && inc.assignedTeam) {
      etaSamplesMin.push(etaMin);
    }

    // Resolution turnaround duration (seconds)
    if (status === 'Resolved') {
      let turnSec = null;
      if (pcb?.completedAt != null && pcb?.arrivalTime != null) {
        turnSec = Math.max(0, (pcb.completedAt - pcb.arrivalTime) / 1000);
      } else if (Number.isFinite(updatedMs) && Number.isFinite(createdMs)) {
        turnSec = Math.max(0, (updatedMs - createdMs) / 1000);
      }
      if (turnSec !== null && Number.isFinite(turnSec)) {
        turnaroundDurationsSec.push(turnSec);
      }
    }

    const sector = inc.sectorId ? sectorMap.get(inc.sectorId) : null;
    const zoneLabel = sector
      ? (sector.shortName || sector.name)
      : cleanZoneName(inc.shortLocation || inc.area || inc.location);

    const zb = zoneBuckets.get(zoneLabel) || {
      zone: zoneLabel,
      total: 0,
      active: 0,
      resolved: 0,
      criticalOrHigh: 0,
      responseSamplesMin: [],
      pendingWaitSamplesMin: []
    };
    zb.total += 1;
    if (status === 'Resolved') zb.resolved += 1;
    else zb.active += 1;
    if (sev === 'Critical' || sev === 'High') zb.criticalOrHigh += 1;
    if (respSec !== null) {
      zb.responseSamplesMin.push(respSec / 60);
    } else if (status !== 'Resolved' && Number.isFinite(createdMs)) {
      zb.pendingWaitSamplesMin.push(Math.max(0, (now - createdMs) / 60_000));
    }
    zoneBuckets.set(zoneLabel, zb);

    // Geo coordinates hotspot accumulation
    const lat = Number(inc.coordinates?.lat ?? inc.coordinates?.latitude ?? inc.lat);
    const lng = Number(inc.coordinates?.lng ?? inc.coordinates?.longitude ?? inc.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      plottedCount += 1;
      const hb = hotspotBuckets.get(zoneLabel) || {
        zone: zoneLabel,
        count: 0,
        activeCount: 0,
        criticalCount: 0,
        affected: 0,
        latSum: 0,
        lngSum: 0
      };
      hb.count += 1;
      if (status !== 'Resolved') hb.activeCount += 1;
      if (sev === 'Critical' || sev === 'High') hb.criticalCount += 1;
      hb.affected += aff;
      hb.latSum += lat;
      hb.lngSum += lng;
      hotspotBuckets.set(zoneLabel, hb);
    }
  }

  const totalIncidents = incidents.length;
  const activeIncidents = totalIncidents - resolved;

  const avgArr = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const avgResponseSeconds = Math.round(avgArr(responseDurationsSec));
  const avgResponseMinutes = round1(avgArr(responseDurationsSec) / 60);
  const avgTurnaroundMinutes = round1(avgArr(turnaroundDurationsSec) / 60);
  const avgEtaMinutes = round1(avgArr(etaSamplesMin));

  // Shelters & Evacuees
  let evacuatedTotal = 0;
  let shelterCapacityTotal = 0;
  for (const s of shelters) {
    evacuatedTotal += Math.max(0, Number(s.occupied || 0));
    shelterCapacityTotal += Math.max(0, Number(s.capacity || 0));
  }
  const shelterOccupancyPct = shelterCapacityTotal > 0
    ? Math.min(100, Math.round((evacuatedTotal / shelterCapacityTotal) * 100))
    : 0;

  // Teams & Deployed responders
  let deployedTeams = 0;
  let availableTeams = 0;
  let sosTeams = 0;
  let totalResponders = 0;
  let deployedResponders = 0;
  const telemetryFeed = [];

  for (const t of teams) {
    const st = String(t.status || 'Available');
    const respCount = Math.max(1, Number(t.responders || 4));
    totalResponders += respCount;
    if (st === 'Deployed' || st === 'SOS') {
      deployedTeams += 1;
      deployedResponders += respCount;
    } else if (st === 'Available' || st === 'Standby') {
      availableTeams += 1;
    }
    if (st === 'SOS') sosTeams += 1;

    const telem = latestTelemByTeam.get(t.id);
    const lat = telem?.lat ?? telem?.coordinates?.lat ?? t.coordinates?.lat ?? t.lat ?? null;
    const lng = telem?.lng ?? telem?.coordinates?.lng ?? t.coordinates?.lng ?? t.lng ?? null;
    telemetryFeed.push({
      teamId: t.id,
      name: t.name,
      specialization: t.specialization || 'SAR',
      status: st,
      battery: telem?.battery ?? t.battery ?? 100,
      signal: telem?.signal || 'Strong',
      speed: telem?.speed ?? null,
      lat,
      lng,
      task: t.task || null,
      eta: t.eta || null,
      lastUpdate: telem?.recordedAt ?? t.lastUpdate ?? t.updated_at ?? null
    });
  }

  telemetryFeed.sort((a, b) => {
    const rank = (s) => (s === 'SOS' ? 0 : s === 'Deployed' ? 1 : s === 'Available' ? 2 : 3);
    const diff = rank(a.status) - rank(b.status);
    if (diff !== 0) return diff;
    return String(a.name).localeCompare(String(b.name));
  });

  const rescueCapacityPct = teams.length > 0
    ? Math.round((deployedTeams / teams.length) * 100)
    : 0;

  // Zone response breakdown sorted by active backlog & total volume
  const rawZones = [...zoneBuckets.values()].sort(
    (a, b) => (b.active - a.active) || (b.total - a.total) || a.zone.localeCompare(b.zone)
  ).slice(0, 6);
  const maxZoneMin = Math.max(
    15,
    ...rawZones.map((z) =>
      z.responseSamplesMin.length
        ? avgArr(z.responseSamplesMin)
        : avgArr(z.pendingWaitSamplesMin)
    )
  );
  const zoneResponseTimes = rawZones.map((z) => {
    const hasResp = z.responseSamplesMin.length > 0;
    const avgMin = hasResp ? round1(avgArr(z.responseSamplesMin)) : round1(avgArr(z.pendingWaitSamplesMin));
    const pct = Math.max(8, Math.min(100, Math.round((avgMin / maxZoneMin) * 100)));
    const color =
      !hasResp && z.active > 0 ? '#F59E0B'
      : avgMin <= 5 ? '#10B981'
      : avgMin <= 15 ? '#3B82F6'
      : '#EF4444';
    return {
      zone: z.zone,
      total: z.total,
      active: z.active,
      resolved: z.resolved,
      criticalOrHigh: z.criticalOrHigh,
      avgMinutes: avgMin,
      awaitingDispatch: !hasResp && z.active > 0,
      timeLabel: hasResp
        ? `${avgMin < 1 ? `${Math.round(avgMin * 60)}s` : `${avgMin} min`} (${z.total} inc)`
        : z.active > 0
          ? `Wait ${avgMin}m (${z.active} queued)`
          : `${z.total} resolved`,
      pct,
      color
    };
  });

  // Resource inventory from PostgreSQL pool + shelters
  const resourceInventory = resources.map((r) => {
    const total = Math.max(0, Number(r.total || 0));
    const available = Math.max(0, Math.min(total, Number(r.available ?? total)));
    const inUse = Math.max(0, total - available);
    const pct = total > 0 ? Math.round((inUse / total) * 100) : 0;
    const color = pct >= 85 ? '#EF4444' : pct >= 60 ? '#F59E0B' : pct > 0 ? '#3B82F6' : '#10B981';
    return {
      id: r.id,
      name: r.name,
      total,
      available,
      inUse,
      pct,
      color,
      usedLabel: `${inUse} / ${total} in use (${available} free)`
    };
  });

  if (shelters.length > 0) {
    resourceInventory.push({
      id: 'shelter_capacity',
      name: 'Shelter Capacities',
      total: shelterCapacityTotal,
      available: Math.max(0, shelterCapacityTotal - evacuatedTotal),
      inUse: evacuatedTotal,
      pct: shelterOccupancyPct,
      color: shelterOccupancyPct >= 85 ? '#EF4444' : shelterOccupancyPct >= 60 ? '#F59E0B' : '#10B981',
      usedLabel: `${evacuatedTotal.toLocaleString()} / ${shelterCapacityTotal.toLocaleString()} occupied`
    });
  }

  // Hotspots sorted by active & severity weight
  const hotspots = [...hotspotBuckets.values()]
    .map((h) => ({
      zone: h.zone,
      count: h.count,
      activeCount: h.activeCount,
      criticalCount: h.criticalCount,
      affected: h.affected,
      lat: Number((h.latSum / h.count).toFixed(5)),
      lng: Number((h.lngSum / h.count).toFixed(5)),
      densityLevel: h.criticalCount >= 1 && h.count >= 2
        ? 'High'
        : h.criticalCount >= 1 || h.count >= 2
          ? 'Moderate'
          : 'Low'
    }))
    .sort((a, b) => (b.activeCount * 3 + b.criticalCount * 2 + b.count) - (a.activeCount * 3 + a.criticalCount * 2 + a.count));

  return {
    generatedAt: new Date(now).toISOString(),
    summary: {
      totalIncidents,
      resolvedIncidents: resolved,
      activeIncidents,
      unverifiedIncidents: unverified,
      verifiedIncidents: verified,
      respondingIncidents: responding,
      resolutionRatePct: totalIncidents > 0 ? Math.round((resolved / totalIncidents) * 100) : 0,
      citizensAffectedTotal: affectedTotal,
      avgResponseSeconds,
      avgResponseMinutes,
      avgTurnaroundMinutes,
      avgEtaMinutes,
      respondedCount: responseDurationsSec.length,
      evacuatedTotal,
      shelterCapacityTotal,
      operationalShelters: shelters.length,
      shelterOccupancyPct,
      totalTeams: teams.length,
      deployedTeams,
      availableTeams,
      sosTeams,
      totalResponders,
      deployedResponders,
      rescueCapacityPct,
      severityBreakdown: {
        Critical: criticalCount,
        High: highCount,
        Medium: mediumCount,
        Low: lowCount
      },
      plottedIncidentsCount: plottedCount,
      telemetryRecordsTotal: telemetryCount ?? telemetry.length
    },
    zoneResponseTimes,
    resourceInventory,
    hotspots,
    telemetryFeed
  };
}
