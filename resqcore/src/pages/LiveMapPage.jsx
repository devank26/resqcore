import React, { useState } from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Shield,
  Layers,
  ArrowRight,
  X,
  AlertTriangle,
  Radio,
  Navigation
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MapView } from '../components/common/MapView';
import { SeverityBadge, StatusBadge } from '../components/common/Badge';
import { IncidentDetailDrawer } from '../components/drawers/IncidentDetailDrawer';

export const LiveMapPage = () => {
  const {
    incidents,
    teams,
    selectedIncidentId,
    setSelectedIncidentId,
    inspectIncident,
    isDrawerOpen,
    setIsDrawerOpen,
    isDemoMode,
    user
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showTeams, setShowTeams] = useState(true);
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'sos' | 'missions'
  const [sideTab, setSideTab] = useState('incidents'); // 'incidents' | 'missions'

  // Helper classifications
  const isSOSIncident = (inc) => Boolean(
    inc.isCitizenSOS ||
    inc.is_citizen_sos ||
    inc.isRescueSOS ||
    inc.is_rescue_sos ||
    (typeof inc.id === 'string' && (inc.id.startsWith('RQ-') || inc.id.startsWith('SOS-') || inc.id.startsWith('CITIZEN-'))) ||
    inc.type?.toUpperCase().includes('SOS') ||
    inc.title?.toUpperCase().includes('SOS') ||
    inc.description?.toUpperCase().includes('SOS') ||
    inc.severity === 'Critical'
  );

  const isMissionIncident = (inc) => Boolean(
    inc.status === 'Responding' ||
    inc.status === 'On site' ||
    inc.assignedTeam ||
    inc.teamAssigned
  );

  const totalSosCount = incidents.filter(isSOSIncident).length;
  const totalMissionsCount = incidents.filter(isMissionIncident).length;

  // Filtered incidents
  const filteredIncidents = incidents.filter(i => {
    const matchesSearch =
      i.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (i.shortLocation && i.shortLocation.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (i.location && i.location.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesSeverity = severityFilter === 'All' || i.severity === severityFilter;
    const matchesStatus = statusFilter === 'All' || i.status === statusFilter;

    let matchesView = true;
    if (viewMode === 'sos') matchesView = isSOSIncident(i);
    if (viewMode === 'missions') matchesView = isMissionIncident(i);

    return matchesSearch && matchesSeverity && matchesStatus && matchesView;
  });

  const ongoingMissionsList = incidents.filter(isMissionIncident);

  const selectedIncident = incidents.find(i => i.id === selectedIncidentId);
  const isVerifiedResponse = selectedIncident?.status === 'Verified';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 68px)', overflow: 'hidden' }}>
      {/* Subheader & Controls */}
      <div
        style={{
          padding: '16px 28px 12px 28px',
          borderBottom: '1px solid #16243E',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          backgroundColor: '#070C16'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Live tactical response map
              {totalSosCount > 0 && (
                <span style={{ fontSize: '11px', fontWeight: 800, backgroundColor: 'rgba(239,68,68,0.2)', border: '1px solid #EF4444', color: '#EF4444', padding: '2px 8px', borderRadius: '9999px' }}>
                  {totalSosCount} Active SOS
                </span>
              )}
              {totalMissionsCount > 0 && (
                <span style={{ fontSize: '11px', fontWeight: 800, backgroundColor: 'rgba(16,185,129,0.15)', border: '1px solid #10B981', color: '#10B981', padding: '2px 8px', borderRadius: '9999px' }}>
                  {totalMissionsCount} Missions En Route
                </span>
              )}
            </h1>
            <p style={{ fontSize: '12.5px', color: '#94A3B8', marginTop: '2px' }}>
              Real-time tactical situational awareness across {isDemoMode ? 'Ernakulam' : (user?.district || 'Uttarakhand Operational Theater')}.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* View Mode Switcher Pills */}
            <div style={{ display: 'flex', backgroundColor: '#0D1527', border: '1px solid #1E2E4B', borderRadius: '8px', padding: '3px' }}>
              <button
                onClick={() => setViewMode('all')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: viewMode === 'all' ? '#1E3A8A' : 'transparent',
                  color: viewMode === 'all' ? '#FFFFFF' : '#94A3B8',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                All ({incidents.length})
              </button>
              <button
                onClick={() => setViewMode('sos')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: viewMode === 'sos' ? '#EF4444' : 'transparent',
                  color: viewMode === 'sos' ? '#FFFFFF' : '#EF4444',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <AlertTriangle size={13} /> SOS ({totalSosCount})
              </button>
              <button
                onClick={() => setViewMode('missions')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: viewMode === 'missions' ? '#10B981' : 'transparent',
                  color: viewMode === 'missions' ? '#FFFFFF' : '#10B981',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Shield size={13} /> Missions ({totalMissionsCount})
              </button>
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          {/* Search Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '7px 12px',
              backgroundColor: '#0D1527',
              border: '1px solid #1A263D',
              borderRadius: '8px',
              flex: '1',
              minWidth: '220px'
            }}
          >
            <Search size={15} color="#64748B" />
            <input
              type="text"
              placeholder="Search location, SOS or incident ID"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '12.5px',
                width: '100%'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'transparent', color: '#64748B' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Severity Dropdown */}
          <div style={{ position: 'relative' }}>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{
                appearance: 'none',
                padding: '7px 30px 7px 12px',
                backgroundColor: '#0D1527',
                border: '1px solid #1A263D',
                borderRadius: '8px',
                color: '#F1F5F9',
                fontSize: '12.5px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              <option value="All">All severity</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Info">Info</option>
            </select>
            <ChevronDown
              size={14}
              color="#64748B"
              style={{ position: 'absolute', right: '10px', top: '10px', pointerEvents: 'none' }}
            />
          </div>

          {/* Status Dropdown */}
          <div style={{ position: 'relative' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                appearance: 'none',
                padding: '7px 30px 7px 12px',
                backgroundColor: '#0D1527',
                border: '1px solid #1A263D',
                borderRadius: '8px',
                color: '#F1F5F9',
                fontSize: '12.5px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              <option value="All">All statuses</option>
              <option value="Unverified">Unverified</option>
              <option value="Verified">Verified</option>
              <option value="Responding">Responding</option>
              <option value="Escalated">Escalated</option>
              <option value="On site">On site</option>
              <option value="Monitoring">Monitoring</option>
            </select>
            <ChevronDown
              size={14}
              color="#64748B"
              style={{ position: 'absolute', right: '10px', top: '10px', pointerEvents: 'none' }}
            />
          </div>

          {/* Show Teams Toggle */}
          <div
            onClick={() => setShowTeams(!showTeams)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              backgroundColor: '#0D1527',
              border: '1px solid #1A263D',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <Layers size={14} color="#3B82F6" />
            <span style={{ fontSize: '12.5px', color: '#CBD5E1', fontWeight: 500 }}>
              Show teams
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: showTeams ? '#10B981' : '#64748B',
                backgroundColor: showTeams ? 'rgba(16, 185, 129, 0.15)' : '#162238',
                padding: '2px 8px',
                borderRadius: '9999px'
              }}
            >
              <span
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  backgroundColor: showTeams ? '#10B981' : '#64748B'
                }}
              />
              {showTeams ? 'On' : 'Off'}
            </span>
          </div>

          <div style={{ marginLeft: 'auto', fontSize: '12.5px', color: '#64748B' }}>
            {filteredIncidents.length} active in view
          </div>
        </div>
      </div>

      {/* Main Map View & Side Panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Map Canvas */}
        <div style={{ flex: 1, padding: '16px', height: '100%', position: 'relative' }}>
          <MapView
            height="100%"
            showDetailsOnClick={true}
            incidents={filteredIncidents}
            teams={teams}
            showTeams={showTeams}
          />
        </div>

        {/* Right Side Dock: Incident List / Ongoing Missions or Details Drawer */}
        {isDrawerOpen ? (
          <IncidentDetailDrawer />
        ) : (
          <div
            style={{
              width: '380px',
              minWidth: '380px',
              height: '100%',
              backgroundColor: '#0D1527',
              borderLeft: '1px solid #16243E',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto'
            }}
          >
            {/* Dock Header Tabs */}
            <div
              style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: '1px solid #16243E',
                backgroundColor: '#070C16'
              }}
            >
              <button
                onClick={() => setSideTab('incidents')}
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: sideTab === 'incidents' ? '#1E2E4B' : 'transparent',
                  color: sideTab === 'incidents' ? '#FFFFFF' : '#94A3B8',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Incidents ({filteredIncidents.length})
              </button>
              <button
                onClick={() => setSideTab('missions')}
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: sideTab === 'missions' ? '#10B98124' : 'transparent',
                  color: sideTab === 'missions' ? '#10B981' : '#94A3B8',
                  border: sideTab === 'missions' ? '1px solid #10B981' : '1px solid transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px'
                }}
              >
                <Shield size={13} /> Missions ({ongoingMissionsList.length})
              </button>
            </div>

            {sideTab === 'missions' ? (
              /* ONGOING MISSIONS LIST */
              <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {ongoingMissionsList.length === 0 ? (
                  <div style={{ padding: '30px 16px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                    <Shield size={32} color="#1E2E4B" style={{ margin: '0 auto 10px' }} />
                    No active rescue missions currently dispatched.
                  </div>
                ) : (
                  ongoingMissionsList.map((mission) => {
                    const isSelected = selectedIncidentId === mission.id;
                    const matchedTeam = teams.find(t =>
                      t.name === mission.assignedTeam ||
                      t.id === mission.assignedTeam ||
                      (t.task && t.task.includes(mission.id))
                    );

                    return (
                      <div
                        key={mission.id}
                        onClick={() => inspectIncident(mission.id)}
                        style={{
                          padding: '14px 16px',
                          backgroundColor: isSelected ? '#12203D' : '#080E1C',
                          border: `1.5px solid ${isSelected ? '#38BDF8' : '#10B981'}`,
                          borderRadius: '12px',
                          cursor: 'pointer',
                          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Shield size={14} /> {mission.assignedTeam || 'Rescue Unit'}
                          </span>
                          <span style={{ fontSize: '10.5px', fontWeight: 700, backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981', padding: '2px 7px', borderRadius: '4px' }}>
                            {mission.status || 'Responding'}
                          </span>
                        </div>

                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#FFFFFF', marginTop: '6px' }}>
                          {mission.title}
                        </div>

                        <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>
                          📍 {mission.location || mission.shortLocation || 'Operational Sector'}
                        </div>

                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #16243E', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }}>
                          <span style={{ color: '#38BDF8', fontWeight: 600 }}>
                            ⏱️ {mission.eta ? `ETA: ${mission.eta}` : 'En Route'}
                          </span>
                          {matchedTeam?.commanderPhone && (
                            <span style={{ color: '#CBD5E1' }}>
                              📞 {matchedTeam.commanderPhone}
                            </span>
                          )}
                        </div>

                        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '11px', color: '#38BDF8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            Focus Mission Route <ArrowRight size={12} />
                          </span>
                          <span style={{ fontSize: '10.5px', color: '#64748B' }}>
                            ID: {mission.id}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              /* INCIDENTS LIST */
              <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredIncidents.map((incident) => {
                  const isSelected = selectedIncidentId === incident.id;
                  const isSOS = isSOSIncident(incident);

                  return (
                    <div
                      key={incident.id}
                      onClick={() => inspectIncident(incident.id)}
                      style={{
                        padding: '14px 16px',
                        backgroundColor: isSelected ? '#12203D' : '#080E1C',
                        border: `1px solid ${isSelected ? '#2563EB' : isSOS ? '#EF4444' : '#162238'}`,
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = '#0F1A30';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = '#080E1C';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 700, color: isSOS ? '#EF4444' : '#FFFFFF', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {isSOS && <AlertTriangle size={14} color="#EF4444" />}
                          {incident.title}
                        </span>
                        <SeverityBadge severity={incident.severity} />
                      </div>

                      <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '4px' }}>
                        {incident.id} · {incident.shortLocation || incident.location} · {incident.affected || 1} affected
                      </div>

                      {incident.assignedTeam && (
                        <div style={{ fontSize: '11px', color: '#10B981', marginTop: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Shield size={12} /> Dispatched: {incident.assignedTeam} {incident.eta ? `(${incident.eta})` : ''}
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11.5px',
                            color: '#3B82F6',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          View Details <ArrowRight size={13} />
                        </span>

                        {incident.status === 'Escalated' && (
                          <span style={{ fontSize: '11px', color: '#F59E0B', fontWeight: 500 }}>
                            No team available
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
