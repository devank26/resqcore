import React, { useMemo, useRef, useState } from 'react';
import {
  Plus,
  Minus,
  Crosshair,
  Shield,
  AlertTriangle,
  Key,
  Maximize2
} from 'lucide-react';
import { getDistrictCenter, parseCoord } from '../../utils/googleMapsConfig';

const TILE_SIZE = 256;

function projectLatLngToWorld(lat, lng, zoom) {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const clampedSin = Math.max(-0.9999, Math.min(0.9999, sinLat));
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function getTileUrl(mode, z, x, y) {
  const maxTile = Math.pow(2, z);
  const wrappedX = ((x % maxTile) + maxTile) % maxTile;
  if (y < 0 || y >= maxTile) return null;
  if (mode === 'satellite') {
    return {
      base: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${wrappedX}`,
      overlay: null
    };
  }
  return {
    base: `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${wrappedX}`,
    overlay: `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/${z}/${y}/${wrappedX}`
  };
}

function extractLatLng(item) {
  const coords = item?.coordinates || {};
  const lat = parseCoord(coords.latitude ?? coords.lat ?? item?.latitude ?? item?.lat, 0);
  const lng = parseCoord(coords.longitude ?? coords.lng ?? item?.longitude ?? item?.lng, 0);
  return lat && lng ? { lat, lng } : null;
}

function computeViewportForPoints(pts, width, height, fallbackCenter) {
  if (!pts || pts.length === 0) {
    return {
      center: { lat: fallbackCenter.lat, lng: fallbackCenter.lng },
      zoom: fallbackCenter.zoom || 10
    };
  }
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  pts.forEach((p) => {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  });
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  if (pts.length === 1 || (Math.abs(maxLat - minLat) < 0.008 && Math.abs(maxLng - minLng) < 0.008)) {
    return { center, zoom: 12 };
  }
  const usableW = Math.max(240, (width || 900) * 0.7);
  const usableH = Math.max(200, (height || 540) * 0.7);
  for (let z = 14; z >= 5; z--) {
    const nw = projectLatLngToWorld(maxLat, minLng, z);
    const se = projectLatLngToWorld(minLat, maxLng, z);
    if (Math.abs(se.x - nw.x) <= usableW && Math.abs(se.y - nw.y) <= usableH) {
      return { center, zoom: z };
    }
  }
  return { center, zoom: 5 };
}

export const TacticalTileMap = ({
  incidents = [],
  teams = [],
  district = 'Dehradun, Uttarakhand',
  selectedIncidentId,
  onSelectIncident,
  onVerifyIncident,
  onDispatchTeam,
  showFullControls = true,
  showTeams = true,
  showHeatmap = false,
  onOpenKeyModal,
  hasGoogleKey = false,
  fallbackReason = '',
  onTryGoogleMaps
}) => {
  const initialCenter = useMemo(() => getDistrictCenter(district), [district]);
  const [center, setCenter] = useState({ lat: initialCenter.lat, lng: initialCenter.lng });
  const [zoom, setZoom] = useState(initialCenter.zoom || 10);
  const [mapMode, setMapMode] = useState('dark'); // 'dark' | 'satellite'
  const [hudFilter, setHudFilter] = useState('all'); // 'all' | 'sos' | 'missions'
  const [hoveredId, setHoveredId] = useState(null);

  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const hasAutoFittedRef = useRef(false);
  const [containerSize, setContainerSize] = useState({ width: 900, height: 540 });
  const maxZoomAllowed = mapMode === 'dark' ? 16 : 18;

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      setContainerSize({
        width: el.clientWidth || 900,
        height: el.clientHeight || 540
      });
    };
    updateSize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', updateSize);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const centerWorld = useMemo(
    () => projectLatLngToWorld(center.lat, center.lng, zoom),
    [center.lat, center.lng, zoom]
  );

  const toScreen = (lat, lng) => {
    const pt = projectLatLngToWorld(lat, lng, zoom);
    return {
      left: containerSize.width / 2 + (pt.x - centerWorld.x),
      top: containerSize.height / 2 + (pt.y - centerWorld.y)
    };
  };

  const tiles = useMemo(() => {
    const safeZoom = Math.min(zoom, maxZoomAllowed);
    const halfW = containerSize.width / 2;
    const halfH = containerSize.height / 2;
    const cw = safeZoom === zoom ? centerWorld : projectLatLngToWorld(center.lat, center.lng, safeZoom);
    const minTileX = Math.floor((cw.x - halfW) / TILE_SIZE);
    const maxTileX = Math.floor((cw.x + halfW) / TILE_SIZE);
    const minTileY = Math.floor((cw.y - halfH) / TILE_SIZE);
    const maxTileY = Math.floor((cw.y + halfH) / TILE_SIZE);

    const list = [];
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        const urls = getTileUrl(mapMode, safeZoom, tx, ty);
        if (!urls) continue;
        list.push({
          key: `${mapMode}-${safeZoom}-${tx}-${ty}`,
          url: urls.base,
          overlayUrl: urls.overlay,
          left: containerSize.width / 2 + (tx * TILE_SIZE - cw.x),
          top: containerSize.height / 2 + (ty * TILE_SIZE - cw.y)
        });
      }
    }
    return list;
  }, [centerWorld, center.lat, center.lng, containerSize.width, containerSize.height, mapMode, zoom, maxZoomAllowed]);

  const checkSOS = (inc) => Boolean(
    inc.isCitizenSOS ||
    inc.is_citizen_sos ||
    inc.isRescueSOS ||
    inc.is_rescue_sos ||
    (typeof inc.id === 'string' && (inc.id.startsWith('RQ-') || inc.id.startsWith('SOS-') || inc.id.startsWith('CITIZEN-'))) ||
    inc.type?.toUpperCase().includes('SOS') ||
    inc.title?.toUpperCase().includes('SOS') ||
    inc.severity === 'Critical'
  );

  const checkMission = (inc) => Boolean(
    inc.status === 'Responding' ||
    inc.status === 'On site' ||
    inc.assignedTeam ||
    inc.teamAssigned
  );

  const displayIncidents = incidents.filter((inc) => {
    if (hudFilter === 'sos') return checkSOS(inc);
    if (hudFilter === 'missions') return checkMission(inc);
    return true;
  });

  const activeSosCount = incidents.filter(checkSOS).length;
  const activeMissionsCount = incidents.filter(checkMission).length;

  const collectPoints = () => {
    const pts = [];
    incidents.forEach((inc) => {
      const ll = extractLatLng(inc);
      if (ll) pts.push(ll);
    });
    if (showTeams) {
      teams.forEach((t) => {
        const ll = extractLatLng(t);
        if (ll) pts.push(ll);
      });
    }
    return pts;
  };

  React.useEffect(() => {
    if (zoom > maxZoomAllowed) {
      setZoom(maxZoomAllowed);
    }
  }, [maxZoomAllowed, zoom]);

  React.useEffect(() => {
    const selected = incidents.find((i) => i.id === selectedIncidentId);
    if (selected) {
      const ll = extractLatLng(selected);
      if (ll) {
        setCenter(ll);
        setZoom((z) => Math.max(11, Math.min(14, z)));
        hasAutoFittedRef.current = true;
        return;
      }
    }
    if (!hasAutoFittedRef.current) {
      const pts = collectPoints();
      if (pts.length > 0) {
        const vp = computeViewportForPoints(pts, containerSize.width, containerSize.height, initialCenter);
        setCenter(vp.center);
        setZoom(Math.min(vp.zoom, maxZoomAllowed));
        hasAutoFittedRef.current = true;
      }
    }
  }, [incidents, teams, selectedIncidentId, showTeams, containerSize.width, containerSize.height]);

  const handleRecenter = () => {
    const pts = collectPoints();
    const vp = computeViewportForPoints(pts, containerSize.width, containerSize.height, initialCenter);
    setCenter(vp.center);
    setZoom(Math.min(vp.zoom, maxZoomAllowed));
  };

  const handlePointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('[data-marker]')) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origLat: center.lat,
      origLng: center.lng
    };
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const origWorld = projectLatLngToWorld(dragRef.current.origLat, dragRef.current.origLng, zoom);
    const newX = origWorld.x - dx;
    const newY = origWorld.y - dy;
    const newLng = (newX / scale) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * newY) / scale;
    const newLat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    setCenter({
      lat: Math.max(-80, Math.min(80, newLat)),
      lng: Math.max(-180, Math.min(180, newLng))
    });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={(e) => {
        e.preventDefault();
        setZoom((z) => Math.max(4, Math.min(maxZoomAllowed, z + (e.deltaY < 0 ? 1 : -1))));
      }}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#050A14',
        overflow: 'hidden',
        cursor: dragRef.current ? 'grabbing' : 'grab',
        userSelect: 'none'
      }}
    >
      {/* Slippy Map Tile Layer */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {tiles.map((t) => (
          <img
            key={t.key}
            src={t.url}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: `${t.left}px`,
              top: `${t.top}px`,
              width: `${TILE_SIZE}px`,
              height: `${TILE_SIZE}px`
            }}
          />
        ))}
        {tiles.map((t) =>
          t.overlayUrl ? (
            <img
              key={`${t.key}-ref`}
              src={t.overlayUrl}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: `${t.left}px`,
                top: `${t.top}px`,
                width: `${TILE_SIZE}px`,
                height: `${TILE_SIZE}px`,
                opacity: 0.9
              }}
            />
          ) : null
        )}
      </div>

      {/* Heatmap overlay if requested */}
      {showHeatmap && (
        <svg
          width={containerSize.width}
          height={containerSize.height}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}
        >
          {displayIncidents.map((inc) => {
            const ll = extractLatLng(inc);
            if (!ll) return null;
            const pos = toScreen(ll.lat, ll.lng);
            const isCritOrHigh = inc.severity === 'Critical' || inc.severity === 'High' || checkSOS(inc);
            const affectedCount = Math.max(1, Number(inc.affected ?? inc.affectedCount ?? 1) || 1);
            const outerR = Math.round(Math.min(72, 42 + Math.log10(affectedCount) * 14));
            const innerR = Math.round(outerR * 0.46);
            const outerFill = isCritOrHigh
              ? 'rgba(239,68,68,0.18)'
              : inc.severity === 'Medium'
                ? 'rgba(245,158,11,0.16)'
                : 'rgba(59,130,246,0.14)';
            const coreFill = isCritOrHigh
              ? 'rgba(239,68,68,0.38)'
              : inc.severity === 'Medium'
                ? 'rgba(245,158,11,0.30)'
                : 'rgba(59,130,246,0.24)';
            return (
              <g key={`heat-${inc.id}`}>
                <circle cx={pos.left} cy={pos.top} r={outerR} fill={outerFill} />
                <circle cx={pos.left} cy={pos.top} r={innerR} fill={coreFill} />
              </g>
            );
          })}
        </svg>
      )}

      {/* Mission Vector Polylines */}
      <svg
        width={containerSize.width}
        height={containerSize.height}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}
      >
        {showTeams &&
          displayIncidents.map((inc) => {
            if (!checkMission(inc)) return null;
            const incLL = extractLatLng(inc);
            if (!incLL) return null;
            const assignedName = inc.assignedTeam || inc.teamAssigned;
            const team =
              teams.find(
                (t) =>
                  t.id === assignedName ||
                  t.name?.toLowerCase() === assignedName?.toLowerCase()
              ) || teams.find((t) => t.status === 'Deployed' || t.status === 'On site') || teams[0];
            const teamLL = extractLatLng(team);
            if (!teamLL) return null;
            const p1 = toScreen(teamLL.lat, teamLL.lng);
            const p2 = toScreen(incLL.lat, incLL.lng);
            return (
              <line
                key={`vec-${inc.id}`}
                x1={p1.left}
                y1={p1.top}
                x2={p2.left}
                y2={p2.top}
                stroke={selectedIncidentId === inc.id ? '#38BDF8' : '#10B981'}
                strokeWidth={selectedIncidentId === inc.id ? 3.5 : 2.5}
                strokeDasharray="6 4"
              />
            );
          })}
      </svg>

      {/* Rescue Team Markers */}
      {showTeams &&
        teams.map((team) => {
          const ll = extractLatLng(team);
          if (!ll) return null;
          const pos = toScreen(ll.lat, ll.lng);
          return (
            <div
              key={team.id}
              data-marker="true"
              title={`${team.name} · ${team.status || 'Active'}`}
              style={{
                position: 'absolute',
                left: `${pos.left}px`,
                top: `${pos.top}px`,
                transform: 'translate(-50%, -50%)',
                zIndex: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                pointerEvents: 'auto'
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: '#052E16',
                  border: '2px solid #10B981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 10px rgba(16,185,129,0.45)'
                }}
              >
                <Shield size={13} color="#10B981" />
              </div>
              <span
                style={{
                  marginTop: '3px',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(9,17,34,0.9)',
                  color: '#10B981',
                  fontSize: '10px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap'
                }}
              >
                {team.name}
              </span>
            </div>
          );
        })}

      {/* Incident & SOS Markers */}
      {displayIncidents.map((inc) => {
        const ll = extractLatLng(inc);
        if (!ll) return null;
        const pos = toScreen(ll.lat, ll.lng);
        const isSelected = selectedIncidentId === inc.id;
        const isSOS = checkSOS(inc);
        const color = isSOS
          ? '#EF4444'
          : inc.status === 'Verified' || inc.status === 'Responding'
          ? '#10B981'
          : inc.severity === 'High'
          ? '#EF4444'
          : '#F59E0B';

        return (
          <div
            key={inc.id}
            data-marker="true"
            onClick={() => onSelectIncident && onSelectIncident(inc.id)}
            onMouseEnter={() => setHoveredId(inc.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              position: 'absolute',
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              transform: 'translate(-50%, -50%)',
              zIndex: isSelected ? 25 : isSOS ? 20 : 12,
              cursor: 'pointer'
            }}
          >
            <div
              style={{
                width: isSOS ? '32px' : '26px',
                height: isSOS ? '32px' : '26px',
                borderRadius: '50%',
                backgroundColor: '#091122',
                border: `2.5px solid ${color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isSelected ? `0 0 18px ${color}` : '0 2px 8px rgba(0,0,0,0.7)'
              }}
            >
              <AlertTriangle size={isSOS ? 15 : 12} color={color} />
            </div>

            {(hoveredId === inc.id || isSelected) && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '38px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: '#0F172A',
                  border: `1.5px solid ${color}`,
                  borderRadius: '10px',
                  padding: '8px 12px',
                  minWidth: '210px',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: 600,
                  boxShadow: '0 8px 22px rgba(0,0,0,0.75)',
                  pointerEvents: isSelected ? 'auto' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <span style={{ color, fontWeight: 800 }}>{inc.id}</span>
                  <span style={{ fontSize: '10px', color: '#94A3B8' }}>{inc.status || 'Reported'}</span>
                </div>
                <div style={{ marginTop: '3px', color: '#F8FAFC', fontWeight: 700 }}>{inc.title}</div>
                {inc.assignedTeam && (
                  <div style={{ marginTop: '3px', color: '#10B981', fontSize: '10px' }}>
                    Dispatched: {inc.assignedTeam}
                  </div>
                )}
                {isSelected && (onDispatchTeam || onVerifyIncident) && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    {inc.status !== 'Verified' && inc.status !== 'Responding' && onVerifyIncident && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onVerifyIncident(inc.id);
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#1E293B',
                          border: '1px solid #38BDF8',
                          color: '#38BDF8',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Verify
                      </button>
                    )}
                    {onDispatchTeam && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDispatchTeam(inc.id);
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#DC2626',
                          border: 'none',
                          color: '#FFFFFF',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Dispatch SAR
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Top Left Mode Toggle */}
      {showFullControls && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 30
          }}
        >
          <div
            style={{
              display: 'flex',
              backgroundColor: '#0B1322',
              border: '1px solid #1E2E4B',
              borderRadius: '8px',
              padding: '3px'
            }}
          >
            <button
              onClick={() => setMapMode('dark')}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                backgroundColor: mapMode === 'dark' ? '#1E3A8A' : 'transparent',
                color: mapMode === 'dark' ? '#FFFFFF' : '#94A3B8',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Dark Map
            </button>
            <button
              onClick={() => setMapMode('satellite')}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                backgroundColor: mapMode === 'satellite' ? '#1E3A8A' : 'transparent',
                color: mapMode === 'satellite' ? '#FFFFFF' : '#94A3B8',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Satellite
            </button>
          </div>
        </div>
      )}

      {/* Top Right Key / Switch Controls */}
      {showFullControls && (
        <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 30, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {fallbackReason && (
            <span
              title={fallbackReason}
              style={{
                padding: '5px 10px',
                borderRadius: '8px',
                backgroundColor: 'rgba(11, 19, 34, 0.92)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#FBBF24',
                fontSize: '11px',
                fontWeight: 600
              }}
            >
              Google Maps quota/auth limit · Tactical Map active
            </span>
          )}
          {hasGoogleKey && onTryGoogleMaps && (
            <button
              onClick={onTryGoogleMaps}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                backgroundColor: '#0B1322',
                border: '1px solid #1E2E4B',
                color: '#10B981',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Use Google Maps
            </button>
          )}
          {onOpenKeyModal && (
            <button
              onClick={onOpenKeyModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '8px',
                backgroundColor: '#0B1322',
                border: '1px solid #1E2E4B',
                color: '#38BDF8',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Key size={13} />
              Google API Key
            </button>
          )}
        </div>
      )}

      {/* Right Zoom & Recenter */}
      {showFullControls && (
        <div
          style={{
            position: 'absolute',
            right: '16px',
            bottom: '44px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            zIndex: 30
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#0B1322',
              border: '1px solid #1E2E4B',
              borderRadius: '8px',
              overflow: 'hidden'
            }}
          >
            <button
              onClick={() => setZoom((z) => Math.min(maxZoomAllowed, z + 1))}
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                color: '#CBD5E1',
                border: 'none',
                borderBottom: '1px solid #1E2E4B',
                cursor: 'pointer'
              }}
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(4, z - 1))}
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                color: '#CBD5E1',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <Minus size={16} />
            </button>
          </div>

          <button
            onClick={handleRecenter}
            title="Recenter"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#0B1322',
              border: '1px solid #1E2E4B',
              color: '#3B82F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <Crosshair size={16} />
          </button>
        </div>
      )}

      {/* Bottom Filter Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: '14px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'rgba(9, 17, 34, 0.94)',
          border: '1px solid #1E2E4B',
          borderRadius: '9999px',
          padding: '4px 10px',
          zIndex: 30
        }}
      >
        <button
          onClick={() => setHudFilter('all')}
          style={{
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 700,
            backgroundColor: hudFilter === 'all' ? '#1E3A8A' : 'transparent',
            color: hudFilter === 'all' ? '#FFFFFF' : '#94A3B8',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          All ({incidents.length})
        </button>
        {activeSosCount > 0 && (
          <button
            onClick={() => setHudFilter('sos')}
            style={{
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 800,
              backgroundColor: hudFilter === 'sos' ? '#EF4444' : 'rgba(239,68,68,0.15)',
              color: hudFilter === 'sos' ? '#FFFFFF' : '#EF4444',
              border: '1px solid rgba(239,68,68,0.4)',
              cursor: 'pointer'
            }}
          >
            SOS ({activeSosCount})
          </button>
        )}
        {activeMissionsCount > 0 && (
          <button
            onClick={() => setHudFilter('missions')}
            style={{
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 800,
              backgroundColor: hudFilter === 'missions' ? '#10B981' : 'rgba(16,185,129,0.15)',
              color: hudFilter === 'missions' ? '#FFFFFF' : '#10B981',
              border: '1px solid rgba(16,185,129,0.4)',
              cursor: 'pointer'
            }}
          >
            Missions ({activeMissionsCount})
          </button>
        )}
        <button
          onClick={handleRecenter}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: 'transparent',
            color: '#38BDF8',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <Maximize2 size={12} /> Fit
        </button>
      </div>
    </div>
  );
};
