import React, { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import {
  TACTICAL_DARK_MAP_STYLE,
  DEFAULT_COMMAND_CENTER_LOCATION,
  getDistrictCenter,
  parseCoord,
  createTacticalMarkerIcon,
  createTeamMarkerIcon,
  createMissionBadgeIcon
} from '../../utils/googleMapsConfig';
import {
  Plus,
  Minus,
  Crosshair,
  Car,
  Layers,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Key,
  X,
  ExternalLink,
  Shield,
  Radio,
  Navigation,
  Maximize2
} from 'lucide-react';

let configuredGoogleMapsKey = null;

function fitMapBoundsSafely(map, bounds, pointCount) {
  if (!map || !bounds || bounds.isEmpty() || !window.google?.maps) return;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const latSpan = Math.abs(ne.lat() - sw.lat());
  const lngSpan = Math.abs(ne.lng() - sw.lng());

  if (pointCount <= 1 || (latSpan < 0.008 && lngSpan < 0.008)) {
    map.setCenter(bounds.getCenter());
    const curZoom = map.getZoom();
    if (!curZoom || curZoom > 15 || curZoom < 10) {
      map.setZoom(13);
    }
    return;
  }

  window.google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
    const z = map.getZoom();
    if (typeof z === 'number' && z > 15) {
      map.setZoom(15);
    }
  });
  map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
}

