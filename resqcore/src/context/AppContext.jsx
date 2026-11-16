import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  initialIncidents,
  initialTeams,
  initialChannels,
  initialDirectMessages,
  initialMessages,
  initialAlerts,
  initialCameras
} from '../data/initialData';
import { apiFetch, mapAlert, mapIncident, mapMessage, mapTeam, supabase, supabaseConfigured } from '../lib/supabase';
import { createRealtimeEventSource } from '../lib/realtimeEventSource';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  // Navigation & Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [session, setSession] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState('command-center');
  const [user, setUser] = useState({
    name: 'Ananya Kumar',
    role: 'Command Operator',
    email: 'ananya.kumar@resqcore.gov.in',
    district: 'Dehradun, Uttarakhand'
  });

  // Operational Data
  const [incidents, setIncidents] = useState(initialIncidents);
  const [teams, setTeams] = useState(initialTeams);
  const [cameras, setCameras] = useState(initialCameras);
  const [alerts, setAlerts] = useState(initialAlerts);

  // Selection & UI State
  const [selectedIncidentId, setSelectedIncidentId] = useState('INC-2048');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoadingSync, setIsLoadingSync] = useState(false);
  const [citizenBridgeConnected, setCitizenBridgeConnected] = useState(false);

  // Chat & Communication
  const [activeChannel, setActiveChannel] = useState('ernakulam-command');
  const [messages, setMessages] = useState(initialMessages);

  // Active Toasts
  const [toasts, setToasts] = useState([
    {
      id: 'toast-initial-high',
      type: 'high-incident',
      title: 'New High incident',
      code: 'INC-2048 · Flooding in Fort Kochi',
      detail: '320 people affected · Verification required',
      incidentId: 'INC-2048'
    }
  ]);

  // Modals
  const [assignModalTeam, setAssignModalTeam] = useState(null);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return undefined;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setIsAuthenticated(false);
        setCitizenBridgeConnected(false);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      setSession(data.session);
      try {
        const profile = await apiFetch('/auth/me');
        if (!active) return;
        if (!['command_admin', 'command_operator'].includes(profile.role)) {
          await supabase.auth.signOut();
          return;
        }
        setUser(prev => ({
          ...prev,
          email: profile.user.email,
          name: data.session.user.user_metadata?.full_name || profile.user.email,
          role: profile.role === 'command_admin' ? 'District Administrator' : 'Command Operator',
        }));
        setIsAuthenticated(true);
      } catch {
        await supabase.auth.signOut();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

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

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setIsAuthenticated(false);
    setIsDemoMode(false);
    setCitizenBridgeConnected(false);
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

  // Initial live data sync. Subsequent writes arrive over Supabase Realtime.
  useEffect(() => {
    if (isDemoMode || !isAuthenticated || !supabaseConfigured) return undefined;
    let active = true;
    setIsLoadingSync(true);

    Promise.all([
      apiFetch('/incidents'),
      apiFetch('/teams'),
      apiFetch('/alerts'),
      apiFetch('/chat/messages'),
    ]).then(([incidentData, teamData, alertData, messageData]) => {
      if (!active) return;
      setIncidents((incidentData.incidents || []).map(mapIncident));
      setTeams((teamData.teams || []).map(mapTeam));
      setAlerts((alertData.alerts || []).map(mapAlert));
      const liveMessages = messageData.messages || {};
      setMessages({ ...liveMessages, 'ernakulam-command': liveMessages['command:all'] || [] });
    }).catch(() => {
      if (active) addToast({ type: 'broadcast-sent', title: 'Live data unavailable', detail: 'Check your connection and try again.' });
    }).finally(() => {
      if (active) setIsLoadingSync(false);
    });

    return () => { active = false; };
  }, [isDemoMode, isAuthenticated]);

  // Authenticated Postgres changes keep incidents, teams, alerts, and chat in sync.
  useEffect(() => {
    if (!isAuthenticated || isDemoMode || !supabaseConfigured || !session?.user?.id) {
      setCitizenBridgeConnected(false);
      return undefined;
    }
    let eventSource;
    try {
      eventSource = createRealtimeEventSource(session.user.id);

      eventSource.onopen = () => {
        setCitizenBridgeConnected(true);
      };

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
            assignedTeam: data.assignedTeam || null,
            teamAssigned: data.teamAssigned || null
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
                  status: inc.status === 'Unverified' ? 'Verified' : inc.status,
                  responseSummary: teamName,
                  responseDetail: `ETA ${eta}`,
                  assignedTeam: teamName,
                  teamAssigned: teamName
                };
              }
              return inc;
            })
          );

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
          const channel = payload.channel || 'ernakulam-command';
          const msg = payload.message;

          setMessages(prev => {
            const list = prev[channel] || [];
            // Prevent duplicate message if already added locally by ID or text+sender
            if (list.some(m => m.id === msg.id || (m.text === msg.text && m.sender === msg.sender))) return prev;
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

      eventSource.onerror = () => {
        setCitizenBridgeConnected(false);
      };
    } catch (_) {
      setCitizenBridgeConnected(false);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [isAuthenticated, isDemoMode, session?.user?.id]);

  // Get active selected incident object
  const selectedIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0];

  // Verification and dispatch are separate live operations; demo mode remains local.
  const verifyIncident = async (id) => {
    if (isDemoMode) {
      setIncidents(prev => prev.map(inc => inc.id === id ? { ...inc, status: 'Verified', responseSummary: 'Verified · Standby for dispatch', responseDetail: 'Ready to assign' } : inc));
      setToasts(prev => prev.filter(toast => toast.incidentId !== id));
      return;
    }

    try {
      const result = await apiFetch('/command/verify', { method: 'POST', body: JSON.stringify({ incidentId: id }) });
      const verified = mapIncident(result.incident);
      setIncidents(prev => prev.map(incident => incident.id === id ? verified : incident));
      setToasts(prev => prev.filter(toast => toast.incidentId !== id));
    } catch (error) {
      addToast({ type: 'high-incident', title: 'Verification failed', code: id, detail: error.message, incidentId: id });
    }
  };

  // Flow: Assign a real team through the protected backend; demo mode remains simulated.
  const assignTeamToIncident = async (teamId, incidentId) => {
    const team = teams.find(item => item.id === teamId);
    const incident = incidents.find(item => item.id === incidentId);
    if (!team || !incident) return;

    if (isDemoMode) {
      setTeams(prev => prev.map(item => item.id === teamId ? { ...item, status: 'Deployed', task: `${incident.id} · ${incident.title}`, eta: 'ETA 15 min' } : item));
      setIncidents(prev => prev.map(item => item.id === incidentId ? { ...item, status: item.status === 'Unverified' ? 'Verified' : item.status, responseSummary: team.name, responseDetail: 'ETA 15 min', assignedTeam: team.name } : item));
      setAssignModalTeam(null);
      return;
    }

    try {
      const result = await apiFetch('/command/dispatch', {
        method: 'POST',
        body: JSON.stringify({ incidentId: incident.id, teamName: team.name, eta: '15 min' }),
      });
      const updated = mapIncident(result.incident);
      setIncidents(prev => prev.map(item => item.id === incidentId ? updated : item));
      setTeams(prev => prev.map(item => item.id === team.id ? { ...item, status: 'Deployed', task: `${incident.id} · ${incident.title}`, eta: 'ETA 15 min' } : item));
      addToast({ type: 'team-assigned', title: 'Team assigned', code: `${incident.id} · ${team.name} · ETA 15 min`, detail: `Dispatched to ${incident.shortLocation || incident.location}`, incidentId: incident.id });
      setAssignModalTeam(null);
    } catch (error) {
      addToast({ type: 'high-incident', title: 'Dispatch failed', code: incident.id, detail: error.message, incidentId: incident.id });
    }
  };

  // Flow: Send Chat Message
  const sendMessage = (channelId, text) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    if (isDemoMode) {
      const newMessage = {
        id: 'm-' + Date.now(),
        sender: `${user.name} · You`,
        initials: 'AK',
        isSelf: true,
        time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
        text: cleanText,
      };
      setMessages(prev => ({ ...prev, [channelId]: [...(prev[channelId] || []), newMessage] }));
      return;
    }

    apiFetch('/chat/send', { method: 'POST', body: JSON.stringify({ channel: 'command:all', text: cleanText }) })
      .then(({ message }) => {
        const current = mapMessage(message, session?.user?.id);
        setMessages(prev => {
          const channel = 'ernakulam-command';
          const list = prev[channel] || [];
          if (list.some(item => item.id === current.id)) return prev;
          return { ...prev, [channel]: [...list, current] };
        });
      })
      .catch((error) => addToast({ type: 'broadcast-sent', title: 'Message not sent', detail: error.message }));
  };

  // Flow: Send Broadcast
  const sendBroadcast = ({ recipients, message, severity = 'Info' }) => {
    addToast({
      type: 'broadcast-sent',
      title: 'Broadcast Dispatched',
      code: `To: ${recipients}`,
      detail: message.slice(0, 70) + (message.length > 70 ? '...' : '')
    });

    // Also add to operational alerts
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

    if (!isDemoMode) {
      apiFetch('/command/broadcast', {
        method: 'POST',
        body: JSON.stringify({ recipients, message, severity }),
      }).catch((error) => addToast({ type: 'broadcast-sent', title: 'Broadcast not sent', detail: error.message }));
    }
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
        session,
        signOut,
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
        citizenBridgeConnected
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
