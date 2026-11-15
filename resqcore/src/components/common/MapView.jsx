import React, { useState, useEffect } from 'react';
import {
  getGoogleMapsApiKey,
  hasGoogleMapsApiKeyOverride,
  setGoogleMapsApiKeyOverride,
  clearGoogleMapsApiKeyOverride,
  getGoogleMapsSessionError,
  markGoogleMapsSessionError,
  clearGoogleMapsSessionError
} from '../../utils/apiConfig';
import {
  Key,
  ExternalLink,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { GoogleMapView } from './GoogleMapView';
import { TacticalTileMap } from './TacticalTileMap';

export const MapView = ({
  height = '100%',
  showDetailsOnClick = true,
  showHeatmap = false,
  showFullControls = true,
  incidents: propIncidents,
  teams: propTeams,
  showTeams = true,
  filterMode = 'all'
}) => {
  const {
    incidents,
    selectedIncidentId,
    setSelectedIncidentId,
    inspectIncident,
    verifyIncident,
    assignTeamToIncident,
    teams,
    isDemoMode,
    user
  } = useApp();

  const googleApiKey = getGoogleMapsApiKey();
  const initialSessionError = getGoogleMapsSessionError(googleApiKey);
  const [useGoogleMaps, setUseGoogleMaps] = useState(
    Boolean(googleApiKey) && !initialSessionError
  );
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState(initialSessionError);
  const [customKeyInput, setCustomKeyInput] = useState(googleApiKey);

  const shouldRenderGoogleMaps = useGoogleMaps && Boolean(googleApiKey);

  const handleDispatchTeam = (incidentId) => {
    const team = teams.find(t => t.id === 'alpha-01') || teams.find(t => t.status === 'Standby') || teams[0];
    if (team) assignTeamToIncident(team.id, incidentId);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: height,
        backgroundColor: '#050A14',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid #16243E',
        userSelect: 'none'
      }}
    >
      {/* Interactive Google Maps view when a valid API key is active */}
      {shouldRenderGoogleMaps ? (
        <GoogleMapView
          apiKey={googleApiKey}
          incidents={propIncidents || incidents}
          teams={propTeams || teams}
          district={isDemoMode ? 'Ernakulam, Kerala' : (user?.district || 'Dehradun, Uttarakhand')}
          selectedIncidentId={selectedIncidentId}
          onSelectIncident={(id) => {
            setSelectedIncidentId(id);
            if (showDetailsOnClick) inspectIncident(id);
          }}
          onVerifyIncident={verifyIncident}
          onDispatchTeam={handleDispatchTeam}
          showHeatmap={showHeatmap}
          showFullControls={showFullControls}
          showTeams={showTeams}
          filterMode={filterMode}
          onOpenKeyModal={() => setShowKeyModal(true)}
          onFallbackToTactical={(errMsg) => {
            const msg = errMsg || 'Google Maps API key rejected or quota exceeded.';
            markGoogleMapsSessionError(googleApiKey, msg);
            setGoogleAuthError(msg);
            setUseGoogleMaps(false);
          }}
        />
      ) : (
        <TacticalTileMap
          incidents={propIncidents || incidents}
          teams={propTeams || teams}
          district={isDemoMode ? 'Ernakulam, Kerala' : (user?.district || 'Dehradun, Uttarakhand')}
          selectedIncidentId={selectedIncidentId}
          onSelectIncident={(id) => {
            setSelectedIncidentId(id);
            if (showDetailsOnClick) inspectIncident(id);
          }}
          onVerifyIncident={verifyIncident}
          onDispatchTeam={handleDispatchTeam}
          showHeatmap={showHeatmap}
          showFullControls={showFullControls}
          showTeams={showTeams}
          hasGoogleKey={Boolean(googleApiKey)}
          fallbackReason={googleAuthError}
          onTryGoogleMaps={() => {
            clearGoogleMapsSessionError();
            setGoogleAuthError('');
            setUseGoogleMaps(true);
          }}
          onOpenKeyModal={() => setShowKeyModal(true)}
        />
      )}

      {/* Google Maps API Key Setup Modal */}
      {showKeyModal && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(3, 7, 18, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px'
          }}
        >
          <div
            style={{
              backgroundColor: '#0B1322',
              border: '1px solid #1E2E4B',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} color="#38BDF8" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>
                  Google Maps API Setup
                </h3>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748B',
                  cursor: 'pointer'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: '12px', lineHeight: '1.5' }}>
              Google Maps reads <code style={{ color: '#38BDF8' }}>VITE_GOOGLE_MAPS_API_KEY</code> or an optional browser override below. Both <strong>Maps JavaScript API</strong> and <strong>Billing</strong> must be enabled in Google Cloud Console.
            </p>

            {googleAuthError && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#FCA5A5',
                  fontSize: '12px',
                  lineHeight: '1.4'
                }}
              >
                {googleAuthError}
              </div>
            )}

            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', fontSize: '11.5px', color: '#CBD5E1', marginBottom: '6px', fontWeight: 600 }}>
                Google Maps API Key
              </label>
              <input
                type="text"
                value={customKeyInput}
                onChange={(e) => setCustomKeyInput(e.target.value)}
                placeholder="Paste AIza... API key with Maps JavaScript API enabled"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  backgroundColor: '#050A14',
                  border: '1px solid #1E2E4B',
                  color: '#FFFFFF',
                  fontSize: '12.5px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(56, 189, 248, 0.05)',
                border: '1px solid rgba(56, 189, 248, 0.15)',
                fontSize: '12px',
                color: '#94A3B8',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              <span>
                Status:{' '}
                <strong style={{ color: googleAuthError ? '#EF4444' : (googleApiKey ? '#10B981' : '#F59E0B') }}>
                  {googleAuthError
                    ? 'Key rejected by Google Cloud (using live Dark/Satellite map)'
                    : googleApiKey
                    ? (hasGoogleMapsApiKeyOverride() ? 'Custom browser key active' : 'Configured via VITE_GOOGLE_MAPS_API_KEY')
                    : 'Not configured (using live Dark/Satellite map)'}
                </strong>
              </span>
              <span style={{ color: '#38BDF8', fontWeight: 600 }}>
                Required: Maps JavaScript API + Billing enabled
              </span>
              <a
                href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com"
                target="_blank"
                rel="noreferrer"
                style={{
                  color: '#60A5FA',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '4px',
                  textDecoration: 'underline'
                }}
              >
                Enable Maps JavaScript API <ExternalLink size={12} />
              </a>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '18px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setUseGoogleMaps(false);
                  setShowKeyModal(false);
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'transparent',
                  border: '1px solid #1E2E4B',
                  color: '#94A3B8',
                  fontSize: '12.5px',
                  cursor: 'pointer'
                }}
              >
                Use Live Tactical Map
              </button>
              {hasGoogleMapsApiKeyOverride() && (
                <button
                  onClick={() => {
                    clearGoogleMapsApiKeyOverride();
                    window.location.reload();
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    border: '1px solid #334155',
                    color: '#CBD5E1',
                    fontSize: '12.5px',
                    cursor: 'pointer'
                  }}
                >
                  Reset to Env Key
                </button>
              )}
              <button
                onClick={() => {
                  setGoogleMapsApiKeyOverride(customKeyInput);
                  window.location.reload();
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#1E3A8A',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Save & Apply Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