export const GoogleMapView = ({
  apiKey,
  incidents = [],
  teams = [],
  district = 'Dehradun, Uttarakhand',
  selectedIncidentId,
  onSelectIncident,
  showHeatmap = false,
  showFullControls = true,
  showTeams = true,
  filterMode = 'all', // 'all' | 'sos' | 'missions'
  onOpenKeyModal,
  onFallbackToTactical,
  onVerifyIncident,
  onDispatchTeam
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const trafficLayerRef = useRef(null);
  const markersRef = useRef([]);
  const missionsRef = useRef([]);
  const infoWindowRef = useRef(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [mapType, setMapType] = useState('roadmap'); // 'roadmap' | 'satellite' | 'hybrid'
  const [showTraffic, setShowTraffic] = useState(false);
  const [showLiveQuakes, setShowLiveQuakes] = useState(false);
  const [liveQuakesCount, setLiveQuakesCount] = useState(0);
  const [activeHudFilter, setActiveHudFilter] = useState('all'); // 'all' | 'sos' | 'missions'

  // Initialize Google Maps
  useEffect(() => {
    if (!apiKey || !mapContainerRef.current) return;

    let isMounted = true;
    let observer = null;
    const prevAuthFailure = window.gm_authFailure;

    const handleAuthFailure = (reason) => {
      if (!isMounted) return;
      const msg =
        reason ||
        'Google Maps rejected this API key (check Maps JavaScript API activation, Billing, and HTTP referrer restrictions in Google Cloud Console).';
      setLoadError(msg);
      if (onFallbackToTactical) {
        onFallbackToTactical(msg);
      }
    };

    window.gm_authFailure = () => handleAuthFailure();

    try {
      if (!configuredGoogleMapsKey && !window.google?.maps?.importLibrary) {
        setOptions({
          key: apiKey,
          v: 'weekly'
        });
        configuredGoogleMapsKey = apiKey;
      }

      if (mapContainerRef.current && typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(() => {
          const container = mapContainerRef.current;
          if (!container) return;
          if (container.querySelector('.gm-err-container, .gm-err-message')) {
            handleAuthFailure(
              'Google Maps rejected this API key or daily Demo Key quota was reached.'
            );
            return;
          }
          const dismissBtn = container.querySelector('.dismissButton');
          const txt = container.innerText || '';
          if (
            dismissBtn ||
            txt.includes("This page can't load Google Maps correctly") ||
            txt.includes('Oops! Something went wrong.')
          ) {
            handleAuthFailure(
              'Google Maps quota limit or billing restriction triggered for this key.'
            );
          }
        });
        observer.observe(mapContainerRef.current, { childList: true, subtree: true });
      }

      Promise.all([
        importLibrary('maps'),
        importLibrary('marker')
      ])
        .then(([mapsLib]) => {
          if (!isMounted || !mapContainerRef.current) return;

          const { Map, InfoWindow, TrafficLayer } = mapsLib;

          const centerCoords = getDistrictCenter(district);
          const map = new Map(mapContainerRef.current, {
            center: {
              lat: centerCoords.lat,
              lng: centerCoords.lng
            },
            zoom: centerCoords.zoom,
            maxZoom: 18,
            styles: mapType === 'roadmap' ? TACTICAL_DARK_MAP_STYLE : undefined,
            mapTypeId: mapType,
            disableDefaultUI: true,
            zoomControl: false,
            gestureHandling: 'greedy',
            backgroundColor: '#091122'
          });

          mapInstanceRef.current = map;
          trafficLayerRef.current = new TrafficLayer();
          infoWindowRef.current = new InfoWindow();

          setMapLoaded(true);
          setLoadError(null);
        })
        .catch((err) => {
          console.error('Google Maps Load Error:', err);
          if (isMounted) {
            handleAuthFailure(err?.message || 'Failed to load Google Maps. Check your API key.');
          }
        });
    } catch (err) {
      console.error('setOptions Error:', err);
      if (isMounted) {
        handleAuthFailure(err?.message || 'Failed to load Google Maps.');
      }
    }

    return () => {
      isMounted = false;
      observer?.disconnect();
      window.gm_authFailure = prevAuthFailure;
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
    };
  }, [apiKey]);

  // Handle Map Type Change
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    mapInstanceRef.current.setMapTypeId(mapType);
    if (mapType === 'roadmap') {
      mapInstanceRef.current.setOptions({ styles: TACTICAL_DARK_MAP_STYLE });
    } else {
      mapInstanceRef.current.setOptions({ styles: [] });
    }
  }, [mapType]);

  // Handle Traffic Layer
  useEffect(() => {
    if (!mapInstanceRef.current || !trafficLayerRef.current) return;
    if (showTraffic) {
      trafficLayerRef.current.setMap(mapInstanceRef.current);
    } else {
      trafficLayerRef.current.setMap(null);
    }
  }, [showTraffic]);

  // Expose global action handlers for InfoWindow action buttons
  useEffect(() => {
    window.__dispatchAlpha = (incidentId) => {
      if (onDispatchTeam) {
        onDispatchTeam(incidentId);
      } else {
        const team = teams.find(t => t.id === 'alpha-01') || teams.find(t => t.status === 'Standby') || teams[0];
        if (team && onSelectIncident) onSelectIncident(incidentId);
      }
    };

    window.__verifyIncident = (incidentId) => {
      if (onVerifyIncident) {
        onVerifyIncident(incidentId);
      }
    };

    return () => {
      delete window.__dispatchAlpha;
      delete window.__verifyIncident;
    };
  }, [teams, onDispatchTeam, onVerifyIncident, onSelectIncident]);

  // Update Markers, Missions and Real-time Telemetry when incidents or selectedIncidentId change
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !mapLoaded) return;

    // Clear previous markers and mission vectors
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    missionsRef.current.forEach(item => item.setMap(null));
    missionsRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();
    let hasValidBounds = false;
    let pointCount = 0;

    // Helper functions for classification
    const checkCitizenSOS = (inc) => Boolean(
      inc.isCitizenSOS ||
      inc.is_citizen_sos ||
      (typeof inc.id === 'string' && (inc.id.startsWith('RQ-') || inc.id.startsWith('SOS-') || inc.id.startsWith('CITIZEN-'))) ||
      inc.type?.toUpperCase().includes('SOS') ||
      inc.title?.toUpperCase().includes('SOS') ||
      inc.description?.toUpperCase().includes('SOS') ||
      inc.severity === 'Critical'
    );

    const checkRescueSOS = (inc) => Boolean(
      inc.isRescueSOS ||
      inc.is_rescue_sos ||
      inc.type === 'Field SOS' ||
      (typeof inc.id === 'string' && inc.id.startsWith('SOS-FIELD-')) ||
      inc.title?.toUpperCase().includes('RESCUE SOS') ||
      inc.title?.toUpperCase().includes('FIELD SOS')
    );

    const checkOngoingMission = (inc) => Boolean(
      inc.status === 'Responding' ||
      inc.status === 'On site' ||
      inc.assignedTeam ||
      inc.teamAssigned
    );

    // Filter incidents based on active map HUD filter
    const displayIncidents = incidents.filter(inc => {
      const isCitizenSOS = checkCitizenSOS(inc);
      const isRescueSOS = checkRescueSOS(inc);
      const isSOS = isCitizenSOS || isRescueSOS;
      const isMission = checkOngoingMission(inc);

      if (activeHudFilter === 'sos') return isSOS;
      if (activeHudFilter === 'missions') return isMission;
      return true;
    });

    // 1. Add Incident Markers with dedicated SOS rendering & high z-index
    displayIncidents.forEach((incident) => {
      const coords = incident.coordinates || {};
      const rawLat = coords.latitude ?? coords.lat ?? incident.latitude ?? incident.lat;
      const rawLng = coords.longitude ?? coords.lng ?? incident.longitude ?? incident.lng;
      const lat = parseCoord(rawLat);
      const lng = parseCoord(rawLng);
      if (!lat || !lng) return;

      const isSelected = selectedIncidentId === incident.id;
      const isVerified = incident.status === 'Verified' || incident.status === 'Responding' || incident.status === 'On site';
      const isCitizenSOS = checkCitizenSOS(incident);
      const isRescueSOS = checkRescueSOS(incident);
      const isSOS = isCitizenSOS || isRescueSOS;
      const isMission = checkOngoingMission(incident);

      bounds.extend({ lat, lng });
      hasValidBounds = true;
      pointCount += 1;

      if (showHeatmap && window.google.maps.Circle) {
        const isHighSeverity = isSOS || incident.severity === 'High' || incident.severity === 'Critical';
        const heatColor = isHighSeverity ? '#EF4444' : incident.severity === 'Medium' ? '#F59E0B' : '#3B82F6';
        const affectedCount = Math.max(1, Number(incident.affected ?? incident.affectedCount ?? 1) || 1);
        const radiusScale = Math.min(1.8, 1 + Math.log10(affectedCount) * 0.3);
        const outerRadius = (isSOS || incident.severity === 'Critical' ? 2800 : 1800) * radiusScale;
        const outerCircle = new window.google.maps.Circle({
          strokeOpacity: 0,
          fillColor: heatColor,
          fillOpacity: 0.18,
          map: mapInstanceRef.current,
          center: { lat, lng },
          radius: outerRadius,
          clickable: false,
          zIndex: 4
        });
        const coreCircle = new window.google.maps.Circle({
          strokeOpacity: 0,
          fillColor: heatColor,
          fillOpacity: isHighSeverity ? 0.34 : 0.25,
          map: mapInstanceRef.current,
          center: { lat, lng },
          radius: Math.round(outerRadius * 0.45),
          clickable: false,
          zIndex: 5
        });
        missionsRef.current.push(outerCircle, coreCircle);
      }

      const markerSize = isSOS ? (isSelected ? 48 : 40) : (isSelected ? 38 : 30);
      const markerAnchor = markerSize / 2;
      const markerZIndex = isSelected ? 1000 : (isSOS ? 900 : (incident.severity === 'High' ? 100 : 50));

      const marker = new window.google.maps.Marker({
        position: { lat, lng },
        map: mapInstanceRef.current,
        title: `${incident.id}: ${incident.title}`,
        icon: {
          url: createTacticalMarkerIcon(incident.severity, isVerified, isSelected, isCitizenSOS, isRescueSOS),
          scaledSize: new window.google.maps.Size(markerSize, markerSize),
          anchor: new window.google.maps.Point(markerAnchor, markerAnchor)
        },
        zIndex: markerZIndex
      });

      marker.addListener('click', () => {
        if (onSelectIncident) onSelectIncident(incident.id);

        const badgeColor = isSOS ? '#EF4444' : (isVerified ? '#10B981' : incident.severity === 'High' ? '#EF4444' : '#F59E0B');
        const badgeLabel = isRescueSOS ? '🚨 RESCUE UNIT SOS' : (isCitizenSOS ? '🚨 CITIZEN DISTRESS SOS' : (incident.severity || 'Tactical Incident'));
        const statusColor = isVerified ? '#10B981' : '#F59E0B';

        const content = `
          <div style="background-color: #0F172A; color: #FFFFFF; padding: 14px 16px; border-radius: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 260px; max-width: 320px; border: 1.5px solid ${isSOS ? '#EF4444' : isMission ? '#10B981' : '#1E293B'}; box-shadow: 0 12px 28px rgba(0,0,0,0.6);">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
              <span style="font-weight: 800; font-size: 13px; color: ${badgeColor}; letter-spacing: 0.5px;">${incident.id}</span>
              <span style="font-size: 10px; font-weight: 800; background: ${isSOS ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)'}; color: ${badgeColor}; padding: 2px 7px; border-radius: 4px; text-transform: uppercase;">${badgeLabel}</span>
            </div>
            
            <div style="font-size: 13px; font-weight: 700; color: #F8FAFC; line-height: 1.35; margin-bottom: 4px;">${incident.title}</div>
            <div style="font-size: 11px; color: #94A3B8; margin-bottom: 6px;">📍 ${incident.location || incident.fullAddress || incident.shortLocation || 'Operational Theater'}</div>

            ${incident.citizenName ? `<div style="font-size: 11px; color: #E2E8F0; margin-top: 2px;">👤 <strong>Reported by:</strong> ${incident.citizenName}</div>` : ''}
            ${incident.contactNumber ? `<div style="font-size: 11px; color: #38BDF8; margin-top: 2px;">📞 <a href="tel:${incident.contactNumber}" style="color: #38BDF8; text-decoration: underline; font-weight: 600;">${incident.contactNumber}</a></div>` : ''}
            ${incident.fieldReport ? `<div style="font-size: 11px; color: #CBD5E1; margin-top: 6px; background: rgba(15,23,42,0.9); padding: 5px 8px; border-radius: 4px; border-left: 2.5px solid ${badgeColor};">${incident.fieldReport}</div>` : ''}

            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #94A3B8; margin-top: 8px; padding-top: 6px; border-top: 1px solid #1E293B;">
              <span>👥 <strong>${incident.affected || incident.affectedCount || 1}</strong> Affected</span>
              <span style="color: ${statusColor}; font-weight: 700;">Status: ${incident.status || 'Unverified'}</span>
            </div>

            ${incident.assignedTeam ? `<div style="font-size: 11px; color: #10B981; margin-top: 6px; font-weight: 700; background: rgba(16,185,129,0.1); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(16,185,129,0.3);">🛡️ Dispatched: ${incident.assignedTeam} ${incident.eta ? `· ${incident.eta}` : ''}</div>` : ''}

            <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 5px;">
              <button onclick="window.__dispatchAlpha && window.__dispatchAlpha('${incident.id}')" style="background: linear-gradient(135deg, #DC2626, #B91C1C); color: #FFFFFF; border: none; padding: 7px 12px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer; text-align: center; letter-spacing: 0.5px; box-shadow: 0 2px 6px rgba(220,38,38,0.4);">
                🚨 DISPATCH SEARCH & RESCUE
              </button>
              ${incident.status !== 'Verified' && incident.status !== 'Responding' ? `
              <button onclick="window.__verifyIncident && window.__verifyIncident('${incident.id}')" style="background: #1E293B; color: #38BDF8; border: 1px solid #38BDF8; padding: 5px 12px; border-radius: 6px; font-weight: 600; font-size: 11px; cursor: pointer; text-align: center;">
                ✓ VERIFY EMERGENCY
              </button>` : ''}
            </div>
          </div>
        `;

        infoWindowRef.current.setContent(content);
        infoWindowRef.current.open(mapInstanceRef.current, marker);
      });

      markersRef.current.push(marker);
    });

    // 2. Add All Rescue Teams with real GPS coordinates from live telemetry
    if (showTeams) {
      teams.forEach((team) => {
        const coords = team.coordinates || {};
        const rawTeamLat = coords.latitude ?? coords.lat;
        const rawTeamLng = coords.longitude ?? coords.lng;
        const teamLat = parseCoord(rawTeamLat, 30.5593);
        const teamLng = parseCoord(rawTeamLng, 79.5644);
        if (!teamLat || !teamLng) return;

        const pos = { lat: teamLat, lng: teamLng };
        bounds.extend(pos);
        hasValidBounds = true;
        pointCount += 1;

        const batteryPct = team.battery !== undefined ? team.battery : '?';
        const batteryColor = batteryPct > 50 ? '#10B981' : batteryPct > 20 ? '#F59E0B' : '#EF4444';
        const isDeployed = team.status === 'Deployed' || team.status === 'On site';

        const teamMarker = new window.google.maps.Marker({
          position: pos,
          map: mapInstanceRef.current,
          title: `${team.name} · ${team.status || 'Active'} · Battery: ${batteryPct}%`,
          icon: {
            url: createTeamMarkerIcon(),
            scaledSize: new window.google.maps.Size(32, 32),
            anchor: new window.google.maps.Point(16, 16)
          },
          zIndex: isDeployed ? 80 : 40
        });

        teamMarker.addListener('click', () => {
          const content = `
            <div style="background-color: #0F172A; color: #FFFFFF; padding: 12px 14px; border-radius: 8px; font-family: sans-serif; min-width: 230px; border: 1px solid #10B981; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
              <div style="font-weight: 800; font-size: 13.5px; color: #10B981; display: flex; align-items: center; justify-content: space-between;">
                <span>🛡️ ${team.name}</span>
                <span style="font-size: 10px; background: rgba(16,185,129,0.2); color: #10B981; padding: 2px 6px; border-radius: 4px;">${team.status || 'Ready'}</span>
              </div>
              <div style="font-size: 11px; color: #94A3B8; margin-top: 3px;">${team.type || team.specialization || 'SAR Quick Response'} · ${team.callsign || ''}</div>
              ${team.task ? `<div style="font-size: 11px; color: #38BDF8; margin-top: 5px; font-weight: 600; background: rgba(56,189,248,0.1); padding: 4px 6px; border-radius: 4px;">🎯 Mission: ${team.task}</div>` : ''}
              <div style="font-size: 11px; color: ${batteryColor}; margin-top: 4px;">🔋 Battery: ${batteryPct}% · Signal: ${team.signal || 'Strong (4G/Radio)'}</div>
              <div style="font-size: 10.5px; color: #64748B; margin-top: 4px;">📍 GPS: ${teamLat.toFixed(4)}°N, ${teamLng.toFixed(4)}°E</div>
              ${team.commanderPhone ? `<div style="font-size: 10.5px; color: #E2E8F0; margin-top: 3px;">📞 Lead: <a href="tel:${team.commanderPhone}" style="color: #38BDF8;">${team.commanderPhone}</a></div>` : ''}
            </div>
          `;
          infoWindowRef.current.setContent(content);
          infoWindowRef.current.open(mapInstanceRef.current, teamMarker);
        });

        markersRef.current.push(teamMarker);
      });

      // 3. Render Ongoing Mission Vectors (Polylines + Directional Arrows + Midpoint Badges)
      displayIncidents.forEach((incident) => {
        if (!checkOngoingMission(incident)) return;

        const coords = incident.coordinates || {};
        const rawLat = coords.latitude ?? coords.lat ?? incident.latitude ?? incident.lat;
        const rawLng = coords.longitude ?? coords.lng ?? incident.longitude ?? incident.lng;
        const incLat = parseCoord(rawLat);
        const incLng = parseCoord(rawLng);
        if (!incLat || !incLng) return;

        // Match assigned team
        const assignedName = incident.assignedTeam || incident.teamAssigned;
        let matchedTeam = teams.find(t =>
          t.id === assignedName ||
          t.name?.toLowerCase() === assignedName?.toLowerCase() ||
          (assignedName && assignedName.toLowerCase().includes(t.name?.toLowerCase())) ||
          (t.task && t.task.includes(incident.id))
        );

        // Fallback: match first deployed team if available
        if (!matchedTeam && teams.length > 0) {
          matchedTeam = teams.find(t => t.status === 'Deployed' || t.status === 'On site') || teams[0];
        }

        if (!matchedTeam) return;

        const teamCoords = matchedTeam.coordinates || {};
        const teamLat = parseCoord(teamCoords.latitude ?? teamCoords.lat, 30.5593);
        const teamLng = parseCoord(teamCoords.longitude ?? teamCoords.lng, 79.5644);
        if (!teamLat || !teamLng) return;

        const isSelected = selectedIncidentId === incident.id;
        const strokeColor = isSelected ? '#38BDF8' : '#10B981';

        // Draw Tactical Mission Polyline
        const missionLine = new window.google.maps.Polyline({
          path: [
            { lat: teamLat, lng: teamLng },
            { lat: incLat, lng: incLng }
          ],
          geodesic: true,
          strokeColor: strokeColor,
          strokeOpacity: isSelected ? 0.95 : 0.75,
          strokeWeight: isSelected ? 4 : 3,
          icons: [
            {
              icon: {
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 2.5,
                fillColor: strokeColor,
                fillOpacity: 0.9,
                strokeColor: '#091122',
                strokeWeight: 1
              },
              offset: '50%',
              repeat: '90px'
            }
          ],
          map: mapInstanceRef.current,
          zIndex: isSelected ? 70 : 30
        });

        // Click handler for mission vector
        missionLine.addListener('click', () => {
          if (onSelectIncident) onSelectIncident(incident.id);
          const midLat = (teamLat + incLat) / 2;
          const midLng = (teamLng + incLng) / 2;
          const content = `
            <div style="background-color: #091224; color: #FFFFFF; padding: 12px 14px; border-radius: 8px; font-family: sans-serif; min-width: 240px; border: 1.5px solid #10B981; box-shadow: 0 8px 24px rgba(0,0,0,0.6);">
              <div style="font-weight: 800; font-size: 13px; color: #10B981;">🛡️ ONGOING MISSION VECTOR</div>
              <div style="font-size: 12px; color: #F8FAFC; margin-top: 4px; font-weight: 600;">${matchedTeam.name} ➔ ${incident.id}</div>
              <div style="font-size: 11px; color: #94A3B8; margin-top: 2px;">Target: ${incident.title}</div>
              <div style="font-size: 11px; color: #38BDF8; margin-top: 4px; font-weight: 700;">⏱️ Response: ${incident.eta || matchedTeam.eta || 'ETA 8-12 min'}</div>
              <div style="font-size: 10px; color: #64748B; margin-top: 4px;">Status: ${incident.status} · Team deployed</div>
            </div>
          `;
          infoWindowRef.current.setContent(content);
          infoWindowRef.current.setPosition({ lat: midLat, lng: midLng });
          infoWindowRef.current.open(mapInstanceRef.current);
        });

        missionsRef.current.push(missionLine);

        // Mission Midpoint Badge
        const midLat = (teamLat + incLat) / 2;
        const midLng = (teamLng + incLng) / 2;
        const badgeLabel = `${matchedTeam.name} ➔ ${incident.id} (${incident.eta || 'En Route'})`;

        const badgeMarker = new window.google.maps.Marker({
          position: { lat: midLat, lng: midLng },
          map: mapInstanceRef.current,
          icon: {
            url: createMissionBadgeIcon(badgeLabel, isSelected),
            scaledSize: new window.google.maps.Size(Math.max(badgeLabel.length * 7 + 34, 110), 24),
            anchor: new window.google.maps.Point(Math.max(badgeLabel.length * 7 + 34, 110) / 2, 12)
          },
          zIndex: isSelected ? 75 : 35
        });

        badgeMarker.addListener('click', () => {
          if (onSelectIncident) onSelectIncident(incident.id);
        });

        missionsRef.current.push(badgeMarker);
      });
    }

    // 4. Center or Auto-Fit
    const selected = incidents.find(i => i.id === selectedIncidentId);
    if (selected) {
      const coords = selected.coordinates || {};
      const rawLat = coords.latitude ?? coords.lat ?? selected.latitude ?? selected.lat;
      const rawLng = coords.longitude ?? coords.lng ?? selected.longitude ?? selected.lng;
      const lat = parseCoord(rawLat);
      const lng = parseCoord(rawLng);
      if (lat && lng && mapInstanceRef.current) {
        mapInstanceRef.current.panTo({ lat, lng });
        const curZoom = mapInstanceRef.current.getZoom();
        if (!curZoom || curZoom > 15 || curZoom < 10) {
          mapInstanceRef.current.setZoom(13);
        }
      }
    } else if (hasValidBounds && mapInstanceRef.current) {
      fitMapBoundsSafely(mapInstanceRef.current, bounds, pointCount);
    }
  }, [incidents, teams, selectedIncidentId, mapLoaded, showTeams, activeHudFilter, showHeatmap]);

  // Real-Time USGS Earthquakes live layer
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !mapLoaded || !showLiveQuakes) return;

    let quakeMarkers = [];
    fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson')
      .then(res => res.json())
      .then(data => {
        if (!data || !data.features) return;
        setLiveQuakesCount(data.features.length);

        data.features.forEach((feature) => {
          const [lng, lat, depth] = feature.geometry.coordinates;
          const mag = feature.properties.mag || 1;
          const place = feature.properties.place;

          const circle = new window.google.maps.Circle({
            strokeColor: '#EF4444',
            strokeOpacity: 0.8,
            strokeWeight: 1,
            fillColor: '#EF4444',
            fillOpacity: 0.35,
            map: mapInstanceRef.current,
            center: { lat, lng },
            radius: Math.max(mag * 25000, 10000)
          });

          circle.addListener('click', () => {
            const content = `
              <div style="background-color: #0F172A; color: #FFFFFF; padding: 10px 14px; border-radius: 8px; font-family: sans-serif; min-width: 200px; border: 1px solid #EF4444;">
                <div style="font-weight: 700; font-size: 13px; color: #EF4444;">⚠️ USGS Earthquake: M${mag.toFixed(1)}</div>
                <div style="font-size: 11px; color: #CBD5E1; margin-top: 2px;">${place}</div>
                <div style="font-size: 11px; color: #94A3B8; margin-top: 4px;">Depth: ${depth} km · Live USGS Feed</div>
              </div>
            `;
            infoWindowRef.current.setContent(content);
            infoWindowRef.current.setPosition({ lat, lng });
            infoWindowRef.current.open(mapInstanceRef.current);
          });

          quakeMarkers.push(circle);
        });
      })
      .catch(err => console.warn('USGS feed fetch error:', err));

    return () => {
      quakeMarkers.forEach(c => c.setMap(null));
      quakeMarkers = [];
    };
  }, [showLiveQuakes, mapLoaded]);

  // Count active SOS and ongoing missions
  const checkCitizenSOS = (inc) => Boolean(
    inc.isCitizenSOS ||
    inc.is_citizen_sos ||
    (typeof inc.id === 'string' && (inc.id.startsWith('RQ-') || inc.id.startsWith('SOS-') || inc.id.startsWith('CITIZEN-'))) ||
    inc.type?.toUpperCase().includes('SOS') ||
    inc.title?.toUpperCase().includes('SOS') ||
    inc.description?.toUpperCase().includes('SOS') ||
    inc.severity === 'Critical'
  );

  const checkRescueSOS = (inc) => Boolean(
    inc.isRescueSOS ||
    inc.is_rescue_sos ||
    inc.type === 'Field SOS' ||
    (typeof inc.id === 'string' && inc.id.startsWith('SOS-FIELD-')) ||
    inc.title?.toUpperCase().includes('RESCUE SOS') ||
    inc.title?.toUpperCase().includes('FIELD SOS')
  );

  const checkOngoingMission = (inc) => Boolean(
    inc.status === 'Responding' ||
    inc.status === 'On site' ||
    inc.assignedTeam ||
    inc.teamAssigned
  );

  const activeSosCount = incidents.filter(i => checkCitizenSOS(i) || checkRescueSOS(i)).length;
  const activeMissionsCount = incidents.filter(checkOngoingMission).length;

  const centerCoords = getDistrictCenter(district);

  // Recenter Map & Fit All Markers
  const handleRecenter = () => {
    if (!mapInstanceRef.current || !window.google) return;
    const bounds = new window.google.maps.LatLngBounds();
    let count = 0;

    incidents.forEach(inc => {
      const coords = inc.coordinates || {};
      const lat = parseCoord(coords.latitude ?? coords.lat ?? inc.latitude ?? inc.lat);
      const lng = parseCoord(coords.longitude ?? coords.lng ?? inc.longitude ?? inc.lng);
      if (lat && lng) {
        bounds.extend({ lat, lng });
        count++;
      }
    });

    if (showTeams) {
      teams.forEach(t => {
        const coords = t.coordinates || {};
        const lat = parseCoord(coords.latitude ?? coords.lat);
        const lng = parseCoord(coords.longitude ?? coords.lng);
        if (lat && lng) {
          bounds.extend({ lat, lng });
          count++;
        }
      });
    }

    if (count > 0 && !bounds.isEmpty()) {
      fitMapBoundsSafely(mapInstanceRef.current, bounds, count);
    } else {
      const centerCoords = getDistrictCenter(district);
      mapInstanceRef.current.setCenter({
        lat: centerCoords.lat,
        lng: centerCoords.lng
      });
      mapInstanceRef.current.setZoom(centerCoords.zoom);
    }
  };

  const handleZoom = (delta) => {
    if (!mapInstanceRef.current) return;
    const current = mapInstanceRef.current.getZoom() || 12;
    mapInstanceRef.current.setZoom(current + delta);
  };

  const handleFocusSOS = () => {
    setActiveHudFilter('sos');
    const firstSOS = incidents.find(i => checkCitizenSOS(i) || checkRescueSOS(i));
    if (firstSOS && mapInstanceRef.current) {
      const coords = firstSOS.coordinates || {};
      const lat = parseCoord(coords.latitude ?? coords.lat ?? firstSOS.latitude ?? firstSOS.lat);
      const lng = parseCoord(coords.longitude ?? coords.lng ?? firstSOS.longitude ?? firstSOS.lng);
      if (lat && lng) {
        mapInstanceRef.current.panTo({ lat, lng });
        mapInstanceRef.current.setZoom(14);
        if (onSelectIncident) onSelectIncident(firstSOS.id);
      }
    }
  };

  const handleFocusMissions = () => {
    setActiveHudFilter('missions');
    const firstMission = incidents.find(checkOngoingMission);
    if (firstMission && mapInstanceRef.current) {
      const coords = firstMission.coordinates || {};
      const lat = parseCoord(coords.latitude ?? coords.lat ?? firstMission.latitude ?? firstMission.lat);
      const lng = parseCoord(coords.longitude ?? coords.lng ?? firstMission.longitude ?? firstMission.lng);
      if (lat && lng) {
        mapInstanceRef.current.panTo({ lat, lng });
        mapInstanceRef.current.setZoom(13);
        if (onSelectIncident) onSelectIncident(firstMission.id);
      }
    }
  };

  if (loadError) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#050A14',
          color: '#EF4444',
          padding: '24px',
          textAlign: 'center'
        }}
      >
        <AlertTriangle size={36} color="#EF4444" style={{ marginBottom: '12px' }} />
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>Google Maps Load Error</h3>
        <p style={{ fontSize: '13px', color: '#94A3B8', maxWidth: '420px', marginTop: '6px' }}>
          {loadError}
        </p>
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {onFallbackToTactical && (
            <button
              onClick={() => onFallbackToTactical(loadError)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#10B981',
                color: '#03120B',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Use Live Tactical Map (No Key Needed)
            </button>
          )}
          <button
            onClick={onOpenKeyModal}
            style={{
              padding: '8px 16px',
              backgroundColor: '#1E3A8A',
              color: '#FFFFFF',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <Key size={14} /> Update Google Maps API Key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Google Maps Render Canvas */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', backgroundColor: '#050A14' }} />

      {/* Top Left: Map Mode & Traffic Toggle */}
      {showFullControls && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 10,
            flexWrap: 'wrap'
          }}
        >
          {/* Layer Selector */}
          <div
            style={{
              display: 'flex',
              backgroundColor: '#0B1322',
              border: '1px solid #1E2E4B',
              borderRadius: '8px',
              padding: '3px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
          >
            <button
              onClick={() => setMapType('roadmap')}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                backgroundColor: mapType === 'roadmap' ? '#1E3A8A' : 'transparent',
                color: mapType === 'roadmap' ? '#FFFFFF' : '#94A3B8'
              }}
            >
              Dark Map
            </button>
            <button
              onClick={() => setMapType('satellite')}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                backgroundColor: mapType === 'satellite' ? '#1E3A8A' : 'transparent',
                color: mapType === 'satellite' ? '#FFFFFF' : '#94A3B8'
              }}
            >
              Satellite
            </button>
            <button
              onClick={() => setMapType('hybrid')}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                backgroundColor: mapType === 'hybrid' ? '#1E3A8A' : 'transparent',
                color: mapType === 'hybrid' ? '#FFFFFF' : '#94A3B8'
              }}
            >
              Hybrid
            </button>
          </div>

          {/* Real-Time Traffic Toggle */}
          <button
            onClick={() => setShowTraffic(!showTraffic)}
            title="Toggle Live Traffic Layer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              backgroundColor: showTraffic ? 'rgba(239, 68, 68, 0.2)' : '#0B1322',
              border: showTraffic ? '1px solid #EF4444' : '1px solid #1E2E4B',
              color: showTraffic ? '#EF4444' : '#94A3B8',
              fontSize: '12px',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              cursor: 'pointer'
            }}
          >
            <Car size={14} />
            Live Traffic
          </button>

          {/* Real-Time USGS Earthquakes Toggle */}
          <button
            onClick={() => setShowLiveQuakes(!showLiveQuakes)}
            title="Toggle Real-time USGS Earthquakes feed"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              backgroundColor: showLiveQuakes ? 'rgba(245, 158, 11, 0.2)' : '#0B1322',
              border: showLiveQuakes ? '1px solid #F59E0B' : '1px solid #1E2E4B',
              color: showLiveQuakes ? '#F59E0B' : '#94A3B8',
              fontSize: '12px',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              cursor: 'pointer'
            }}
          >
            <Activity size={14} />
            {showLiveQuakes ? `USGS Quakes (${liveQuakesCount})` : 'Live Quakes'}
          </button>
        </div>
      )}

      {/* Top Right: Google Maps API Key Config Icon */}
      {showFullControls && (
        <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10 }}>
          <button
            onClick={onOpenKeyModal}
            title="Configure Google Maps API Key"
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
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
          >
            <Key size={13} />
            Google API Key
          </button>
        </div>
      )}

      {/* Right Zoom & Recenter Controls */}
      {showFullControls && (
        <div
          style={{
            position: 'absolute',
            right: '16px',
            bottom: '44px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            zIndex: 10
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
              onClick={() => handleZoom(1)}
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                color: '#CBD5E1',
                borderBottom: '1px solid #1E2E4B'
              }}
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => handleZoom(-1)}
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                color: '#CBD5E1'
              }}
            >
              <Minus size={16} />
            </button>
          </div>

          <button
            onClick={handleRecenter}
            title="Recenter to Command Center"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#0B1322',
              border: '1px solid #1E2E4B',
              color: '#3B82F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Crosshair size={16} />
          </button>
        </div>
      )}

      {/* Bottom Center: Tactical Missions & SOS Filter Bar */}
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
          backdropFilter: 'blur(10px)',
          border: '1px solid #1E2E4B',
          borderRadius: '9999px',
          padding: '4px 8px',
          zIndex: 10,
          boxShadow: '0 6px 20px rgba(0,0,0,0.6)'
        }}
      >
        <button
          onClick={() => setActiveHudFilter('all')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 700,
            backgroundColor: activeHudFilter === 'all' ? '#1E3A8A' : 'transparent',
            color: activeHudFilter === 'all' ? '#FFFFFF' : '#94A3B8',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <span>📍 All</span>
          <span style={{ fontSize: '10px', opacity: 0.8 }}>({incidents.length})</span>
        </button>

        {activeSosCount > 0 && (
          <button
            onClick={handleFocusSOS}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 800,
              backgroundColor: activeHudFilter === 'sos' ? '#EF4444' : 'rgba(239, 68, 68, 0.15)',
              color: activeHudFilter === 'sos' ? '#FFFFFF' : '#EF4444',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              cursor: 'pointer'
            }}
          >
            <AlertTriangle size={12} />
            <span>SOS DISTRESS</span>
            <span style={{ background: '#EF4444', color: '#FFF', borderRadius: '50%', padding: '0 5px', fontSize: '9px' }}>{activeSosCount}</span>
          </button>
        )}

        {activeMissionsCount > 0 && (
          <button
            onClick={handleFocusMissions}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 800,
              backgroundColor: activeHudFilter === 'missions' ? '#10B981' : 'rgba(16, 185, 129, 0.15)',
              color: activeHudFilter === 'missions' ? '#FFFFFF' : '#10B981',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              cursor: 'pointer'
            }}
          >
            <Shield size={12} />
            <span>MISSIONS</span>
            <span style={{ background: '#10B981', color: '#FFF', borderRadius: '50%', padding: '0 5px', fontSize: '9px' }}>{activeMissionsCount}</span>
          </button>
        )}

        <button
          onClick={handleRecenter}
          title="Fit view to all active markers"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: 'transparent',
            color: '#38BDF8',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <Maximize2 size={12} />
          <span>Fit View</span>
        </button>
      </div>

      {/* Bottom Severity Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: '14px',
          left: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          backgroundColor: 'rgba(7, 12, 22, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #16243E',
          borderRadius: '9999px',
          padding: '6px 14px',
          zIndex: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#CBD5E1' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
          High
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#CBD5E1' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#F59E0B' }} />
          Medium
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#CBD5E1' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#38BDF8' }} />
          Info
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#CBD5E1' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10B981' }} />
          Deployed Team
        </div>
      </div>
    </div>
  );
};
