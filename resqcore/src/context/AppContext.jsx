import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  initialIncidents,
  initialTeams,
  initialMessages,
  initialAlerts,
  initialCameras
} from '../data/initialData';
import {
  apiUrl,
  wsUrl,
  getStoredToken,
  setStoredToken,
  clearStoredToken
} from '../utils/apiConfig';

const ENV_COMMAND_TOKEN = (import.meta.env.VITE_COMMAND_TOKEN || '').trim();

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  // Navigation & Auth
  const [token, setToken] = useState(() => getStoredToken() || ENV_COMMAND_TOKEN);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(() => Boolean(getStoredToken() || ENV_COMMAND_TOKEN));
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState('command-center');
  const [user, setUser] = useState({
    name: '',
    role: 'Command Operator',
    email: '',
    district: 'Dehradun, Uttarakhand'
  });

  // Operational Data (live mode starts empty; demo mode populates initialData)
  const [incidents, setIncidents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [osState, setOsState] = useState(null);
  const [osLive, setOsLive] = useState(null);
  const [osLastUpdated, setOsLastUpdated] = useState(null);
  const [intelligence, setIntelligence] = useState(null);
  const [wsStatus, setWsStatus] = useState('Offline'); // 'Live' | 'Reconnecting' | 'Offline'

  // Selection & UI State
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoadingSync, setIsLoadingSync] = useState(false);
  const [sseStatus, setSseStatus] = useState('disconnected'); // 'connected' | 'reconnecting' | 'disconnected'
  const citizenBridgeConnected = sseStatus === 'connected';

  // Chat & Communication
  const [activeChannel, setActiveChannel] = useState('command-net');
  const [messages, setMessages] = useState({});

  // Active Toasts
  const [toasts, setToasts] = useState([]);

  // Modals
  const [assignModalTeam, setAssignModalTeam] = useState(null);

  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Helper to trigger a toast
  const addToast = (toast) => {
    const id = Date.now().toString();
    const newToast = { id, ...toast };
    setToasts(prev => [newToast, ...prev]);
    setTimeout(() => {
      removeToast(id);
    }, 8000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Emergency Audio Alert Chime using Web Audio API
  const playEmergencyChime = (isRescue = false) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Tone 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = isRescue ? 'sawtooth' : 'sine';
      osc1.frequency.setValueAtTime(isRescue ? 880 : 659.25, now);
      osc1.frequency.exponentialRampToValueAtTime(isRescue ? 1174.66 : 880, now + 0.15);
      gain1.gain.setValueAtTime(0.22, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Tone 2
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(isRescue ? 1174.66 : 880, now + 0.18);
      osc2.frequency.exponentialRampToValueAtTime(isRescue ? 1480 : 987.77, now + 0.38);
      gain2.gain.setValueAtTime(0.2, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.5);
    } catch (_) {
      // AudioContext blocked before user interaction, safely ignore
    }
  };

  const logout = useCallback(() => {
    clearStoredToken();
    setToken('');
    setIsAuthenticated(false);
    setIsDemoMode(false);
    setSseStatus('disconnected');
    setIncidents([]);
    setTeams([]);
    setCameras([]);
    setAlerts([]);
    setIntelligence(null);
    setMessages({});
    setToasts([]);
    setSelectedIncidentId(null);
    setIsDrawerOpen(false);
  }, []);

  const apiFetch = useCallback(async (path, options = {}) => {
    const activeToken = tokenRef.current;
    const headers = {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      ...(options.headers || {})
    };
    const res = await fetch(apiUrl(path), { ...options, headers });
    if (res.status === 401 && activeToken) {
      logout();
    }
    return res;
  }, [logout]);

  const activateCommandSession = useCallback((data, fallbackEmail, remember = true) => {
    setStoredToken(data.token, remember);
    setToken(data.token);
    setIsDemoMode(false);
    setIncidents([]);
    setTeams([]);
    setCameras([]);
    setAlerts([]);
    setIntelligence(null);
    setMessages({});
    setToasts([]);
    setSelectedIncidentId(null);
    setActiveChannel('command-net');
    setUser(prev => ({
      ...prev,
      id: data.user.id,
      name: data.user.name,
      email: data.user.email || fallbackEmail,
      role: 'Command Operator',
      district: prev.district || 'Dehradun, Uttarakhand'
    }));
    setIsAuthenticated(true);
    return data;
  }, []);

  const login = useCallback(async (identifier, password, remember = true) => {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'command', name: identifier.trim(), identifier: identifier.trim(), password })
    });
    const data = await res.json().catch(() => null);
    if (!data) {
      throw new Error('Unexpected response from server (expected JSON). Is the backend running on port 5000?');
    }
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Invalid credentials');
    }
    const resolvedToken = data.token || ENV_COMMAND_TOKEN;
    if (!resolvedToken) {
      throw new Error('No COMMAND_TOKEN configured on backend or VITE_COMMAND_TOKEN in frontend');
    }
    return activateCommandSession({ ...data, token: resolvedToken }, identifier.trim(), remember);
  }, [activateCommandSession]);

  const registerCommand = useCallback(async ({ name, email, password, inviteCode, remember = true }) => {
    const res = await fetch(apiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        password,
        role: 'command',
        ...(inviteCode?.trim() ? { inviteCode: inviteCode.trim() } : {})
      })
    });
    const data = await res.json().catch(() => null);
    if (!data) {
      throw new Error('Unexpected response from server (expected JSON). Is the backend running on port 5000?');
    }
    if (!res.ok || !data.success || !data.token) {
      throw new Error(data.error || 'Registration failed');
    }
    return activateCommandSession(data, email.trim(), remember);
  }, [activateCommandSession]);

  const enterDemoMode = useCallback((email = 'ananya.kumar@resqcore.gov.in', roleLabel = 'Command Operator') => {
    clearStoredToken();
    setToken('');
    setIsDemoMode(true);
    setSseStatus('disconnected');
    setIncidents(initialIncidents);
    setTeams(initialTeams);
    setMessages(initialMessages);
    setAlerts(initialAlerts);
    setIntelligence(null);
    setCameras(initialCameras);
    setActiveChannel('ernakulam-command');
    setSelectedIncidentId('INC-2048');
    setToasts([
      {
        id: 'toast-initial-high',
        type: 'high-incident',
        title: 'New High incident',
        code: 'INC-2048 · Flooding in Fort Kochi',
        detail: '320 people affected · Verification required',
        incidentId: 'INC-2048'
      }
    ]);
    setUser(prev => ({
      ...prev,
      name: 'Ananya Kumar',
      role: roleLabel,
      email,
      district: 'Ernakulam, Kerala'
    }));
    setIsAuthenticated(true);
  }, []);

  // Restore existing Bearer token session on initial mount
  useEffect(() => {
    const existing = getStoredToken() || ENV_COMMAND_TOKEN;
    if (!existing) {
      setAuthChecking(false);
      return;
    }
    let cancelled = false;
    fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${existing}` }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('unauthorized');
        const data = await res.json().catch(() => null);
        if (!cancelled) {
          setToken(existing);
          setUser(prev => ({
            ...prev,
            id: data?.user?.id || prev.id,
            name: data?.user?.name || prev.name || 'Command Operator',
            email: data?.user?.email || prev.email || '',
            role: 'Command Operator'
          }));
          setIsAuthenticated(true);
        }
      })
      .catch(() => {
        if (!cancelled) logout();
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });
    return () => { cancelled = true; };
  }, [logout]);

  // Initial Data Sync from Real-Time Backend
  useEffect(() => {
    if (!isAuthenticated || isDemoMode || !token) return;

    apiFetch('/api/incidents')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.incidents) setIncidents(data.incidents);
      })
      .catch(() => { });

    apiFetch('/api/teams')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.teams) setTeams(data.teams);
      })
      .catch(() => { });

    apiFetch('/api/alerts')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.alerts) setAlerts(data.alerts);
      })
      .catch(() => { });

    apiFetch('/api/chat/messages')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.messages) setMessages(data.messages);
      })
      .catch(() => { });

    apiFetch('/api/os/state')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.state) setOsState(data.state);
      })
      .catch(() => { });

    apiFetch('/api/os-live')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && data.banker) {
          setOsLive(data);
          setOsState(data);
          if (data.lastUpdated) setOsLastUpdated(data.lastUpdated);
        }
      })
      .catch(() => { });

    apiFetch('/api/reports/intelligence')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.intelligence) setIntelligence(data.intelligence);
      })
      .catch(() => { });
  }, [isAuthenticated, isDemoMode, token, apiFetch]);

  const refreshIntelligence = useCallback(async () => {
    if (isDemoMode) return null;
    try {
      const res = await apiFetch('/api/reports/intelligence');
      const data = await res.json().catch(() => null);
      if (res.ok && data?.intelligence) {
        setIntelligence(data.intelligence);
        return data.intelligence;
      }
    } catch (_) { }
    return null;
  }, [isDemoMode, apiFetch]);

  const intelligenceTimerRef = useRef(null);
  const scheduleRefreshIntelligence = useCallback(() => {
    if (isDemoMode) return;
    if (intelligenceTimerRef.current) clearTimeout(intelligenceTimerRef.current);
    intelligenceTimerRef.current = setTimeout(() => {
      intelligenceTimerRef.current = null;
      refreshIntelligence();
    }, 250);
  }, [isDemoMode, refreshIntelligence]);
  const scheduleRefreshIntelligenceRef = useRef(() => {});
  scheduleRefreshIntelligenceRef.current = scheduleRefreshIntelligence;

  useEffect(() => () => {
    if (intelligenceTimerRef.current) clearTimeout(intelligenceTimerRef.current);
  }, []);

  const refreshOsLive = useCallback(async () => {
    if (isDemoMode) return null;
    try {
      const res = await apiFetch('/api/os-live');
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.banker) {
        setOsLive(data);
        setOsState(data);
        if (data.lastUpdated) setOsLastUpdated(data.lastUpdated);
        return data;
      }
    } catch (_) { }
    return null;
  }, [isDemoMode, apiFetch]);

  const refreshOsState = useCallback(() => {
    refreshOsLive();
  }, [refreshOsLive]);

  const updateOsResourceTotals = useCallback(async (updates) => {
    if (isDemoMode) return { ok: false, error: 'Resource updates require Live Backend mode' };
    try {
      const res = await apiFetch('/api/os-live/resources', {
        method: 'POST',
        body: JSON.stringify(updates)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        return { ok: false, status: res.status, error: data.error || data.message || `HTTP ${res.status}` };
      }
      if (data.banker) {
        setOsLive(data);
        setOsState(data);
        if (data.lastUpdated) setOsLastUpdated(data.lastUpdated);
      }
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err?.message || 'Network error' };
    }
  }, [isDemoMode, apiFetch]);

  // Real-Time Multi-Channel SSE Event Pipeline with Exponential Backoff
  useEffect(() => {
    if (!isAuthenticated || isDemoMode || !token) {
      setSseStatus('disconnected');
      return;
    }

    let eventSource = null;
    let reconnectTimer = null;
    let retryCount = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      try {
        eventSource = new EventSource(apiUrl(`/api/stream?token=${encodeURIComponent(token)}`));

        eventSource.onopen = () => {
          retryCount = 0;
          setSseStatus('connected');
        };

        eventSource.addEventListener('token_expired', () => {
          if (eventSource) eventSource.close();
          logout();
        });

        eventSource.addEventListener('team_registered', (e) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload.team) {
              setTeams(prev => {
                if (prev.some(t => t.id === payload.team.id)) return prev;
                return [payload.team, ...prev];
              });
            }
          } catch (_) { }
        });

        eventSource.addEventListener('incident_verified', (e) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload.incident) {
              setIncidents(prev => prev.map(i => (i.id === payload.incident.id ? { ...i, ...payload.incident } : i)));
            }
          } catch (_) { }
        });

        eventSource.addEventListener('os_state', (e) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload) {
              setOsState(payload);
              if (payload.banker) {
                setOsLive(payload);
                if (payload.lastUpdated) setOsLastUpdated(payload.lastUpdated);
              }
            }
          } catch (_) { }
        });

        eventSource.addEventListener('OS_LIVE_UPDATED', (e) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload && payload.banker) {
              setOsLive(payload);
              setOsState(payload);
              setOsLastUpdated(payload.lastUpdated || new Date().toISOString());
            }
          } catch (_) { }
        });

        eventSource.addEventListener('alert_created', (e) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload.alert) {
              setAlerts(prev => [payload.alert, ...prev.filter(a => a.id !== payload.alert.id)]);
            }
          } catch (_) { }
        });

        // 1. Citizen SOS event
      eventSource.addEventListener('new_citizen_sos', (e) => {
        try {
          const data = JSON.parse(e.data);
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST';
          
          const rawLat = data.coordinates?.latitude ?? data.coordinates?.lat ?? data.latitude ?? data.lat ?? 30.3165;
          const rawLng = data.coordinates?.longitude ?? data.coordinates?.lng ?? data.longitude ?? data.lng ?? 78.0322;
          const numLat = typeof rawLat === 'number' ? rawLat : parseFloat(rawLat) || 30.3165;
          const numLng = typeof rawLng === 'number' ? rawLng : parseFloat(rawLng) || 78.0322;

          const citizenInc = {
            id: data.id,
            title: data.title?.startsWith('🚨') ? data.title : `🚨 ${data.title || 'Distress Call'} (${data.citizenName || 'Citizen'})`,
            location: data.fullAddress || data.location || 'Uttarakhand Operational Theater',
            shortLocation: data.location || 'Tactical Sector',
            area: data.location || 'Tactical Sector',
            affected: data.affected || data.affectedCount || 1,
            affectedCount: data.affected || data.affectedCount || 1,
            time: nowStr,
            timeAgo: 'Now',
            timestamp: nowStr,
            severity: data.severity || 'High',
            status: data.status || 'Unverified',
            responseSummary: data.responseSummary || 'Citizen SOS · Awaiting verification',
            responseDetail: data.responseDetail || 'Verify to respond',
            description: data.description || 'Citizen emergency distress call.',
            fieldReport: data.fieldReport || `Citizen App direct report · Contact: ${data.contactNumber || 'Available'}`,
            citizenName: data.citizenName || 'Citizen User',
            contactNumber: data.contactNumber || '+91 98470 21836',
            coordinates: {
              lat: `${numLat.toFixed(4)}° N`,
              lng: `${numLng.toFixed(4)}° E`,
              latitude: numLat,
              longitude: numLng,
              x: 50,
              y: 50
            },
            isCitizenSOS: true,
            citizenUserId: data.citizenUserId || null,
            assignedTeam: data.assignedTeam || null,
            assignedTeamId: data.assignedTeamId || null,
            teamAssigned: data.teamAssigned || null,
            substatus: data.substatus || 'Awaiting triage by Command Center',
            requestedResources: Array.isArray(data.requestedResources) ? data.requestedResources : []
          };

          setIncidents(prev => [citizenInc, ...prev.filter(i => i.id !== citizenInc.id)]);
          setSelectedIncidentId(citizenInc.id);
          playEmergencyChime(false);

          addToast({
            id: 'toast-citizen-' + Date.now(),
            type: 'high-incident',
            title: '🚨 Real-Time Citizen SOS Received',
            code: `${citizenInc.id} · ${citizenInc.citizenName}`,
            detail: `${citizenInc.title} · ${citizenInc.location}`,
            incidentId: citizenInc.id
          });
        } catch (err) {
          console.warn('Error parsing incoming citizen SOS:', err);
        }
      });

      // 2. Rescue Team Field SOS Beacon
      eventSource.addEventListener('new_rescue_sos', (e) => {
        try {
          const payload = JSON.parse(e.data);
          const sosInc = payload.sosIncident || payload;
          const rawLat = sosInc.coordinates?.latitude ?? sosInc.coordinates?.lat ?? sosInc.latitude ?? sosInc.lat ?? 30.5593;
          const rawLng = sosInc.coordinates?.longitude ?? sosInc.coordinates?.lng ?? sosInc.longitude ?? sosInc.lng ?? 79.5644;
          const numLat = typeof rawLat === 'number' ? rawLat : parseFloat(rawLat) || 30.5593;
          const numLng = typeof rawLng === 'number' ? rawLng : parseFloat(rawLng) || 79.5644;

          const normalizedSOS = {
            ...sosInc,
            id: sosInc.id || `SOS-FIELD-${Date.now()}`,
            title: sosInc.title || `🚨 FIELD SOS: ${payload.teamName || 'Tactical Unit'} Distress`,
            severity: 'Critical',
            isRescueSOS: true,
            assignedTeam: payload.teamName || sosInc.assignedTeam || 'Tactical Unit',
            coordinates: {
              lat: `${numLat.toFixed(4)}° N`,
              lng: `${numLng.toFixed(4)}° E`,
              latitude: numLat,
              longitude: numLng,
              x: 50,
              y: 50
            }
          };

          setIncidents(prev => [normalizedSOS, ...prev.filter(i => i.id !== normalizedSOS.id)]);
          setSelectedIncidentId(normalizedSOS.id);
          playEmergencyChime(true);

          addToast({
            id: 'toast-rescue-sos-' + Date.now(),
            type: 'high-incident',
            title: '🚨 RESCUE TEAM SOS BEACON ACTIVATED',
            code: `${normalizedSOS.id} · ${payload.teamName || 'Field Unit'}`,
            detail: `EMERGENCY: Tactical unit distress beacon activated! GPS locked.`,
            incidentId: normalizedSOS.id
          });
        } catch (err) {
          console.warn('Error parsing rescue SOS:', err);
        }
      });

      // 3. Field Incident Reported by Rescue Team
      eventSource.addEventListener('incident_reported', (e) => {
        try {
          const payload = JSON.parse(e.data);
          const inc = payload.incident || payload;
          const rawLat = inc.coordinates?.latitude ?? inc.coordinates?.lat ?? inc.latitude ?? inc.lat ?? 30.3165;
          const rawLng = inc.coordinates?.longitude ?? inc.coordinates?.lng ?? inc.longitude ?? inc.lng ?? 78.0322;
          const numLat = typeof rawLat === 'number' ? rawLat : parseFloat(rawLat) || 30.3165;
          const numLng = typeof rawLng === 'number' ? rawLng : parseFloat(rawLng) || 78.0322;

          const normalizedInc = {
            ...inc,
            coordinates: {
              lat: `${numLat.toFixed(4)}° N`,
              lng: `${numLng.toFixed(4)}° E`,
              latitude: numLat,
              longitude: numLng,
              x: 50,
              y: 50
            }
          };

          setIncidents(prev => [normalizedInc, ...prev.filter(i => i.id !== normalizedInc.id)]);
          setSelectedIncidentId(normalizedInc.id);

          addToast({
            id: 'toast-field-rep-' + Date.now(),
            type: 'high-incident',
            title: 'Field Incident Reported',
            code: `${normalizedInc.id} · ${normalizedInc.title}`,
            detail: `${normalizedInc.location} · Logged by Field Recon`,
            incidentId: normalizedInc.id
          });
        } catch (err) {
          console.warn('Error parsing field incident:', err);
        }
      });

      // 4. Incident Assigned / Team Dispatched
      eventSource.addEventListener('incident_assigned', (e) => {
        try {
          const payload = JSON.parse(e.data);
          const targetId = payload.incidentId || payload.incident?.id;
          const teamName = payload.teamName || payload.incident?.assignedTeam;
          const eta = payload.eta || payload.incident?.eta || '10 min';

          setIncidents(prev =>
            prev.map(inc => {
              if (inc.id === targetId) {
                return {
                  ...inc,
                  status: isDemoMode ? (inc.status === 'Unverified' ? 'Verified' : inc.status) : (payload.incident?.status || 'Responding'),
                  responseSummary: teamName,
                  responseDetail: `ETA ${eta}`,
                  substatus: payload.incident?.substatus || `${teamName} dispatched · ETA ${eta}`,
                  assignedTeam: teamName,
                  assignedTeamId: payload.teamId || payload.incident?.assignedTeamId || inc.assignedTeamId,
                  teamAssigned: teamName,
                  requestedResources: payload.incident?.requestedResources !== undefined
                    ? payload.incident.requestedResources
                    : inc.requestedResources
                };
              }
              return inc;
            })
          );
          if (payload.teamId || payload.team?.id) {
            const assignedTid = payload.teamId || payload.team?.id;
            setTeams(prev =>
              prev.map(t =>
                t.id === assignedTid
                  ? { ...t, ...(payload.team || {}), status: 'Deployed', task: targetId, eta: `ETA ${eta}` }
                  : t
              )
            );
          }

          if (payload.team) {
            setTeams(prev =>
              prev.map(t => (t.id === payload.team.id ? { ...t, ...payload.team } : t))
            );
          }
        } catch (err) {
          console.warn('Error parsing incident_assigned:', err);
        }
      });

      // 5. Incident Status Changed (e.g. Responding, On site, Resolved)
      eventSource.addEventListener('incident_status_changed', (e) => {
        try {
          const payload = JSON.parse(e.data);
          const targetId = payload.incidentId;
          const newStatus = payload.status;
          const notes = payload.notes;

          setIncidents(prev =>
            prev.map(inc => {
              if (inc.id === targetId) {
                return {
                  ...inc,
                  status: newStatus,
                  responseDetail: notes || (newStatus === 'Resolved' ? 'Completed' : inc.responseDetail)
                };
              }
              return inc;
            })
          );

          addToast({
            id: 'toast-status-' + Date.now(),
            type: newStatus === 'Resolved' ? 'broadcast-sent' : 'team-assigned',
            title: `Incident ${newStatus}`,
            code: `${targetId} · Status Updated`,
            detail: notes || `Operation transitioned to ${newStatus}`
          });
        } catch (err) {
          console.warn('Error parsing incident_status_changed:', err);
        }
      });

      // 6. Tactical Team Live Telemetry Update
      eventSource.addEventListener('team_telemetry_update', (e) => {
        try {
          const payload = JSON.parse(e.data);
          setTeams(prev =>
            prev.map(t => {
              if (t.id === payload.teamId || t.name === payload.teamId) {
                return {
                  ...t,
                  coordinates: { lat: payload.lat, lng: payload.lng },
                  battery: payload.battery !== undefined ? payload.battery : t.battery,
                  status: payload.status || t.status
                };
              }
              return t;
            })
          );
        } catch (err) {
          console.warn('Error parsing telemetry update:', err);
        }
      });

      // 7. Tactical Chat Message from Rescue Team / Command
      eventSource.addEventListener('new_chat_message', (e) => {
        try {
          const payload = JSON.parse(e.data);
          const channel = payload.channel || 'command-net';
          const msg = payload.message;
          if (!msg) return;

          setMessages(prev => {
            const list = prev[channel] || [];
            if (list.some(m => m.id === msg.id)) return prev;
            return {
              ...prev,
              [channel]: [...list, msg]
            };
          });
        } catch (err) {
          console.warn('Error parsing chat message:', err);
        }
      });

      // 8. Emergency Broadcast Alert
      eventSource.addEventListener('emergency_broadcast', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.alert) {
            setAlerts(prev => [payload.alert, ...prev.filter(a => a.id !== payload.alert.id)]);
          }
        } catch (err) {
          console.warn('Error parsing emergency broadcast:', err);
        }
      });

      // 9. Operational Intelligence real-time refresh signal
      ['intelligence_updated', 'shelter_updated', 'incident_reported', 'sos_resolved'].forEach((evName) => {
        eventSource.addEventListener(evName, () => {
          scheduleRefreshIntelligenceRef.current();
        });
      });

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (disposed) return;
          if (retryCount === 0 && tokenRef.current) {
            fetch(apiUrl('/api/auth/me'), {
              headers: { Authorization: `Bearer ${tokenRef.current}` }
            })
              .then((res) => {
                if (res.status === 401 && !disposed) logout();
              })
              .catch(() => { });
          }
          setSseStatus('reconnecting');
          const delay = Math.min(30000, 1000 * Math.pow(2, retryCount));
          retryCount += 1;
          reconnectTimer = setTimeout(connect, delay);
        };
      } catch (_) {
        if (!disposed) {
          setSseStatus('reconnecting');
          const delay = Math.min(30000, 1000 * Math.pow(2, retryCount));
          retryCount += 1;
          reconnectTimer = setTimeout(connect, delay);
        }
      }
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventSource) eventSource.close();
      setSseStatus('disconnected');
    };
  }, [isAuthenticated, isDemoMode, token, logout]);

  // Real-Time WebSocket channel for instant OS Monitor snapshots (backoff 1s..15s)
  useEffect(() => {
    if (!isAuthenticated || isDemoMode || !token) {
      setWsStatus('Offline');
      return;
    }

    let ws = null;
    let reconnectTimer = null;
    let attempt = 0;
    let disposed = false;

    const connectWs = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(wsUrl(`/ws?token=${encodeURIComponent(token)}`));
        ws.onopen = () => {
          attempt = 0;
          setWsStatus('Live');
          refreshOsLive();
          scheduleRefreshIntelligenceRef.current();
        };
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            const evType = msg?.type || msg?.event;
            if ((evType === 'OS_LIVE_UPDATED' || evType === 'os_state') && msg?.data?.banker) {
              setOsLive(msg.data);
              setOsState(msg.data);
              setOsLastUpdated(msg.data.lastUpdated || msg.timestamp || new Date().toISOString());
            }
            if (
              evType === 'intelligence_updated' ||
              evType === 'OS_LIVE_UPDATED' ||
              evType === 'os_state' ||
              evType === 'new_citizen_sos' ||
              evType === 'incident_verified' ||
              evType === 'incident_assigned' ||
              evType === 'incident_status_changed' ||
              evType === 'incident_reported' ||
              evType === 'new_rescue_sos' ||
              evType === 'sos_resolved' ||
              evType === 'team_telemetry_update' ||
              evType === 'team_registered' ||
              evType === 'shelter_updated'
            ) {
              scheduleRefreshIntelligenceRef.current();
            }
          } catch (_) { }
        };
        ws.onerror = () => {
          try { ws?.close(); } catch (_) { }
        };
        ws.onclose = () => {
          if (disposed) return;
          setWsStatus('Reconnecting');
          const delay = Math.min(15000, 1000 * Math.pow(2, attempt));
          attempt += 1;
          reconnectTimer = setTimeout(connectWs, delay);
        };
      } catch (_) {
        if (!disposed) {
          setWsStatus('Reconnecting');
          const delay = Math.min(15000, 1000 * Math.pow(2, attempt));
          attempt += 1;
          reconnectTimer = setTimeout(connectWs, delay);
        }
      }
    };

    connectWs();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws?.close(); } catch (_) { }
      setWsStatus('Offline');
    };
  }, [isAuthenticated, isDemoMode, token, refreshOsLive]);

  // Get active selected incident object
  const selectedIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0];

  // Flow: Verify Incident
  const verifyIncident = async (id) => {
    setToasts(prev => prev.filter(t => t.incidentId !== id));

    if (isDemoMode) {
      setIncidents(prev =>
        prev.map(inc => {
          if (inc.id === id) {
            return {
              ...inc,
              status: 'Verified',
              responseSummary: 'Bravo 02',
              responseDetail: 'ETA 12 min',
              assignedTeam: 'Bravo 02',
              verifiedAt: '14:33 IST'
            };
          }
          return inc;
        })
      );
      setTeams(prev =>
        prev.map(team =>
          team.id === 'bravo-02'
            ? { ...team, status: 'Deployed', task: 'INC-2048 · Flash flooding', eta: 'ETA 12 min' }
            : team
        )
      );
      addToast({
        id: 'toast-assigned-' + Date.now(),
        type: 'team-assigned',
        title: 'Team assigned',
        code: `${id} · Bravo 02 · ETA 12 min`,
        detail: 'Verified · En route to Fort Kochi',
        incidentId: id
      });
      return;
    }

    try {
      const res = await apiFetch('/api/command/verify', {
        method: 'POST',
        body: JSON.stringify({ incidentId: id })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.incident) {
        setIncidents(prev => prev.map(inc => (inc.id === id ? { ...inc, ...data.incident } : inc)));
        addToast({
          id: 'toast-verified-' + Date.now(),
          type: 'team-assigned',
          title: 'Incident verified',
          code: id,
          detail: 'Ready for team dispatch',
          incidentId: id
        });
      }
    } catch (_) { }
  };

  // Flow: Assign specific team to an incident
  const assignTeamToIncident = async (teamId, incidentId, eta = '15 min') => {
    const team = teams.find(t => t.id === teamId);
    const incident = incidents.find(i => i.id === incidentId);

    if (!team || !incident) return false;

    const cleanEta = (eta || '15 min').trim() || '15 min';
    const prevTeam = { ...team };
    const prevIncident = { ...incident };

    setTeams(prev =>
      prev.map(t => (t.id === teamId ? { ...t, status: 'Deployed', task: `${incident.id} · ${incident.title}`, eta: `ETA ${cleanEta}` } : t))
    );

    setIncidents(prev =>
      prev.map(i => {
        if (i.id === incidentId) {
          return {
            ...i,
            status: isDemoMode ? (i.status === 'Unverified' ? 'Verified' : i.status) : 'Responding',
            responseSummary: team.name,
            responseDetail: `ETA ${cleanEta}`,
            substatus: `${team.name} dispatched · ETA ${cleanEta}`,
            assignedTeam: team.name,
            assignedTeamId: team.id,
            teamAssigned: team.name
          };
        }
        return i;
      })
    );

    if (!isDemoMode) {
      try {
        const requested = Array.isArray(incident.requestedResources) && incident.requestedResources.length > 0
          ? incident.requestedResources.map(r => ({ resourceId: r.resourceId, quantity: r.quantity }))
          : undefined;
        const resp = await apiFetch('/api/command/dispatch', {
          method: 'POST',
          body: JSON.stringify({
            incidentId: incident.id,
            teamId: team.id,
            teamName: team.name,
            eta: cleanEta,
            ...(requested ? { resources: requested } : {})
          })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.success === false) {
          setTeams(prev => prev.map(t => (t.id === teamId ? prevTeam : t)));
          setIncidents(prev => prev.map(i => (i.id === incidentId ? prevIncident : i)));
          addToast({
            type: 'error',
            title: 'Dispatch blocked',
            code: incident.id,
            detail: data.error || `HTTP ${resp.status}`,
            incidentId: incident.id
          });
          return false;
        }
        if (data.incident) {
          setIncidents(prev => prev.map(i => (i.id === incidentId ? { ...i, ...data.incident } : i)));
        }
        if (data.team) {
          setTeams(prev => prev.map(t => (t.id === teamId ? { ...t, ...data.team } : t)));
        }
      } catch (err) {
        setTeams(prev => prev.map(t => (t.id === teamId ? prevTeam : t)));
        setIncidents(prev => prev.map(i => (i.id === incidentId ? prevIncident : i)));
        addToast({
          type: 'error',
          title: 'Dispatch failed',
          code: incident.id,
          detail: err?.message || 'Network error',
          incidentId: incident.id
        });
        return false;
      }
    }

    addToast({
      type: 'team-assigned',
      title: 'Team assigned',
      code: `${incident.id} · ${team.name} · ETA ${cleanEta}`,
      detail: `Assigned · Dispatched to ${incident.shortLocation || incident.location}`,
      incidentId: incident.id
    });

    setAssignModalTeam(null);
    return true;
  };

  const updateIncidentStatus = async (incidentId, status, notes = '') => {
    const incident = incidents.find(i => i.id === incidentId);
    if (!incident) return false;
    const prevIncident = { ...incident };

    setIncidents(prev =>
      prev.map(i => (i.id === incidentId ? { ...i, status, substatus: notes || `Status updated to ${status}` } : i))
    );

    if (!isDemoMode) {
      try {
        const resp = await apiFetch('/api/incidents/update', {
          method: 'POST',
          body: JSON.stringify({ incidentId, status, ...(notes ? { notes } : {}) })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.success === false) {
          setIncidents(prev => prev.map(i => (i.id === incidentId ? prevIncident : i)));
          addToast({
            type: 'error',
            title: 'Status update failed',
            code: incidentId,
            detail: data.error || `HTTP ${resp.status}`,
            incidentId
          });
          return false;
        }
        if (data.incident) {
          setIncidents(prev => prev.map(i => (i.id === incidentId ? { ...i, ...data.incident } : i)));
        }
      } catch (err) {
        setIncidents(prev => prev.map(i => (i.id === incidentId ? prevIncident : i)));
        return false;
      }
    }
    return true;
  };

  // Flow: Send Chat Message
  const sendMessage = (channelId, text) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    const targetChannel = channelId || 'command-net';
    const senderName = user.name || 'Command Operator';
    const initials = senderName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(s => s[0].toUpperCase())
      .join('') || 'CO';

    const newMessage = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      channel: targetChannel,
      sender: senderName,
      senderRole: 'command',
      role: user.role || 'Command Operator',
      initials,
      isSelf: true,
      time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
      text: cleanText
    };

    setMessages(prev => ({
      ...prev,
      [targetChannel]: [...(prev[targetChannel] || []), newMessage]
    }));

    if (!isDemoMode) {
      apiFetch('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          id: newMessage.id,
          channel: targetChannel,
          sender: senderName,
          role: user.role || 'Command Operator',
          text: cleanText
        })
      }).catch(() => { });
    }
  };

  // Flow: Send Broadcast
  const sendBroadcast = ({ recipients, message, severity = 'Info', audience = 'all' }) => {
    addToast({
      type: 'broadcast-sent',
      title: 'Broadcast Dispatched',
      code: `To: ${recipients}`,
      detail: message.slice(0, 70) + (message.length > 70 ? '...' : '')
    });

    if (isDemoMode) {
      setAlerts(prev => [
        {
          id: 'a-' + Date.now(),
          title: 'Command broadcast issued',
          code: 'ALL-UNITS',
          subtitle: message.slice(0, 45) + '...',
          timeAgo: 'Just now',
          severity
        },
        ...prev
      ]);
      return;
    }

    apiFetch('/api/command/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        recipients,
        message,
        severity,
        audience
      })
    }).catch(() => { });
  };

  // Open incident in drawer & navigate
  const inspectIncident = (id, targetTab = null) => {
    setSelectedIncidentId(id);
    setIsDrawerOpen(true);
    if (targetTab) {
      setActiveTab(targetTab);
    }
  };

  // Demo Mode Effect (UNTOUCHED: Exactly preserves simulated demo mode)
  useEffect(() => {
    if (!isDemoMode) return;

    const interval = setInterval(() => {
      const randomAction = Math.floor(Math.random() * 3);

      if (randomAction === 0) {
        // Generate a new incident
        const newId = `INC-${Math.floor(Math.random() * 1000) + 3000}`;
        const newIncident = {
          id: newId,
          title: 'Emergency Distress Call',
          severity: Math.random() > 0.5 ? 'High' : 'Medium',
          status: 'Unverified',
          location: '10.0158° N · 76.3421° E',
          shortLocation: 'Kochi, Kerala',
          time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
          impact: 'Unknown impact',
          type: 'Distress'
        };

        setIncidents(prev => [newIncident, ...prev]);
        addToast({
          type: 'high-incident',
          title: 'New Incident Detected',
          code: `${newId} · ${newIncident.title}`,
          detail: 'Verification pending'
        });
      } else if (randomAction === 1) {
        // Generate incoming message
        const msg = {
          id: 'demo-msg-' + Date.now(),
          sender: 'Field Unit Charlie',
          initials: 'FC',
          isSelf: false,
          time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
          text: 'Weather worsening at sector 7, visibility dropping.'
        };
        setMessages(prev => ({
          ...prev,
          ['ernakulam-command']: [...(prev['ernakulam-command'] || []), msg]
        }));
      } else {
        // Update a team's status randomly
        setTeams(prev => {
          const updated = [...prev];
          const deployedTeams = updated.filter(t => t.status === 'Deployed');
          if (deployedTeams.length > 0) {
            const randomTeam = deployedTeams[Math.floor(Math.random() * deployedTeams.length)];
            const index = updated.findIndex(t => t.id === randomTeam.id);
            if (index !== -1) {
              updated[index] = { ...updated[index], eta: `ETA ${Math.floor(Math.random() * 10) + 2} min` };
            }
          }
          return updated;
        });
      }
    }, 4000); // trigger every 4 seconds in demo mode

    return () => clearInterval(interval);
  }, [isDemoMode]);

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        setIsAuthenticated,
        authChecking,
        login,
        registerCommand,
        logout,
        enterDemoMode,
        apiFetch,
        activeTab,
        setActiveTab,
        user,
        setUser,
        incidents,
        setIncidents,
        teams,
        setTeams,
        cameras,
        setCameras,
        alerts,
        setAlerts,
        selectedIncidentId,
        setSelectedIncidentId,
        selectedIncident,
        isDrawerOpen,
        setIsDrawerOpen,
        inspectIncident,
        verifyIncident,
        assignTeamToIncident,
        updateIncidentStatus,
        assignModalTeam,
        setAssignModalTeam,
        activeChannel,
        setActiveChannel,
        messages,
        setMessages,
        sendMessage,
        sendBroadcast,
        toasts,
        setToasts,
        removeToast,
        addToast,
        isLoadingSync,
        setIsLoadingSync,
        isDemoMode,
        setIsDemoMode,
        sseStatus,
        citizenBridgeConnected,
        osState,
        osLive,
        osLastUpdated,
        intelligence,
        wsStatus,
        refreshOsState,
        refreshOsLive,
        refreshIntelligence,
        updateOsResourceTotals
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
