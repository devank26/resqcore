import React from 'react';
import { Cpu, Lock, Activity, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const OSPanel = () => {
  const { osState, refreshOsState, isDemoMode } = useApp();

  if (isDemoMode) {
    return (
      <div style={{ padding: '28px 32px', color: '#94A3B8' }}>
        OS Scheduler & Banker Monitor is available in Live Backend mode.
      </div>
    );
  }

  const metrics = osState?.metrics || {};
  const readyQueue = osState?.readyQueue || [];
  const running = osState?.running || [];
  const mutexes = osState?.mutexes || {};

  const cards = [
    { label: 'Ready Queue', value: `${metrics.readyCount ?? 0} / ${metrics.queueCapacity ?? 10}`, color: '#38BDF8' },
    { label: 'Running PCBs', value: metrics.runningCount ?? 0, color: '#10B981' },
    { label: 'Preemptions', value: metrics.preemptions ?? 0, color: '#F59E0B' },
    { label: 'Rejected (429)', value: metrics.totalRejected ?? 0, color: '#EF4444' },
    { label: 'Avg Wait (ms)', value: metrics.avgWaitingTimeMs ?? 0, color: '#A78BFA' },
    { label: 'Avg Turnaround (ms)', value: metrics.avgTurnaroundTimeMs ?? 0, color: '#60A5FA' }
  ];

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px', color: '#E2E8F0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Cpu size={20} color="#38BDF8" />
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>
            OS Scheduler, Team Mutex &amp; Metrics
          </h2>
        </div>
        <button
          onClick={refreshOsState}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '8px',
            backgroundColor: '#13203A',
            border: '1px solid #1E3256',
            color: '#93C5FD',
            fontSize: '12.5px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <RefreshCw size={14} />
          Refresh /api/os/state
        </button>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
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
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: c.color, marginTop: '6px' }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Ready Queue (PCBs) */}
        <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontWeight: 700, fontSize: '14px' }}>
            <Clock size={15} color="#38BDF8" />
            <span>Bounded Intake Queue (READY PCBs)</span>
          </div>
          {readyQueue.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#64748B' }}>No queued PCBs</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {readyQueue.map((pcb) => (
                <div
                  key={pcb.pid}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#070C16',
                    border: '1px solid #1A263D'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>{pcb.pid} · {pcb.title}</div>
                    <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>
                      {pcb.severity} · {pcb.category} · Affected: {pcb.affected} · Age ticks: {pcb.ageTicks}
                    </div>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#38BDF8' }}>P={pcb.priority}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Running PCBs & Team Mutexes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontWeight: 700, fontSize: '14px' }}>
              <Activity size={15} color="#10B981" />
              <span>Running PCBs</span>
            </div>
            {running.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#64748B' }}>No running PCBs</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {running.map((pcb) => (
                  <div
                    key={pcb.pid}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: '#070C16',
                      border: '1px solid #1A263D'
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{pcb.pid} ({pcb.assignedTeamId})</span>
                    <span style={{ fontSize: '12px', color: '#10B981' }}>P={pcb.priority} · Preempted: {pcb.preemptedCount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0D1527', border: '1px solid #16243E' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontWeight: 700, fontSize: '14px' }}>
              <Lock size={15} color="#F59E0B" />
              <span>Active Team Mutexes</span>
            </div>
            {Object.keys(mutexes).length === 0 ? (
              <div style={{ fontSize: '13px', color: '#64748B' }}>All teams unlocked</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.entries(mutexes).map(([teamId, pid]) => (
                  <div key={teamId} style={{ fontSize: '12.5px', color: '#FDE68A' }}>
                    {teamId} → {pid}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
