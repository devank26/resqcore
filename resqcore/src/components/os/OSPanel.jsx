import React, { useEffect, useMemo, useState } from 'react';
import {
  Cpu,
  Lock,
  Unlock,
  Activity,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Wifi,
  Sliders,
  Terminal
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const RESOURCE_META = [
  { key: 'ambulances', label: 'Ambulances' },
  { key: 'boats', label: 'Rescue Boats' },
  { key: 'medicalKits', label: 'Medical Kits' },
  { key: 'foodPacks', label: 'Food Packets' }
];

function createDemoSnapshot(now = Date.now()) {
  return {
    live: false,
    stale: false,
    lastUpdated: new Date(now).toISOString(),
    queueCapacity: 10,
    queueCount: 3,
    overCapacity: false,
    readyQueue: ['INC-DEMO-01', 'INC-DEMO-02', 'INC-DEMO-03'],
    runningPids: ['INC-DEMO-00'],
    processes: [
      {
        pid: 'INC-DEMO-00',
        title: 'Dehradun Bridge Collapse',
        category: 'Collapse',
        severity: 'Critical',
        affected: 18,
        state: 'RUNNING',
        teamId: 'team-alpha',
        basePriority: 88,
        agingBoost: 0,
        effectiveScore: 88,
        priorityTier: 'Critical',
        waitTimeSeconds: 42,
        maximum: { ambulances: 2, boats: 0, medicalKits: 4, foodPacks: 20 },
        allocation: { ambulances: 2, boats: 0, medicalKits: 4, foodPacks: 20 },
        request: { ambulances: 2, boats: 0, medicalKits: 4, foodPacks: 20 },
        arrivalTime: now - 420_000,
        dispatchedAt: now - 378_000,
        completedAt: null
      },
      {
        pid: 'INC-DEMO-01',
        title: 'Rispana Flash Flood Rescue',
        category: 'Flood',
        severity: 'Critical',
        affected: 24,
        state: 'READY',
        teamId: null,
        basePriority: 89,
        agingBoost: 20,
        effectiveScore: 109,
        priorityTier: 'Critical',
        waitTimeSeconds: 310,
        maximum: { ambulances: 2, boats: 2, medicalKits: 4, foodPacks: 30 },
        allocation: { ambulances: 0, boats: 0, medicalKits: 0, foodPacks: 0 },
        request: { ambulances: 2, boats: 2, medicalKits: 4, foodPacks: 30 },
        arrivalTime: now - 310_000,
        dispatchedAt: null,
        completedAt: null
      },
      {
        pid: 'INC-DEMO-02',
        title: 'Clock Tower Fire Outbreak',
        category: 'Fire',
        severity: 'High',
        affected: 9,
        state: 'READY',
        teamId: null,
        basePriority: 67,
        agingBoost: 0,
        effectiveScore: 67,
        priorityTier: 'Urgent',
        waitTimeSeconds: 95,
        maximum: { ambulances: 1, boats: 0, medicalKits: 3, foodPacks: 10 },
        allocation: { ambulances: 0, boats: 0, medicalKits: 0, foodPacks: 0 },
        request: { ambulances: 1, boats: 0, medicalKits: 3, foodPacks: 10 },
        arrivalTime: now - 95_000,
        dispatchedAt: null,
        completedAt: null
      },
      {
        pid: 'INC-DEMO-03',
        title: 'Rajpur Road Medical Evac (Aged)',
        category: 'Medical',
        severity: 'Low',
        affected: 2,
        state: 'READY',
        teamId: null,
        basePriority: 24,
        agingBoost: 40,
        effectiveScore: 64,
        priorityTier: 'Urgent',
        waitTimeSeconds: 720,
        maximum: { ambulances: 1, boats: 0, medicalKits: 2, foodPacks: 5 },
        allocation: { ambulances: 0, boats: 0, medicalKits: 0, foodPacks: 0 },
        request: { ambulances: 1, boats: 0, medicalKits: 2, foodPacks: 5 },
        arrivalTime: now - 720_000,
        dispatchedAt: null,
        completedAt: null
      }
    ],
    teams: [
      { id: 'team-alpha', name: 'Alpha SAR Unit', status: 'Deployed', assignedPid: 'INC-DEMO-00', locked: true },
      { id: 'team-bravo', name: 'Bravo Water Rescue', status: 'Available', assignedPid: null, locked: false },
      { id: 'team-charlie', name: 'Charlie MedVac', status: 'Available', assignedPid: null, locked: false }
    ],
    banker: {
      total: { ambulances: 6, boats: 4, medicalKits: 18, foodPacks: 500 },
      available: { ambulances: 4, boats: 4, medicalKits: 14, foodPacks: 480 },
      resourceNames: ['ambulances', 'boats', 'medicalKits', 'foodPacks'],
      processes: [],
      safeSequence: ['INC-DEMO-00', 'INC-DEMO-01', 'INC-DEMO-02', 'INC-DEMO-03'],
      isSafe: true,
      lastRequest: {
        pid: 'INC-DEMO-00',
        request: { ambulances: 2, boats: 0, medicalKits: 4, foodPacks: 20 },
        granted: true,
        reason: 'Safe sequence exists: INC-DEMO-00 -> INC-DEMO-01 -> INC-DEMO-02 -> INC-DEMO-03',
        timestamp: new Date(now - 378_000).toISOString()
      }
    },
    metrics: {
      totalProcesses: 4,
      dispatched: 1,
      completed: 0,
      avgResponseSeconds: 42,
      avgTurnaroundSeconds: 0
    },
    events: [
      {
        id: 'demo-ev-1',
        type: 'DISPATCHED',
        message: 'INC-DEMO-00 dispatched to Alpha SAR Unit (team-alpha).',
        pid: 'INC-DEMO-00',
        timestamp: new Date(now - 378_000).toISOString()
      },
      {
        id: 'demo-ev-2',
        type: 'SOS_ARRIVED',
        message: 'INC-DEMO-01 admitted (Critical, P=89 Critical).',
        pid: 'INC-DEMO-01',
        timestamp: new Date(now - 310_000).toISOString()
      }
    ],
    message: 'Demo snapshot active.'
  };
}

function formatVector(v) {
  if (!v) return '-';
  return `Amb:${v.ambulances ?? 0} Boat:${v.boats ?? 0} Med:${v.medicalKits ?? 0} Food:${v.foodPacks ?? 0}`;
}

function tierColor(tier) {
  switch (tier) {
    case 'Critical': return { bg: 'rgba(239,68,68,0.18)', fg: '#FCA5A5', bd: '#EF444466' };
    case 'Urgent': return { bg: 'rgba(245,158,11,0.18)', fg: '#FCD34D', bd: '#F59E0B66' };
    case 'Normal': return { bg: 'rgba(56,189,248,0.18)', fg: '#7DD3FC', bd: '#38BDF866' };
    default: return { bg: 'rgba(148,163,184,0.15)', fg: '#CBD5E1', bd: '#475569' };
  }
}

function formatIsoTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const OSPanel = () => {
  const {
    osLive,
    osState,
    wsStatus,
    osLastUpdated,
    refreshOsLive,
    updateOsResourceTotals,
    isDemoMode
  } = useApp();

  const [viewMode, setViewMode] = useState(isDemoMode ? 'DEMO' : 'LIVE');
  const [poolForm, setPoolForm] = useState({ ambulances: 6, boats: 4, medicalKits: 18, foodPacks: 500 });
  const [poolError, setPoolError] = useState('');
  const [poolSuccess, setPoolSuccess] = useState('');
  const [savingPool, setSavingPool] = useState(false);

  const effectiveDemo = isDemoMode || viewMode === 'DEMO';
  const demoSnapshot = useMemo(() => createDemoSnapshot(), []);
  const rawSnapshot = effectiveDemo ? demoSnapshot : (osLive || (osState?.banker ? osState : null));

  useEffect(() => {
    if (!isDemoMode && viewMode === 'LIVE') {
      refreshOsLive();
    }
  }, [isDemoMode, viewMode, refreshOsLive]);

  useEffect(() => {
    const t = rawSnapshot?.banker?.total;
    if (t) {
      setPoolForm({
        ambulances: t.ambulances ?? 6,
        boats: t.boats ?? 4,
        medicalKits: t.medicalKits ?? 18,
        foodPacks: t.foodPacks ?? 500
      });
    }
  }, [
    rawSnapshot?.banker?.total?.ambulances,
    rawSnapshot?.banker?.total?.boats,
    rawSnapshot?.banker?.total?.medicalKits,
    rawSnapshot?.banker?.total?.foodPacks
  ]);

  const snap = rawSnapshot || {};
  const banker = snap.banker || {
    total: { ambulances: 6, boats: 4, medicalKits: 18, foodPacks: 500 },
    available: { ambulances: 6, boats: 4, medicalKits: 18, foodPacks: 500 },
    safeSequence: [],
    isSafe: true,
    lastRequest: null
  };
  const processes = Array.isArray(snap.processes) ? snap.processes : [];
  const teams = Array.isArray(snap.teams) ? snap.teams : [];
  const events = Array.isArray(snap.events) ? snap.events.slice(0, 20) : [];
  const metrics = snap.metrics || {};

  const teamNameById = useMemo(() => {
    const m = new Map();
    for (const t of teams) m.set(t.id, t.name);
    return m;
  }, [teams]);

  const readyProcs = useMemo(
    () =>
      processes
        .filter((p) => p.state === 'READY')
        .sort((a, b) => (b.effectiveScore - a.effectiveScore) || (a.arrivalTime - b.arrivalTime)),
    [processes]
  );

  const runningProcs = useMemo(
    () => processes.filter((p) => p.state === 'RUNNING'),
    [processes]
  );

  const ganttBounds = useMemo(() => {
    if (processes.length === 0) return { min: 0, max: 1, rows: [] };
    const now = Date.now();
    const min = Math.min(...processes.map((p) => p.arrivalTime || now));
    const max = Math.max(now, ...processes.map((p) => p.completedAt || p.dispatchedAt || p.arrivalTime || now), min + 1000);
    const rows = [...processes]
      .sort((a, b) => (b.arrivalTime || 0) - (a.arrivalTime || 0))
      .slice(0, 12);
    return { min, max, span: Math.max(1000, max - min), rows, now };
  }, [processes]);

  const handleApplyPool = async (e) => {
    e.preventDefault();
    setPoolError('');
    setPoolSuccess('');
    if (effectiveDemo) {
      setPoolError('Switch to LIVE mode to persist resource pool changes to PostgreSQL.');
      return;
    }
    setSavingPool(true);
    const payload = {
      ambulances: Number(poolForm.ambulances),
      boats: Number(poolForm.boats),
      medicalKits: Number(poolForm.medicalKits),
      foodPacks: Number(poolForm.foodPacks)
    };
    const res = await updateOsResourceTotals(payload);
    setSavingPool(false);
    if (!res.ok) {
      setPoolError(res.error || 'Failed to update resource pool');
    } else {
      setPoolSuccess('Resource pool updated in PostgreSQL & Banker state.');
      setTimeout(() => setPoolSuccess(''), 4000);
    }
  };

  const wsBadgeColor =
    effectiveDemo ? { bg: 'rgba(245,158,11,0.16)', fg: '#FBBF24', bd: '#F59E0B66', label: 'DEMO DATA' }
    : wsStatus === 'Live' ? { bg: 'rgba(16,185,129,0.16)', fg: '#34D399', bd: '#10B98166', label: 'WS Live' }
    : wsStatus === 'Reconnecting' ? { bg: 'rgba(245,158,11,0.16)', fg: '#FBBF24', bd: '#F59E0B66', label: 'Reconnecting' }
    : { bg: 'rgba(239,68,68,0.16)', fg: '#F87171', bd: '#EF444466', label: 'Offline' };

  const cards = [
    {
      label: 'Ready Queue',
      value: `${snap.queueCount ?? readyProcs.length} / ${snap.queueCapacity ?? 10}`,
      sub: snap.overCapacity ? 'OVER CAPACITY (No drops)' : 'Priority + Aging Queue',
      color: snap.overCapacity ? '#F59E0B' : '#38BDF8'
    },
    {
      label: 'Running',
      value: runningProcs.length,
      sub: 'Dispatched Active PCBs',
      color: '#10B981'
    },
    {
      label: 'Avg Response',
      value: `${metrics.avgResponseSeconds ?? 0}s`,
      sub: `${metrics.dispatched ?? 0} dispatched`,
      color: '#A78BFA'
    },
    {
      label: 'Avg Turnaround',
      value: `${metrics.avgTurnaroundSeconds ?? 0}s`,
      sub: `${metrics.completed ?? 0} completed`,
      color: '#60A5FA'
    }
  ];

  return (
    <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: '18px', color: '#E2E8F0' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <Cpu size={21} color="#38BDF8" />
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
            Live OS Monitor &amp; Banker&apos;s Resource Allocator
          </h2>
          {effectiveDemo && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 9px',
                borderRadius: '999px',
                backgroundColor: 'rgba(245,158,11,0.2)',
                border: '1px solid #F59E0B',
                color: '#FCD34D',
                letterSpacing: '0.5px'
              }}
            >
              DEMO DATA
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Live / Demo Toggle */}
          {!isDemoMode && (
            <div
              style={{
                display: 'inline-flex',
                backgroundColor: '#0B1220',
                border: '1px solid #1E2E4B',
                borderRadius: '8px',
                padding: '2px'
              }}
            >
              {['LIVE', 'DEMO'].map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    backgroundColor: viewMode === m ? (m === 'LIVE' ? '#2563EB' : '#D97706') : 'transparent',
                    color: viewMode === m ? '#FFFFFF' : '#94A3B8',
                    cursor: 'pointer'
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* Connection status */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '999px',
              fontSize: '11.5px',
              fontWeight: 700,
              backgroundColor: wsBadgeColor.bg,
              border: `1px solid ${wsBadgeColor.bd}`,
              color: wsBadgeColor.fg
            }}
          >
            <Wifi size={13} />
            {wsBadgeColor.label}
          </span>

          <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>
            Updated: {formatIsoTime(snap.lastUpdated || osLastUpdated)}
          </span>

          <button
            onClick={refreshOsLive}
            disabled={effectiveDemo}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              backgroundColor: '#13203A',
              border: '1px solid #1E3256',
              color: '#93C5FD',
              fontSize: '12px',
              fontWeight: 600,
              cursor: effectiveDemo ? 'not-allowed' : 'pointer',
              opacity: effectiveDemo ? 0.5 : 1
            }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {snap.stale && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: 'rgba(245,158,11,0.14)',
            border: '1px solid #F59E0B',
            color: '#FDE68A',
            fontSize: '12.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <AlertTriangle size={15} />
          Live source temporarily stale — displaying last synchronized OS snapshot while reconnecting.
        </div>
      )}

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: '#0D1527',
              border: '1px solid #16243E'
            }}
          >
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: '23px', fontWeight: 800, color: c.color, marginTop: '4px' }}>{c.value}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Row 1: READY Queue + RUNNING Processes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '16px' }}>
        {/* READY Queue Table */}
        <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
              <Clock size={15} color="#38BDF8" />
              <span>READY Queue (Sorted by Effective Score)</span>
            </div>
            <span style={{ fontSize: '11px', color: '#94A3B8' }}>Aging: +20 / 5 min</span>
          </div>
          {readyProcs.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#64748B', padding: '10px 0' }}>No processes currently waiting in READY queue.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ color: '#64748B', textAlign: 'left', borderBottom: '1px solid #16243E' }}>
                  <th style={{ padding: '6px 8px' }}>PID / Incident</th>
                  <th style={{ padding: '6px 8px' }}>Score</th>
                  <th style={{ padding: '6px 8px' }}>Aging</th>
                  <th style={{ padding: '6px 8px' }}>Tier</th>
                  <th style={{ padding: '6px 8px' }}>Wait</th>
                  <th style={{ padding: '6px 8px' }}>Request</th>
                </tr>
              </thead>
              <tbody>
                {readyProcs.map((pcb) => {
                  const tc = tierColor(pcb.priorityTier);
                  return (
                    <tr key={pcb.pid} style={{ borderBottom: '1px solid #111D35' }}>
                      <td style={{ padding: '8px' }}>
                        <div style={{ fontWeight: 700, color: '#FFFFFF' }}>{pcb.pid}</div>
                        <div style={{ fontSize: '11px', color: '#94A3B8' }}>{pcb.title} ({pcb.severity})</div>
                      </td>
                      <td style={{ padding: '8px', fontWeight: 800, color: '#38BDF8' }}>
                        {pcb.effectiveScore}
                        <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 500 }}>base {pcb.basePriority}</div>
                      </td>
                      <td style={{ padding: '8px', color: pcb.agingBoost > 0 ? '#FBBF24' : '#64748B', fontWeight: 700 }}>
                        +{pcb.agingBoost ?? 0}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700, backgroundColor: tc.bg, color: tc.fg, border: `1px solid ${tc.bd}` }}>
                          {pcb.priorityTier}
                        </span>
                      </td>
                      <td style={{ padding: '8px', color: '#CBD5E1' }}>{pcb.waitTimeSeconds ?? 0}s</td>
                      <td style={{ padding: '8px', color: '#94A3B8', fontSize: '11px' }}>{formatVector(pcb.request)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* RUNNING Processes Table */}
        <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontWeight: 700, fontSize: '14px' }}>
            <Activity size={15} color="#10B981" />
            <span>RUNNING Processes &amp; Allocated Resources</span>
          </div>
          {runningProcs.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#64748B', padding: '10px 0' }}>No active RUNNING processes.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ color: '#64748B', textAlign: 'left', borderBottom: '1px solid #16243E' }}>
                  <th style={{ padding: '6px 8px' }}>PID / Incident</th>
                  <th style={{ padding: '6px 8px' }}>Assigned Team</th>
                  <th style={{ padding: '6px 8px' }}>Score</th>
                  <th style={{ padding: '6px 8px' }}>Allocated Vector</th>
                </tr>
              </thead>
              <tbody>
                {runningProcs.map((pcb) => (
                  <tr key={pcb.pid} style={{ borderBottom: '1px solid #111D35' }}>
                    <td style={{ padding: '8px' }}>
                      <div style={{ fontWeight: 700, color: '#FFFFFF' }}>{pcb.pid}</div>
                      <div style={{ fontSize: '11px', color: '#94A3B8' }}>{pcb.title}</div>
                    </td>
                    <td style={{ padding: '8px', color: '#34D399', fontWeight: 600 }}>
                      {teamNameById.get(pcb.teamId) || pcb.teamId || 'Assigned'}
                      <div style={{ fontSize: '10px', color: '#64748B' }}>{pcb.teamId}</div>
                    </td>
                    <td style={{ padding: '8px', fontWeight: 700, color: '#60A5FA' }}>{pcb.effectiveScore}</td>
                    <td style={{ padding: '8px', color: '#CBD5E1', fontSize: '11px' }}>{formatVector(pcb.allocation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Row 2: Banker's Panel + Pool Form + Teams Mutexes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px' }}>
        {/* Banker's Algorithm Panel */}
        <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
              <ShieldCheck size={16} color="#10B981" />
              <span>Banker&apos;s Safe Allocation State</span>
            </div>
            <span
              style={{
                padding: '3px 10px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 800,
                backgroundColor: banker.isSafe ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.2)',
                border: `1px solid ${banker.isSafe ? '#10B981' : '#EF4444'}`,
                color: banker.isSafe ? '#34D399' : '#FCA5A5'
              }}
            >
              {banker.isSafe ? 'SAFE STATE' : 'UNSAFE STATE'}
            </span>
          </div>

          {/* Resource bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {RESOURCE_META.map(({ key, label }) => {
              const total = Number(banker.total?.[key] ?? 0);
              const avail = Number(banker.available?.[key] ?? 0);
              const inUse = Math.max(0, total - avail);
              const pct = total > 0 ? Math.min(100, Math.round((inUse / total) * 100)) : 0;
              return (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{label}</span>
                    <span style={{ color: '#94A3B8' }}>
                      In use: <strong style={{ color: '#FBBF24' }}>{inUse}</strong> / {total} · Available:{' '}
                      <strong style={{ color: avail === 0 ? '#F87171' : '#34D399' }}>{avail}</strong>
                    </span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#070C16', borderRadius: '999px', overflow: 'hidden', border: '1px solid #1A2742' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        backgroundColor: pct >= 90 ? '#EF4444' : pct >= 60 ? '#F59E0B' : '#38BDF8',
                        transition: 'width 250ms ease'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Safe Sequence & Last Request */}
          <div style={{ fontSize: '12px', padding: '10px 12px', borderRadius: '8px', backgroundColor: '#070C16', border: '1px solid #16243E' }}>
            <div style={{ color: '#64748B', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
              Safe Sequence
            </div>
            <div style={{ color: '#93C5FD', fontWeight: 600 }}>
              {banker.safeSequence?.length > 0 ? banker.safeSequence.join(' → ') : 'No pending resource claims'}
            </div>
          </div>

          {banker.lastRequest && (
            <div
              style={{
                fontSize: '12px',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: banker.lastRequest.granted ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${banker.lastRequest.granted ? '#10B98155' : '#EF444488'}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong style={{ color: '#FFFFFF' }}>
                  Last Request: {banker.lastRequest.pid}
                </strong>
                <span style={{ fontWeight: 800, fontSize: '11px', color: banker.lastRequest.granted ? '#34D399' : '#FCA5A5' }}>
                  {banker.lastRequest.granted ? 'GRANTED' : 'DENIED'}
                </span>
              </div>
              <div style={{ color: '#CBD5E1', fontSize: '11.5px' }}>{banker.lastRequest.reason}</div>
              <div style={{ color: '#94A3B8', fontSize: '11px', marginTop: '3px' }}>
                Vector: {formatVector(banker.lastRequest.request)} · {formatIsoTime(banker.lastRequest.timestamp)}
              </div>
            </div>
          )}

          {/* Update Resource Pool Form */}
          <form onSubmit={handleApplyPool} style={{ paddingTop: '8px', borderTop: '1px solid #16243E', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#93C5FD' }}>
              <Sliders size={14} />
              <span>Modify Resource Pool Totals (PostgreSQL)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {RESOURCE_META.map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: '#94A3B8' }}>
                  <span>{label}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={poolForm[key]}
                    onChange={(e) => setPoolForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    style={{
                      padding: '6px 8px',
                      borderRadius: '6px',
                      backgroundColor: '#070C16',
                      border: '1px solid #1E2E4B',
                      color: '#FFFFFF',
                      fontSize: '12.5px'
                    }}
                  />
                </label>
              ))}
            </div>
            {poolError && <div style={{ fontSize: '12px', color: '#FCA5A5' }}>{poolError}</div>}
            {poolSuccess && <div style={{ fontSize: '12px', color: '#34D399' }}>{poolSuccess}</div>}
            <button
              type="submit"
              disabled={savingPool}
              style={{
                alignSelf: 'flex-start',
                padding: '7px 14px',
                borderRadius: '8px',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {savingPool ? 'Applying...' : 'Update Resource Pool'}
            </button>
          </form>
        </div>

        {/* Teams Mutexes & Live Gantt Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Teams list */}
          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontWeight: 700, fontSize: '14px' }}>
              <Lock size={15} color="#F59E0B" />
              <span>Team Mutexes &amp; Status ({teams.length})</span>
            </div>
            {teams.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#64748B' }}>No rescue teams loaded yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {teams.map((t) => {
                  const locked = Boolean(t.locked || t.status === 'Deployed' || t.assignedPid);
                  return (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        backgroundColor: '#070C16',
                        border: `1px solid ${locked ? '#F59E0B44' : '#16243E'}`
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#FFFFFF' }}>{t.name}</div>
                        <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                          {t.id} · Status: {t.status}{t.assignedPid ? ` · Assigned: ${t.assignedPid}` : ''}
                        </div>
                      </div>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 9px',
                          borderRadius: '999px',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          backgroundColor: locked ? 'rgba(245,158,11,0.18)' : 'rgba(16,185,129,0.14)',
                          color: locked ? '#FBBF24' : '#34D399',
                          border: `1px solid ${locked ? '#F59E0B55' : '#10B98155'}`
                        }}
                      >
                        {locked ? <Lock size={11} /> : <Unlock size={11} />}
                        {locked ? 'LOCKED' : 'AVAILABLE'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CSS Gantt Timeline */}
          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontWeight: 700, fontSize: '14px' }}>Live Process Lifecycle Gantt (Wait vs Run)</span>
              <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#94A3B8' }}>
                <span><span style={{ display: 'inline-block', width: 9, height: 9, backgroundColor: '#F59E0B', borderRadius: 2, marginRight: 4 }} />Waiting</span>
                <span><span style={{ display: 'inline-block', width: 9, height: 9, backgroundColor: '#10B981', borderRadius: 2, marginRight: 4 }} />Running</span>
              </div>
            </div>
            {ganttBounds.rows.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#64748B' }}>No process timeline entries yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ganttBounds.rows.map((p) => {
                  const arr = p.arrivalTime || ganttBounds.min;
                  const waitEnd = p.dispatchedAt || p.completedAt || ganttBounds.now;
                  const runEnd = p.completedAt || ganttBounds.now;
                  const leftPct = Math.max(0, Math.min(98, ((arr - ganttBounds.min) / ganttBounds.span) * 100));
                  const waitPct = Math.max(1.5, ((waitEnd - arr) / ganttBounds.span) * 100);
                  const runPct = p.dispatchedAt ? Math.max(1.5, ((runEnd - p.dispatchedAt) / ganttBounds.span) * 100) : 0;
                  const tip = `${p.pid} (${p.state}) | Arrival: ${formatIsoTime(arr)} | Dispatched: ${formatIsoTime(p.dispatchedAt)} | Completed: ${formatIsoTime(p.completedAt)}`;
                  return (
                    <div key={p.pid} title={tip} style={{ display: 'grid', gridTemplateColumns: '105px 1fr', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#CBD5E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.pid}
                      </span>
                      <div style={{ position: 'relative', height: '14px', backgroundColor: '#070C16', borderRadius: '4px', overflow: 'hidden', border: '1px solid #1A263D' }}>
                        <div
                          style={{
                            position: 'absolute',
                            left: `${leftPct}%`,
                            width: `${Math.min(100 - leftPct, waitPct)}%`,
                            top: 0,
                            bottom: 0,
                            backgroundColor: '#F59E0B'
                          }}
                        />
                        {runPct > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              left: `${Math.min(98, leftPct + waitPct)}%`,
                              width: `${Math.min(100 - Math.min(98, leftPct + waitPct), runPct)}%`,
                              top: 0,
                              bottom: 0,
                              backgroundColor: '#10B981'
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Event Log (Latest 20) */}
      <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontWeight: 700, fontSize: '14px' }}>
          <Terminal size={15} color="#A78BFA" />
          <span>OS Engine Audit Event Log (Latest {events.length})</span>
        </div>
        {events.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#64748B' }}>No OS events recorded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
            {events.map((ev, idx) => {
              const isDeny = /DENIED|ERROR/i.test(ev.type || '');
              const isWarn = /INVERSION|CLAMP/i.test(ev.type || '');
              return (
                <div
                  key={ev.id || idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '88px 140px 1fr',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    backgroundColor: isDeny ? 'rgba(239,68,68,0.1)' : '#070C16',
                    border: `1px solid ${isDeny ? '#EF444444' : '#13203A'}`,
                    fontSize: '12px'
                  }}
                >
                  <span style={{ color: '#64748B', fontFamily: 'monospace', fontSize: '11px' }}>{formatIsoTime(ev.timestamp)}</span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '11px',
                      color: isDeny ? '#FCA5A5' : isWarn ? '#FBBF24' : '#38BDF8'
                    }}
                  >
                    {ev.type}
                  </span>
                  <span style={{ color: '#E2E8F0' }}>{ev.message || ev.detail}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
