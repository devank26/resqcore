import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Layers,
  Play,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Lock,
  Navigation,
  RefreshCw
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const PROCESS_COLORS = [
  '#2563EB',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
  '#14B8A6'
];

function pidColorMap(algorithms = []) {
  const map = new Map();
  let idx = 0;
  for (const algo of algorithms) {
    for (const seg of algo.segments || []) {
      if (seg.pid && !map.has(seg.pid)) {
        map.set(seg.pid, PROCESS_COLORS[idx % PROCESS_COLORS.length]);
        idx += 1;
      }
    }
  }
  return map;
}

export const SchedulerLabPage = () => {
  const { apiFetch, incidents, isDemoMode } = useApp();

  const [source, setSource] = useState(isDemoMode ? 'demo' : 'live');
  const [quantum, setQuantum] = useState(4);
  const [schedData, setSchedData] = useState(null);
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedError, setSchedError] = useState('');

  const [deadlockData, setDeadlockData] = useState(null);
  const [semCapacity, setSemCapacity] = useState(3);
  const [semItems, setSemItems] = useState(6);
  const [semData, setSemData] = useState(null);

  const [selectedIncId, setSelectedIncId] = useState('');
  const [teamSuggestions, setTeamSuggestions] = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const loadSchedulers = useCallback(async (src = source, q = quantum) => {
    setSchedLoading(true);
    setSchedError('');
    try {
      const safeQ = Math.max(1, Math.min(50, Math.floor(Number(q) || 4)));
      const res = await apiFetch(`/api/os-algo/schedulers?source=${encodeURIComponent(src)}&quantum=${safeQ}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setSchedError(data.error || `HTTP ${res.status}`);
      } else {
        setSchedData(data);
      }
    } catch (err) {
      setSchedError(err?.message || 'Failed to load schedulers');
    } finally {
      setSchedLoading(false);
    }
  }, [apiFetch, source, quantum]);

  const loadDeadlock = useCallback(async () => {
    try {
      const res = await apiFetch('/api/os-algo/deadlock');
      const data = await res.json().catch(() => null);
      if (res.ok && data) setDeadlockData(data);
    } catch (_) { }
  }, [apiFetch]);

  const loadSemaphore = useCallback(async (cap = semCapacity, cnt = semItems) => {
    try {
      const c = Math.max(1, Math.min(20, Math.floor(Number(cap) || 3)));
      const i = Math.max(1, Math.min(50, Math.floor(Number(cnt) || 6)));
      const res = await apiFetch(`/api/os-algo/semaphore-demo?capacity=${c}&items=${i}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data) setSemData(data);
    } catch (_) { }
  }, [apiFetch, semCapacity, semItems]);

  const loadSuggestions = useCallback(async (incId) => {
    if (!incId) {
      setTeamSuggestions(null);
      return;
    }
    setSuggestLoading(true);
    try {
      const res = await apiFetch(`/api/incidents/${encodeURIComponent(incId)}/suggest-team`);
      const data = await res.json().catch(() => null);
      if (res.ok && data) setTeamSuggestions(data);
    } catch (_) { }
    finally {
      setSuggestLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadSchedulers(source, quantum);
    loadDeadlock();
    loadSemaphore(semCapacity, semItems);
  }, []); // initial mount

  useEffect(() => {
    if (!selectedIncId && incidents.length > 0) {
      const open = incidents.find((i) => i.status !== 'Resolved') || incidents[0];
      if (open?.id) {
        setSelectedIncId(open.id);
        loadSuggestions(open.id);
      }
    }
  }, [incidents, selectedIncId, loadSuggestions]);

  const algorithms = schedData?.algorithms || [];
  const colorsByPid = useMemo(() => pidColorMap(algorithms), [algorithms]);

  const bestMetrics = useMemo(() => {
    if (algorithms.length === 0) return {};
    const min = (key) => Math.min(...algorithms.map((a) => Number(a.metrics?.[key] ?? Infinity)));
    const max = (key) => Math.max(...algorithms.map((a) => Number(a.metrics?.[key] ?? -Infinity)));
    return {
      avgWaiting: min('avgWaiting'),
      avgTurnaround: min('avgTurnaround'),
      avgResponse: min('avgResponse'),
      contextSwitches: min('contextSwitches'),
      deadlinesMissed: min('deadlinesMissed'),
      makespan: min('makespan'),
      throughput: max('throughput'),
      cpuUtilization: max('cpuUtilization')
    };
  }, [algorithms]);

  const isBest = (val, target) => Number.isFinite(val) && Number.isFinite(target) && Math.abs(val - target) < 1e-6;

  return (
    <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: '20px', color: '#E2E8F0' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <Layers size={21} color="#38BDF8" />
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
            OS Scheduler Lab, Deadlock &amp; Synchronization
          </h2>
          {schedData?.isDemoData && (
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
          <div style={{ display: 'inline-flex', backgroundColor: '#0B1220', border: '1px solid #1E2E4B', borderRadius: '8px', padding: '2px' }}>
            {['live', 'demo'].map((m) => (
              <button
                key={m}
                onClick={() => {
                  setSource(m);
                  loadSchedulers(m, quantum);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  backgroundColor: source === m ? (m === 'live' ? '#2563EB' : '#D97706') : 'transparent',
                  color: source === m ? '#FFFFFF' : '#94A3B8',
                  cursor: 'pointer'
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#94A3B8' }}>
            <span>RR Quantum:</span>
            <input
              type="number"
              min="1"
              max="50"
              value={quantum}
              onChange={(e) => setQuantum(e.target.value)}
              style={{
                width: '58px',
                padding: '5px 8px',
                borderRadius: '6px',
                backgroundColor: '#0B1220',
                border: '1px solid #1E2E4B',
                color: '#FFFFFF',
                fontSize: '12.5px'
              }}
            />
          </label>

          <button
            onClick={() => {
              loadSchedulers(source, quantum);
              loadDeadlock();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Play size={13} />
            {schedLoading ? 'Running...' : 'Run Comparison'}
          </button>
        </div>
      </div>

      {schedData?.fallbackReason && (
        <div
          style={{
            padding: '9px 14px',
            borderRadius: '8px',
            backgroundColor: 'rgba(245,158,11,0.12)',
            border: '1px solid #F59E0B55',
            color: '#FDE68A',
            fontSize: '12px'
          }}
        >
          {schedData.fallbackReason} — currently showing fixed Demo Workload (FLOOD-1 .. SHELTER-1).
        </div>
      )}

      {schedError && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.14)', border: '1px solid #EF444466', color: '#FCA5A5', fontSize: '12.5px' }}>
          {schedError}
        </div>
      )}

      {/* Workload Summary */}
      {Array.isArray(schedData?.workload) && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#93C5FD', marginBottom: '8px' }}>
            Active Workload ({schedData.workload.length} Processes · Source: {String(schedData.source || 'demo').toUpperCase()})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {schedData.workload.map((p) => (
              <div
                key={p.pid}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  backgroundColor: '#070C16',
                  border: `1px solid ${colorsByPid.get(p.pid) || '#1E2E4B'}66`,
                  fontSize: '11.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px'
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: colorsByPid.get(p.pid) || '#38BDF8', display: 'inline-block' }} />
                <strong style={{ color: '#FFFFFF' }}>{p.pid}</strong>
                <span style={{ color: '#94A3B8' }}>
                  arr:{p.arrival} · burst:{p.burst} · pri:{p.priority} · dl:{p.deadline ?? '-'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. Algorithm Comparison Table */}
      <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E', overflowX: 'auto' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>
          6-Algorithm Scheduling Comparison (Best value per metric highlighted)
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
          <thead>
            <tr style={{ color: '#64748B', textAlign: 'left', borderBottom: '1px solid #16243E' }}>
              <th style={{ padding: '8px' }}>Algorithm</th>
              <th style={{ padding: '8px' }}>Avg Wait ↓</th>
              <th style={{ padding: '8px' }}>Avg Turnaround ↓</th>
              <th style={{ padding: '8px' }}>Avg Response ↓</th>
              <th style={{ padding: '8px' }}>Ctx Switches ↓</th>
              <th style={{ padding: '8px' }}>Missed Deadlines ↓</th>
              <th style={{ padding: '8px' }}>Throughput ↑</th>
              <th style={{ padding: '8px' }}>CPU Util % ↑</th>
              <th style={{ padding: '8px' }}>Makespan ↓</th>
            </tr>
          </thead>
          <tbody>
            {algorithms.map((a) => {
              const m = a.metrics || {};
              const cell = (val, key, suffix = '') => {
                const win = isBest(Number(val), bestMetrics[key]);
                return (
                  <td style={{ padding: '8px', fontWeight: win ? 800 : 500, color: win ? '#34D399' : '#CBD5E1' }}>
                    <span
                      style={
                        win
                          ? { padding: '2px 7px', borderRadius: '6px', backgroundColor: 'rgba(16,185,129,0.16)', border: '1px solid #10B98166' }
                          : undefined
                      }
                    >
                      {val}{suffix}
                    </span>
                  </td>
                );
              };
              return (
                <tr key={a.algorithm} style={{ borderBottom: '1px solid #111D35' }}>
                  <td style={{ padding: '8px', fontWeight: 700, color: '#FFFFFF' }}>{a.algorithm}</td>
                  {cell(m.avgWaiting, 'avgWaiting')}
                  {cell(m.avgTurnaround, 'avgTurnaround')}
                  {cell(m.avgResponse, 'avgResponse')}
                  {cell(m.contextSwitches, 'contextSwitches')}
                  {cell(m.deadlinesMissed, 'deadlinesMissed')}
                  {cell(m.throughput, 'throughput')}
                  {cell(m.cpuUtilization, 'cpuUtilization', '%')}
                  {cell(m.makespan, 'makespan')}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 2. Per-Algorithm Gantt Charts (CSS only) */}
      <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700 }}>CPU Scheduling Gantt Charts (CSS Only · Hover blocks for start/end times)</span>
          <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, backgroundColor: '#475569', borderRadius: 2, marginRight: 5 }} />
            Grey = IDLE
          </span>
        </div>

        {algorithms.map((a) => {
          const makespan = Math.max(1, Number(a.metrics?.makespan || 1));
          const tickCount = Math.min(10, makespan);
          const ticks = [];
          for (let i = 0; i <= tickCount; i += 1) {
            ticks.push(Math.round((i * makespan) / tickCount));
          }
          return (
            <div key={a.algorithm} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <strong style={{ color: '#93C5FD' }}>{a.algorithm}</strong>
                <span style={{ color: '#64748B', fontSize: '11px' }}>
                  Wait: {a.metrics?.avgWaiting} · Turnaround: {a.metrics?.avgTurnaround} · Makespan: {makespan}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  height: '28px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: '1px solid #1E2E4B',
                  backgroundColor: '#070C16'
                }}
              >
                {(a.segments || []).map((seg, sIdx) => {
                  const dur = Math.max(0, seg.end - seg.start);
                  const widthPct = (dur / makespan) * 100;
                  const isIdle = !seg.pid;
                  const bg = isIdle ? '#475569' : (colorsByPid.get(seg.pid) || '#2563EB');
                  return (
                    <div
                      key={`${a.algorithm}-${sIdx}`}
                      title={`${seg.pid || 'IDLE'} | t=${seg.start} → ${seg.end} (duration ${dur})`}
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: bg,
                        borderRight: '1px solid rgba(7,12,22,0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#FFFFFF',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        padding: '0 2px',
                        cursor: 'default'
                      }}
                    >
                      {widthPct >= 6 ? (seg.pid || 'IDLE') : ''}
                    </div>
                  );
                })}
              </div>
              {/* Time axis */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748B', fontFamily: 'monospace' }}>
                {ticks.map((t, idx) => (
                  <span key={`${a.algorithm}-tick-${idx}`}>{t}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Deadlock Scenarios + Live Detection */}
      <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
            <GitBranch size={16} color="#F59E0B" />
            <span>Deadlock Detection (Wait-For / Resource Allocation Graph)</span>
          </div>
          <button
            onClick={loadDeadlock}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              backgroundColor: '#13203A',
              border: '1px solid #1E3256',
              color: '#93C5FD',
              fontSize: '11.5px',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={12} />
            Re-check
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          {[...(deadlockData?.scenarios || []), ...(deadlockData?.live ? [{ id: 'live', name: 'Live ResQCore State', ...deadlockData.live }] : [])].map((sc) => (
            <div
              key={sc.id}
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: '#070C16',
                border: `1px solid ${sc.hasDeadlock ? '#EF444466' : '#10B98155'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <strong style={{ fontSize: '12.5px', color: '#FFFFFF' }}>{sc.name}</strong>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    backgroundColor: sc.hasDeadlock ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)',
                    color: sc.hasDeadlock ? '#FCA5A5' : '#34D399'
                  }}
                >
                  {sc.hasDeadlock ? 'DEADLOCK' : 'SAFE'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#CBD5E1', lineHeight: 1.45 }}>{sc.explanation}</div>
              {sc.suggestedVictim && (
                <div style={{ fontSize: '11.5px', color: '#FCA5A5', fontWeight: 700 }}>
                  Suggested Victim: {sc.suggestedVictim}
                </div>
              )}
              {sc.cycle?.length > 0 && (
                <div style={{ fontSize: '11px', color: '#FBBF24' }}>
                  Cycle: {sc.cycle.join(' → ')}
                </div>
              )}
              {sc.safeOrder?.length > 0 && (
                <div style={{ fontSize: '11px', color: '#34D399' }}>
                  Safe Order: {sc.safeOrder.join(' → ')}
                </div>
              )}
              {sc.edges?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {sc.edges.map((e, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: '10.5px',
                        padding: '2px 7px',
                        borderRadius: '5px',
                        backgroundColor: '#13203A',
                        color: e.kind === 'request' ? '#FBBF24' : '#7DD3FC'
                      }}
                    >
                      {e.from} → {e.to} (×{e.units})
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 4. Semaphore Producer-Consumer + 5. Smart Team Selection */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))', gap: '16px' }}>
        {/* Semaphore Producer-Consumer */}
        <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
              <Lock size={15} color="#A78BFA" />
              <span>Bounded-Buffer Semaphore Trace</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94A3B8' }}>
                Cap:
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={semCapacity}
                  onChange={(e) => setSemCapacity(e.target.value)}
                  style={{ width: '48px', padding: '4px 6px', borderRadius: '6px', backgroundColor: '#070C16', border: '1px solid #1E2E4B', color: '#FFF' }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94A3B8' }}>
                Items:
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={semItems}
                  onChange={(e) => setSemItems(e.target.value)}
                  style={{ width: '48px', padding: '4px 6px', borderRadius: '6px', backgroundColor: '#070C16', border: '1px solid #1E2E4B', color: '#FFF' }}
                />
              </label>
              <button
                onClick={() => loadSemaphore(semCapacity, semItems)}
                style={{ padding: '5px 10px', borderRadius: '6px', backgroundColor: '#2563EB', color: '#FFF', fontWeight: 700, cursor: 'pointer' }}
              >
                Run
              </button>
            </div>
          </div>

          {semData && (
            <>
              <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                Buffer Capacity: <strong style={{ color: '#FFFFFF' }}>{semData.capacity}</strong> · Produced:{' '}
                <strong style={{ color: '#38BDF8' }}>{semData.produced}</strong> · Consumed:{' '}
                <strong style={{ color: '#34D399' }}>{semData.consumed}</strong>
              </div>
              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead>
                    <tr style={{ color: '#64748B', textAlign: 'left', borderBottom: '1px solid #16243E' }}>
                      <th style={{ padding: '5px 6px' }}>Step</th>
                      <th style={{ padding: '5px 6px' }}>Actor</th>
                      <th style={{ padding: '5px 6px' }}>Action</th>
                      <th style={{ padding: '5px 6px' }}>Buffer / Sem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(semData.trace || []).map((row) => {
                      const isBlocked = String(row.action || '').includes('BLOCKED');
                      return (
                        <tr
                          key={row.step}
                          style={{
                            borderBottom: '1px solid #111D35',
                            backgroundColor: isBlocked ? 'rgba(239,68,68,0.16)' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '6px', color: '#94A3B8' }}>#{row.step}</td>
                          <td style={{ padding: '6px', color: '#CBD5E1', fontWeight: 600 }}>{row.actor}</td>
                          <td style={{ padding: '6px', color: isBlocked ? '#FCA5A5' : '#E2E8F0', fontWeight: isBlocked ? 700 : 400 }}>
                            {row.action}
                          </td>
                          <td style={{ padding: '6px', color: '#93C5FD', fontFamily: 'monospace' }}>
                            [{row.buffer?.length || 0}] E:{row.empty} F:{row.full}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Smart Team Selection */}
        <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
              <Navigation size={15} color="#34D399" />
              <span>Smart Team Selection (Haversine + Specialty)</span>
            </div>
            <select
              value={selectedIncId}
              onChange={(e) => {
                setSelectedIncId(e.target.value);
                loadSuggestions(e.target.value);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                backgroundColor: '#070C16',
                border: '1px solid #1E2E4B',
                color: '#FFFFFF',
                fontSize: '12px',
                maxWidth: '240px'
              }}
            >
              <option value="">Select incident...</option>
              {incidents.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  {inc.id} · {inc.title}
                </option>
              ))}
            </select>
          </div>

          {suggestLoading ? (
            <div style={{ fontSize: '12.5px', color: '#94A3B8' }}>Scoring available teams...</div>
          ) : !selectedIncId ? (
            <div style={{ fontSize: '12.5px', color: '#64748B' }}>
              {incidents.length === 0 ? 'Create an incident in Live mode to rank available teams.' : 'Select an incident above.'}
            </div>
          ) : !teamSuggestions?.suggestions?.length ? (
            <div style={{ fontSize: '12.5px', color: '#FBBF24', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={14} />
              No Available teams right now for {selectedIncId}.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ color: '#64748B', textAlign: 'left', borderBottom: '1px solid #16243E' }}>
                  <th style={{ padding: '6px' }}>#</th>
                  <th style={{ padding: '6px' }}>Team</th>
                  <th style={{ padding: '6px' }}>Distance</th>
                  <th style={{ padding: '6px' }}>ETA</th>
                  <th style={{ padding: '6px' }}>Specialty</th>
                  <th style={{ padding: '6px' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {teamSuggestions.suggestions.map((s, idx) => (
                  <tr key={s.teamId} style={{ borderBottom: '1px solid #111D35' }}>
                    <td style={{ padding: '7px 6px', fontWeight: 700, color: idx === 0 ? '#34D399' : '#94A3B8' }}>{idx + 1}</td>
                    <td style={{ padding: '7px 6px' }}>
                      <div style={{ fontWeight: 700, color: '#FFFFFF' }}>{s.name}</div>
                      <div style={{ fontSize: '10.5px', color: '#64748B' }}>{s.specialization}</div>
                    </td>
                    <td style={{ padding: '7px 6px', color: '#CBD5E1' }}>
                      {s.distanceKm != null ? `${s.distanceKm} km` : 'No GPS'}
                    </td>
                    <td style={{ padding: '7px 6px', color: '#38BDF8' }}>
                      {s.etaMinutes != null ? `${s.etaMinutes} min` : '-'}
                    </td>
                    <td style={{ padding: '7px 6px' }}>
                      {s.suitable ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 7px', borderRadius: '999px', backgroundColor: 'rgba(16,185,129,0.16)', color: '#34D399', fontSize: '10.5px', fontWeight: 700 }}>
                          <CheckCircle2 size={11} />
                          Match (-5 km bonus)
                        </span>
                      ) : (
                        <span style={{ color: '#64748B', fontSize: '11px' }}>General</span>
                      )}
                    </td>
                    <td style={{ padding: '7px 6px', fontWeight: 700, color: '#FFFFFF' }}>{s.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
