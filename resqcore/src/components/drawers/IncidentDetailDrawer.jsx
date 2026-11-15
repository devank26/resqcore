import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Clock,
  Users,
  MapPin,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SeverityBadge, StatusBadge } from '../common/Badge';

export const IncidentDetailDrawer = () => {
  const {
    isDrawerOpen,
    setIsDrawerOpen,
    selectedIncident,
    teams,
    verifyIncident,
    assignTeamToIncident,
    updateIncidentStatus
  } = useApp();
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [etaInput, setEtaInput] = useState('15 min');
  const [dispatching, setDispatching] = useState(false);

  if (!isDrawerOpen || !selectedIncident) return null;

  const isEscalated = selectedIncident.status === 'Escalated';
  const isResolved = selectedIncident.status === 'Resolved';
  const isUnverified = selectedIncident.status === 'Unverified';
  const hasAssignedTeam = Boolean(selectedIncident.assignedTeam && selectedIncident.assignedTeam !== 'Unassigned');
  const isVerifiedAwaitingDispatch = !isUnverified && !isEscalated && !isResolved && !hasAssignedTeam;
  const isTeamAssigned = !isUnverified && !isEscalated && !isResolved && hasAssignedTeam;
  const assignedTeamObj = teams.find(
    (t) =>
      (selectedIncident.assignedTeamId && t.id === selectedIncident.assignedTeamId) ||
      t.name === selectedIncident.assignedTeam
  );
  const availableTeams = teams.filter((t) => t.status === 'Available' || t.status === 'Standby');
  const effectiveSelectedTeamId =
    selectedTeamId && availableTeams.some((t) => t.id === selectedTeamId)
      ? selectedTeamId
      : availableTeams[0]?.id || '';

  return (
    <div
      className="animate-slide-up"
      style={{
        width: '380px',
        minWidth: '380px',
        height: '100%',
        backgroundColor: '#0D1527',
        borderLeft: '1px solid #1A263D',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        position: 'relative',
        zIndex: 45
      }}
    >
      {/* Drawer Header */}
      <div
        style={{
          padding: '20px 22px 16px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #16243E'
        }}
      >
        <h3
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: '#FFFFFF'
          }}
        >
          Incident Details
        </h3>
        <button
          onClick={() => setIsDrawerOpen(false)}
          style={{
            background: 'transparent',
            color: '#64748B',
            padding: '4px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
        >
          <X size={18} />
        </button>
      </div>

      {/* Drawer Content */}
      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '18px', flex: 1 }}>
        {/* Incident ID & Severity Header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#3B82F6' }}>
              {selectedIncident.id}
            </span>
            <SeverityBadge severity={selectedIncident.severity} />
          </div>

          <h2
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '-0.3px',
              lineHeight: 1.2
            }}
          >
            {selectedIncident.title}
          </h2>

          <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: '4px' }}>
            {selectedIncident.location}
          </p>
        </div>

        {/* Incident Photo Preview */}
        {selectedIncident.image && (
          <div
            style={{
              width: '100%',
              height: '140px',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1px solid #1E2D4A',
              backgroundColor: '#09101E',
              position: 'relative'
            }}
          >
            <img
              src={selectedIncident.image}
              alt={selectedIncident.title}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                backgroundColor: 'rgba(5, 10, 20, 0.75)',
                backdropFilter: 'blur(4px)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                color: '#CBD5E1',
                fontWeight: 600
              }}
            >
              LIVE FIELD UPLOAD
            </div>
          </div>
        )}

        {/* Affected & Reported At Stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            padding: '14px 16px',
            backgroundColor: '#091122',
            borderRadius: '10px',
            border: '1px solid #16243E'
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
              People affected
            </div>
            <div
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: '#FFFFFF',
                marginTop: '2px'
              }}
            >
              {selectedIncident.affected}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
              Reported at
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#F1F5F9',
                marginTop: '4px'
              }}
            >
              {selectedIncident.time}
            </div>
          </div>
        </div>

        {/* Description / Narrative */}
        <div style={{ fontSize: '13px', color: '#CBD5E1', lineHeight: '1.5' }}>
          {selectedIncident.description}
        </div>

        {/* Field report & coordinates */}
        <div
          style={{
            fontSize: '11.5px',
            color: '#64748B',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px'
          }}
        >
          <div>{selectedIncident.fieldReport}</div>
          {selectedIncident.coordinates && (
            <div className="mono">
              {selectedIncident.coordinates.lat}, {selectedIncident.coordinates.lng}
            </div>
          )}
        </div>

        {/* Citizen / field requested resources */}
        {Array.isArray(selectedIncident.requestedResources) && selectedIncident.requestedResources.length > 0 && (
          <div
            style={{
              backgroundColor: '#0A1324',
              border: '1px solid #1E2E4C',
              borderRadius: '10px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Requested Resources
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {selectedIncident.requestedResources.map((res, idx) => (
                <span
                  key={res.resourceId || res.name || idx}
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: '#E2E8F0',
                    backgroundColor: '#13223D',
                    border: '1px solid #2563EB55',
                    borderRadius: '999px',
                    padding: '4px 10px'
                  }}
                >
                  {res.name || res.resourceId} × {res.quantity}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* STATUS ACTIONS & ASSIGNED CARDS */}
        <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
          {/* STATE A: UNVERIFIED */}
          {isUnverified && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <StatusBadge status="Unverified" />
              </div>

              <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                Confirm the field report to initiate response.
              </div>

              <button
                onClick={() => verifyIncident(selectedIncident.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '14px',
                  boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3B82F6')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563EB')}
              >
                <ShieldCheck size={18} />
                <span>Verify incident</span>
              </button>
            </div>
          )}

          {/* STATE B1: VERIFIED · AWAITING TEAM ASSIGNMENT */}
          {isVerifiedAwaitingDispatch && (
            <div
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <StatusBadge status={selectedIncident.status} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#93C5FD' }}>
                    Awaiting Team Dispatch
                  </span>
                </div>
              </div>

              {availableTeams.length > 0 ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>
                      Select Available Rescue Team ({availableTeams.length})
                    </label>
                    <select
                      value={effectiveSelectedTeamId}
                      onChange={(e) => setSelectedTeamId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: '8px',
                        backgroundColor: '#091122',
                        border: '1px solid #1E2E4B',
                        color: '#FFFFFF',
                        fontSize: '13px',
                        fontWeight: 600
                      }}
                    >
                      {availableTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name} · {team.specialization || 'SAR'} ({team.responders || 4} resp)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>
                      Estimated Time of Arrival (ETA)
                    </label>
                    <input
                      type="text"
                      value={etaInput}
                      onChange={(e) => setEtaInput(e.target.value)}
                      placeholder="15 min"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: '#091122',
                        border: '1px solid #1E2E4B',
                        color: '#FFFFFF',
                        fontSize: '13px'
                      }}
                    />
                  </div>

                  <button
                    disabled={dispatching || !effectiveSelectedTeamId}
                    onClick={async () => {
                      if (!effectiveSelectedTeamId) return;
                      setDispatching(true);
                      try {
                        await assignTeamToIncident(effectiveSelectedTeamId, selectedIncident.id, etaInput);
                      } finally {
                        setDispatching(false);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '11px',
                      borderRadius: '10px',
                      backgroundColor: '#2563EB',
                      color: '#FFFFFF',
                      fontWeight: 600,
                      fontSize: '13.5px',
                      opacity: dispatching ? 0.7 : 1
                    }}
                  >
                    <Users size={16} />
                    <span>{dispatching ? 'Dispatching Team...' : 'Assign & Dispatch Team'}</span>
                  </button>
                </>
              ) : (
                <div style={{ fontSize: '12px', color: '#CBD5E1', lineHeight: '1.45' }}>
                  {teams.length === 0
                    ? 'No active rescue teams online yet. Sign in on the Rescue Team App to register a live team.'
                    : `All ${teams.length} registered teams are currently deployed on other missions.`}
                </div>
              )}
            </div>
          )}

          {/* STATE B2: TEAM ASSIGNED / RESPONDING / ON SITE */}
          {isTeamAssigned && (
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <StatusBadge status={selectedIncident.status} />
                {selectedIncident.eta && (
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#34D399' }}>
                    ETA {selectedIncident.eta}
                  </span>
                )}
              </div>

              <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
                Team assigned · {selectedIncident.assignedTeam}
              </div>

              <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                {assignedTeamObj
                  ? `${assignedTeamObj.specialization || 'Search & Rescue'} · ${assignedTeamObj.responders || 4} responders · ${assignedTeamObj.status}`
                  : (selectedIncident.substatus || 'Unit dispatched and en route')}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                {selectedIncident.status !== 'On site' && (
                  <button
                    onClick={() => updateIncidentStatus(selectedIncident.id, 'On site', `${selectedIncident.assignedTeam} arrived on site`)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(59, 130, 246, 0.16)',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                      color: '#93C5FD',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                  >
                    Mark On site
                  </button>
                )}
                <button
                  onClick={() => updateIncidentStatus(selectedIncident.id, 'Resolved', `Resolved by ${selectedIncident.assignedTeam}`)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(16, 185, 129, 0.18)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#6EE7B7',
                    fontSize: '12px',
                    fontWeight: 600
                  }}
                >
                  Mark Resolved
                </button>
              </div>
            </div>
          )}

          {/* STATE B3: RESOLVED */}
          {isResolved && (
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
                padding: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <CheckCircle size={16} color="#10B981" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#10B981' }}>
                  Incident Resolved
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#CBD5E1' }}>
                {selectedIncident.assignedTeam
                  ? `Completed by ${selectedIncident.assignedTeam}. Team and allocated resources released.`
                  : 'Operation completed and closed.'}
              </div>
            </div>
          )}

          {/* STATE C: ESCALATED */}
          {isEscalated && (
            <div
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '12px',
                padding: '16px'
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#F59E0B' }}>
                No team available - escalated
              </div>

              <div style={{ fontSize: '12.5px', color: '#CBD5E1', marginTop: '6px', lineHeight: '1.4' }}>
                {selectedIncident.escalationNote || 'District response notified. Awaiting technical rescue support.'}
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer note */}
        <div
          style={{
            fontSize: '11px',
            color: '#475569',
            marginTop: '8px',
            textAlign: 'center'
          }}
        >
          Updated just now · All times in IST
        </div>
      </div>
    </div>
  );
};
