import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Battery,
  CheckCircle2,
  Clock,
  Download,
  Layers,
  MapPin,
  Printer,
  Radio,
  RefreshCw,
  Shield,
  Users,
  Wifi
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MapView } from '../components/common/MapView';
import { StatusBadge } from '../components/common/Badge';

const formatIstTime = (isoOrDate) => {
  if (!isoOrDate) return '--:--:-- IST';
  const d = typeof isoOrDate === 'number' || typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '--:--:-- IST';
  return `${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} IST`;
};

const formatCoords = (lat, lng) => {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return 'No GPS fix';
  return `${nLat.toFixed(4)}° N, ${nLng.toFixed(4)}° E`;
};

const csvEscape = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const cardStyle = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '14px',
  padding: '20px',
  boxShadow: 'var(--shadow-card)'
};

const kpiLabelStyle = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em'
};

export const ReportsPage = () => {
  const {
    incidents,
    teams,
    osLive,
    intelligence,
    refreshIntelligence,
    isDemoMode,
    wsStatus,
    sseStatus
  } = useApp();

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pull fresh PostgreSQL snapshot on page open, and fallback poll only if both WS & SSE are down
  useEffect(() => {
    if (isDemoMode) return undefined;
    let active = true;
    const pull = async () => {
      if (!active) return;
      setIsRefreshing(true);
      try {
        await refreshIntelligence?.();
      } finally {
        if (active) setIsRefreshing(false);
      }
    };
    pull();

    const timer = setInterval(() => {
      if (wsStatus !== 'Live' || sseStatus !== 'connected') {
        pull();
      }
    }, 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isDemoMode, refreshIntelligence, wsStatus, sseStatus]);

  const handleManualRefresh = async () => {
    if (isDemoMode || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshIntelligence?.();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Compute demo model or live instant fallback when backend snapshot hasn't arrived yet
  const reportData = useMemo(() => {
    if (isDemoMode) {
      const resolved = incidents.filter((i) => i.status === 'Resolved').length;
      const deployed = teams.filter((t) => t.status === 'Deployed').length;
      const totalResp = teams.reduce((s, t) => s + (t.responders || 4), 0);
      const depResp = teams.filter((t) => t.status === 'Deployed').reduce((s, t) => s + (t.responders || 4), 0);
      const capacityPct = teams.length ? Math.round((deployed / teams.length) * 100) : 0;
      const affected = incidents.reduce((s, i) => s + Number(i.affectedCount ?? i.affected ?? 0), 0);
      return {
        generatedAt: new Date().toISOString(),
        summary: {
          totalIncidents: incidents.length,
          resolvedIncidents: resolved + 42,
          activeIncidents: incidents.length - resolved,
          unverifiedIncidents: incidents.filter((i) => i.status === 'Unverified').length,
          verifiedIncidents: incidents.filter((i) => i.status === 'Verified').length,
          respondingIncidents: incidents.filter((i) => !['Resolved', 'Unverified', 'Verified'].includes(i.status)).length,
          resolutionRatePct: incidents.length ? Math.round(((resolved + 42) / (incidents.length + 42)) * 100) : 92,
          citizensAffectedTotal: affected,
          avgResponseSeconds: 492,
          avgResponseMinutes: 8.2,
          avgTurnaroundMinutes: 26.4,
          avgEtaMinutes: 7.5,
          respondedCount: incidents.length,
          evacuatedTotal: 1420,
          shelterCapacityTotal: 2200,
          operationalShelters: 4,
          shelterOccupancyPct: 65,
          totalTeams: teams.length,
          deployedTeams: deployed,
          availableTeams: teams.filter((t) => t.status === 'Available').length,
          sosTeams: 0,
          totalResponders: totalResp,
          deployedResponders: depResp,
          rescueCapacityPct: capacityPct,
          severityBreakdown: {
            Critical: incidents.filter((i) => i.severity === 'Critical').length,
            High: incidents.filter((i) => i.severity === 'High').length,
            Medium: incidents.filter((i) => i.severity === 'Medium').length,
            Low: incidents.filter((i) => i.severity === 'Low').length
          },
          plottedIncidentsCount: incidents.filter((i) => i.coordinates?.lat != null).length,
          telemetryRecordsTotal: teams.length * 14
        },
        zoneResponseTimes: [
          { zone: 'Fort Kochi', total: 4, active: 2, resolved: 2, criticalOrHigh: 2, avgMinutes: 6.4, awaitingDispatch: false, timeLabel: '6.4 min (4 inc)', pct: 43, color: '#3B82F6' },
          { zone: 'Aluva East', total: 3, active: 1, resolved: 2, criticalOrHigh: 1, avgMinutes: 9.1, awaitingDispatch: false, timeLabel: '9.1 min (3 inc)', pct: 61, color: '#F59E0B' },
          { zone: 'Kakkanad Central', total: 2, active: 1, resolved: 1, criticalOrHigh: 0, avgMinutes: 4.8, awaitingDispatch: false, timeLabel: '4.8 min (2 inc)', pct: 32, color: '#10B981' },
          { zone: 'Edappally North', total: 2, active: 1, resolved: 1, criticalOrHigh: 1, avgMinutes: 11.2, awaitingDispatch: false, timeLabel: '11.2 min (2 inc)', pct: 75, color: '#EF4444' }
        ],
        resourceInventory: [
          { id: 'ambulance', name: 'Ambulances', total: 14, available: 2, inUse: 12, pct: 86, color: '#EF4444', usedLabel: '12 / 14 in use (2 free)' },
          { id: 'boat', name: 'Rescue Boats', total: 18, available: 4, inUse: 14, pct: 78, color: '#F59E0B', usedLabel: '14 / 18 in use (4 free)' },
          { id: 'medical_kit', name: 'Medical Kits', total: 100, available: 48, inUse: 52, pct: 52, color: '#10B981', usedLabel: '52 / 100 in use (48 free)' },
          { id: 'shelter_capacity', name: 'Shelter Capacities', total: 2200, available: 780, inUse: 1420, pct: 65, color: '#3B82F6', usedLabel: '1,420 / 2,200 occupied' }
        ],
        hotspots: [
          { zone: 'Fort Kochi', count: 4, activeCount: 2, criticalCount: 2, affected: 320, lat: 9.9658, lng: 76.2421, densityLevel: 'High' },
          { zone: 'Aluva East', count: 3, activeCount: 1, criticalCount: 1, affected: 180, lat: 10.1004, lng: 76.357, densityLevel: 'Moderate' }
        ],
        telemetryFeed: teams.map((t) => ({
          teamId: t.id,
          name: t.name,
          specialization: t.type || t.specialization || 'SAR',
          status: t.status,
          battery: t.battery ?? 90,
          signal: 'Strong',
          speed: t.status === 'Deployed' ? 42 : 0,
          lat: t.coordinates?.lat ?? null,
          lng: t.coordinates?.lng ?? null,
          task: t.task || null,
          eta: t.eta || null,
          lastUpdate: new Date().toISOString()
        }))
      };
    }

    if (intelligence?.summary) {
      return intelligence;
    }

    // Immediate live client-derived fallback while first /api/reports/intelligence request completes
    const resolved = incidents.filter((i) => i.status === 'Resolved').length;
    const unverified = incidents.filter((i) => i.status === 'Unverified').length;
    const verified = incidents.filter((i) => i.status === 'Verified').length;
    const responding = incidents.length - resolved - unverified - verified;
    const deployedTeams = teams.filter((t) => t.status === 'Deployed' || t.status === 'SOS').length;
    const sosTeams = teams.filter((t) => t.status === 'SOS').length;
    const totalResponders = teams.reduce((s, t) => s + Number(t.responders || 4), 0);
    const deployedResponders = teams.filter((t) => t.status === 'Deployed' || t.status === 'SOS').reduce((s, t) => s + Number(t.responders || 4), 0);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalIncidents: incidents.length,
        resolvedIncidents: resolved,
        activeIncidents: incidents.length - resolved,
        unverifiedIncidents: unverified,
        verifiedIncidents: verified,
        respondingIncidents: Math.max(0, responding),
        resolutionRatePct: incidents.length ? Math.round((resolved / incidents.length) * 100) : 0,
        citizensAffectedTotal: incidents.reduce((s, i) => s + Number(i.affectedCount ?? i.affected ?? 0), 0),
        avgResponseSeconds: 0,
        avgResponseMinutes: 0,
        avgTurnaroundMinutes: 0,
        avgEtaMinutes: 0,
        respondedCount: 0,
        evacuatedTotal: 0,
        shelterCapacityTotal: 0,
        operationalShelters: 0,
        shelterOccupancyPct: 0,
        totalTeams: teams.length,
        deployedTeams,
        availableTeams: teams.filter((t) => t.status === 'Available' || t.status === 'Standby').length,
        sosTeams,
        totalResponders,
        deployedResponders,
        rescueCapacityPct: teams.length ? Math.round((deployedTeams / teams.length) * 100) : 0,
        severityBreakdown: {
          Critical: incidents.filter((i) => i.severity === 'Critical').length,
          High: incidents.filter((i) => i.severity === 'High').length,
          Medium: incidents.filter((i) => i.severity === 'Medium').length,
          Low: incidents.filter((i) => i.severity === 'Low').length
        },
        plottedIncidentsCount: incidents.filter((i) => i.coordinates?.lat != null).length,
        telemetryRecordsTotal: 0
      },
      zoneResponseTimes: [],
      resourceInventory: Object.entries(osLive?.resources || {}).map(([key, total]) => {
        const alloc = Number(osLive?.allocated?.[key] || 0);
        const avail = Math.max(0, Number(total) - alloc);
        const pct = total > 0 ? Math.round((alloc / total) * 100) : 0;
        return {
          id: key,
          name: key,
          total,
          available: avail,
          inUse: alloc,
          pct,
          color: pct >= 85 ? '#EF4444' : pct >= 60 ? '#F59E0B' : '#3B82F6',
          usedLabel: `${alloc} / ${total} in use (${avail} free)`
        };
      }),
      hotspots: [],
      telemetryFeed: teams.map((t) => ({
        teamId: t.id,
        name: t.name,
        specialization: t.specialization || t.type || 'SAR',
        status: t.status,
        battery: t.battery ?? 100,
        signal: 'Active',
        speed: null,
        lat: t.coordinates?.lat ?? null,
        lng: t.coordinates?.lng ?? null,
        task: t.task || null,
        eta: t.eta || null,
        lastUpdate: t.lastUpdate || null
      }))
    };
  }, [isDemoMode, intelligence, incidents, teams, osLive]);

  const { summary, zoneResponseTimes, resourceInventory, hotspots, telemetryFeed, generatedAt } = reportData;

  const isRealtimeConnected = !isDemoMode && (wsStatus === 'Live' || sseStatus === 'connected');
  const highDensityZones = hotspots.filter((h) => h.densityLevel === 'High' || h.densityLevel === 'Moderate').slice(0, 3);
  const densityLegendLabel = highDensityZones.length
    ? `Active Density (${highDensityZones.map((h) => h.zone).join(' · ')})`
    : summary.plottedIncidentsCount > 0
      ? `${summary.plottedIncidentsCount} Geotagged Incidents Plotted`
      : 'Awaiting Geotagged Incidents';

  const responseDisplay = summary.avgResponseSeconds > 0
    ? (summary.avgResponseSeconds < 90 ? `${summary.avgResponseSeconds} sec` : `${summary.avgResponseMinutes} min`)
    : (summary.avgEtaMinutes > 0 ? `~${summary.avgEtaMinutes} min ETA` : 'Awaiting dispatch');

  const handleExportCsv = () => {
    const lines = [
      ['ResQCore Operational Intelligence Report'],
      ['Generated At', generatedAt],
      ['Mode', isDemoMode ? 'Demo Simulation' : 'Live Operational Telemetry'],
      [],
      ['KPI', 'Value'],
      ['Total Incidents', summary.totalIncidents],
      ['Resolved Incidents', summary.resolvedIncidents],
      ['Active Incidents', summary.activeIncidents],
      ['Resolution Rate (%)', summary.resolutionRatePct],
      ['Citizens Affected', summary.citizensAffectedTotal],
      ['Average Dispatch Response (sec)', summary.avgResponseSeconds],
      ['Average Resolution Turnaround (min)', summary.avgTurnaroundMinutes],
      ['Evacuated in Shelters', summary.evacuatedTotal],
      ['Total Shelter Capacity', summary.shelterCapacityTotal],
      ['Deployed Teams', `${summary.deployedTeams}/${summary.totalTeams}`],
      ['Rescue Capacity Engaged (%)', summary.rescueCapacityPct],
      [],
      ['Zone', 'Total Incidents', 'Active', 'Resolved', 'Avg Metric'],
      ...zoneResponseTimes.map((z) => [z.zone, z.total, z.active, z.resolved, z.timeLabel]),
      [],
      ['Hotspot Zone', 'Incidents', 'Active', 'Critical/High', 'Affected Citizens', 'Density', 'Lat', 'Lng'],
      ...hotspots.map((h) => [h.zone, h.count, h.activeCount, h.criticalCount, h.affected, h.densityLevel, h.lat, h.lng]),
      [],
      ['Resource Pool', 'In Use', 'Available', 'Total', 'Utilization (%)'],
      ...resourceInventory.map((r) => [r.name, r.inUse, r.available, r.total, r.pct]),
      [],
      ['Team', 'Specialization', 'Status', 'Battery (%)', 'Signal', 'Speed (km/h)', 'Lat', 'Lng', 'Task', 'ETA', 'Last Update'],
      ...telemetryFeed.map((t) => [t.name, t.specialization, t.status, t.battery, t.signal, t.speed ?? '', t.lat ?? '', t.lng ?? '', t.task ?? '', t.eta ?? '', t.lastUpdate ?? ''])
    ];
    const csv = lines.map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resqcore-intelligence-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1440px', width: '100%', paddingBottom: '28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Disaster Intelligence &amp; Reporting
            </h1>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: isDemoMode
                  ? 'rgba(245, 158, 11, 0.14)'
                  : isRealtimeConnected
                    ? 'rgba(16, 185, 129, 0.14)'
                    : 'rgba(239, 68, 68, 0.14)',
                color: isDemoMode ? '#FBBF24' : isRealtimeConnected ? '#34D399' : '#F87171',
                border: `1px solid ${isDemoMode ? 'rgba(245, 158, 11, 0.35)' : isRealtimeConnected ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`
              }}
            >
              <Radio size={13} />
              {isDemoMode ? 'Demo Simulation' : isRealtimeConnected ? 'LIVE · Real-Time DB Stream' : 'Reconnecting Stream'}
            </span>
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Operational analytics, incident concentration heatmaps and response telemetry · Synced {formatIstTime(generatedAt)}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {!isDemoMode && (
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '9px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border-medium)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isRefreshing ? 'wait' : 'pointer'
              }}
            >
              <RefreshCw size={15} style={{ opacity: isRefreshing ? 0.6 : 1 }} />
              {isRefreshing ? 'Syncing...' : 'Refresh Now'}
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border-medium)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Download size={15} />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '9px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(59, 130, 246, 0.45)',
              backgroundColor: 'var(--primary-blue)',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Printer size={15} />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Top 4 Real-Time KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={kpiLabelStyle}>Resolved Incidents</span>
            <CheckCircle2 size={18} color="#10B981" />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--text-main)' }}>
            {summary.resolvedIncidents}
          </div>
          <div style={{ fontSize: '12.5px', color: '#34D399', marginTop: '6px' }}>
            {summary.resolutionRatePct}% resolved · {summary.activeIncidents} active ({summary.unverifiedIncidents} unverified)
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={kpiLabelStyle}>Avg Dispatch Response</span>
            <Clock size={18} color="#3B82F6" />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--text-main)' }}>
            {responseDisplay}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            {summary.respondedCount} dispatched · {summary.avgTurnaroundMinutes > 0 ? `Avg resolution ${summary.avgTurnaroundMinutes} min` : summary.avgEtaMinutes > 0 ? `Mean unit ETA ${summary.avgEtaMinutes} min` : 'Monitoring triage queue'}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={kpiLabelStyle}>Citizens Evacuated &amp; Impact</span>
            <Users size={18} color="#F59E0B" />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--text-main)' }}>
            {summary.evacuatedTotal.toLocaleString()}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            {summary.shelterCapacityTotal > 0
              ? `${summary.shelterOccupancyPct}% of ${summary.shelterCapacityTotal.toLocaleString()} shelter beds · ${summary.citizensAffectedTotal.toLocaleString()} affected`
              : `${summary.citizensAffectedTotal.toLocaleString()} total citizens affected`}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={kpiLabelStyle}>Rescue Capacity Engaged</span>
            <Shield size={18} color={summary.sosTeams > 0 ? '#EF4444' : '#38BDF8'} />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--text-main)' }}>
            {summary.rescueCapacityPct}%
          </div>
          <div style={{ fontSize: '12.5px', color: summary.sosTeams > 0 ? '#F87171' : 'var(--text-secondary)', marginTop: '6px' }}>
            {summary.deployedTeams} / {summary.totalTeams} teams active · {summary.deployedResponders} responders
            {summary.sosTeams > 0 ? ` · ${summary.sosTeams} SOS` : ''}
          </div>
        </div>
      </div>

      {/* Incident Concentration Heatmap + Live Hotspot & Severity Cluster Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: '16px' }}>
        <div style={{ ...cardStyle, padding: '18px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} color="#EF4444" />
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
                Incident Concentration Heatmap
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: '#EF4444' }} /> Critical / High
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: '#F59E0B' }} /> Medium
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: '#3B82F6' }} /> Low
              </span>
            </div>
          </div>

          <div
            style={{
              position: 'relative',
              height: '420px',
              width: '100%',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-input)'
            }}
          >
            <MapView height="100%" incidents={incidents} showHeatmap={true} showFullControls={false} />
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 10,
                padding: '6px 12px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(7, 12, 22, 0.85)',
                border: '1px solid var(--border-medium)',
                backdropFilter: 'blur(6px)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#EF4444' }} />
              {densityLegendLabel}
            </div>
          </div>
        </div>

        {/* Severity Matrix & Geotagged Hotspots */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
              Severity &amp; Triage Matrix
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
              {[
                { label: 'Critical', count: summary.severityBreakdown.Critical, color: '#F87171', bg: 'rgba(239, 68, 68, 0.12)' },
                { label: 'High', count: summary.severityBreakdown.High, color: '#FB923C', bg: 'rgba(251, 146, 60, 0.12)' },
                { label: 'Medium', count: summary.severityBreakdown.Medium, color: '#FBBF24', bg: 'rgba(245, 158, 11, 0.12)' },
                { label: 'Low', count: summary.severityBreakdown.Low, color: '#60A5FA', bg: 'rgba(59, 130, 246, 0.12)' }
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: item.bg,
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span style={{ fontSize: '12.5px', color: 'var(--text-primary)', fontWeight: 600 }}>{item.label}</span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: item.color }}>{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>Top Concentration Zones</span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{hotspots.length} clusters</span>
            </div>

            {hotspots.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', borderRadius: '10px', backgroundColor: 'var(--bg-input)', border: '1px dashed var(--border-medium)' }}>
                No geotagged hotspots yet. Citizen SOS alerts and field reports will cluster here automatically.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '250px' }}>
                {hotspots.slice(0, 6).map((h) => (
                  <div
                    key={h.zone}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {h.zone}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {h.activeCount} active / {h.count} total · {h.affected} affected
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        <MapPin size={10} style={{ display: 'inline', marginRight: '4px' }} />
                        {formatCoords(h.lat, h.lng)}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '3px 9px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        flexShrink: 0,
                        color: h.densityLevel === 'High' ? '#F87171' : h.densityLevel === 'Moderate' ? '#FBBF24' : '#60A5FA',
                        backgroundColor: h.densityLevel === 'High' ? 'rgba(239,68,68,0.14)' : h.densityLevel === 'Moderate' ? 'rgba(245,158,11,0.14)' : 'rgba(59,130,246,0.14)'
                      }}
                    >
                      {h.densityLevel}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Analytics Row: Response Time by Zone & PostgreSQL Resource Pool Inventory */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} color="#3B82F6" />
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>Response Time by Zone</span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Dispatch speed &amp; triage wait</span>
          </div>

          {zoneResponseTimes.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', backgroundColor: 'var(--bg-input)', borderRadius: '10px' }}>
              No zone telemetry yet. Zone latency computes automatically as incidents are reported and dispatched.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {zoneResponseTimes.map((z) => (
                <div key={z.zone}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', gap: '8px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{z.zone}</span>
                    <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{z.timeLabel}</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', borderRadius: '9999px', backgroundColor: 'var(--bg-input)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${z.pct}%`,
                        height: '100%',
                        borderRadius: '9999px',
                        backgroundColor: z.color,
                        transition: 'width 300ms ease'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={18} color="#10B981" />
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>Resource Pool &amp; Shelter Utilization</span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Live allocation pool</span>
          </div>

          {resourceInventory.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', backgroundColor: 'var(--bg-input)', borderRadius: '10px' }}>
              No active resource records loaded.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {resourceInventory.map((r) => (
                <div key={r.id || r.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', gap: '8px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</span>
                    <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.usedLabel} ({r.pct}%)
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', borderRadius: '9999px', backgroundColor: 'var(--bg-input)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(2, r.pct))}%`,
                        height: '100%',
                        borderRadius: '9999px',
                        backgroundColor: r.color,
                        transition: 'width 300ms ease'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live Field Unit Response Telemetry */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wifi size={18} color="#38BDF8" />
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
              Live Field Response Telemetry
            </span>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {summary.telemetryRecordsTotal.toLocaleString()} telemetry packets logged · {telemetryFeed.length} registered units
          </span>
        </div>

        {telemetryFeed.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', backgroundColor: 'var(--bg-input)', borderRadius: '10px' }}>
            No rescue units transmitting telemetry yet. Telemetry appears live as field units log GPS &amp; battery pings.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Unit / Specialization</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Battery</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Signal / Speed</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Coordinates</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Assigned Task &amp; ETA</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Last Heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {telemetryFeed.map((u) => {
                  const batteryColor = u.battery <= 20 ? '#EF4444' : u.battery <= 45 ? '#F59E0B' : '#10B981';
                  return (
                    <tr key={u.teamId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '11px 12px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{u.specialization}</div>
                      </td>
                      <td style={{ padding: '11px 12px' }}>
                        <StatusBadge status={u.status} />
                      </td>
                      <td style={{ padding: '11px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: batteryColor, fontWeight: 600 }}>
                          <Battery size={14} />
                          {u.battery ?? 100}%
                        </div>
                      </td>
                      <td style={{ padding: '11px 12px', color: 'var(--text-secondary)' }}>
                        {u.signal || 'Active'}{u.speed != null ? ` · ${Math.round(u.speed)} km/h` : ''}
                      </td>
                      <td style={{ padding: '11px 12px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCoords(u.lat, u.lng)}
                      </td>
                      <td style={{ padding: '11px 12px', color: 'var(--text-primary)' }}>
                        {u.task ? `${u.task}${u.eta ? ` (${u.eta})` : ''}` : <span style={{ color: 'var(--text-muted)' }}>Standby</span>}
                      </td>
                      <td style={{ padding: '11px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {u.lastUpdate ? formatIstTime(u.lastUpdate) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {summary.sosTeams > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.14)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            color: '#FCA5A5',
            fontSize: '13px',
            fontWeight: 600
          }}
        >
          <AlertTriangle size={17} color="#EF4444" />
          MAYDAY ACTIVE: {summary.sosTeams} field rescue unit(s) currently broadcasting SOS distress telemetry.
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
