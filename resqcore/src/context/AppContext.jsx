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

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  // Navigation & Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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

  // Initial Data Sync from Real-Time Backend
  useEffect(() => {
    if (isDemoMode) return;

    fetch('http://localhost:5000/api/incidents')
      .then(res => res.json())
      .then(data => {
        if (data.incidents && data.incidents.length > 0) {
          setIncidents(data.incidents);
        }
      })
      .catch(() => { });

    fetch('http://localhost:5000/api/teams')
      .then(res => res.json())
      .then(data => {
        if (data.teams && data.teams.length > 0) {
          setTeams(data.teams);
        }
      })
      .catch(() => { });

    fetch('http://localhost:5000/api/alerts')
      .then(res => res.json())
      .then(data => {
        if (data.alerts && data.alerts.length > 0) {
          setAlerts(data.alerts);
        }
      })
      .catch(() => { });

    fetch('http://localhost:5000/api/chat/messages')
      .then(res => res.json())
      .then(data => {
        if (data.messages && Object.keys(data.messages).length > 0) {
          setMessages(prev => ({ ...prev, ...data.messages }));
        }
      })
      .catch(() => { });
  }, [isDemoMode]);

  // Real-Time Multi-Channel SSE Event Pipeline
  useEffect(() => {
    let eventSource;
    try {
      eventSource = new EventSource('http://localhost:5000/api/stream');

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
  }, []);

  // Get active selected incident object
  const selectedIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0];

  // Flow: Verify Incident
  const verifyIncident = (id) => {
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

    // Update Bravo 02 status
    setTeams(prev =>
      prev.map(team => {
        if (team.id === 'bravo-02') {
          return {
            ...team,
            status: 'Deployed',
            task: 'INC-2048 · Flash flooding',
            eta: 'ETA 12 min'
          };
        }
        return team;
      })
    );

    // Dismiss any initial high alert toast for this incident
    setToasts(prev => prev.filter(t => t.incidentId !== id));

    // Notify Citizen App bridge in real time
    fetch('http://localhost:5000/api/command/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: id,
        incidentId: id,
        teamName: 'Bravo 02',
        eta: '12 min'
      })
    }).catch(() => { });

    fetch('http://localhost:5000/api/command/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incidentId: id })
    }).catch(() => { });

    // Show team assigned toast matching Figma "Toast / Team assigned"
    addToast({
      id: 'toast-assigned-' + Date.now(),
      type: 'team-assigned',
      title: 'Team assigned',
      code: `${id} · Bravo 02 · ETA 12 min`,
      detail: 'Verified · En route to Fort Kochi',
      incidentId: id
    });
  };

  // Flow: Assign specific team to an incident
  const assignTeamToIncident = (teamId, incidentId) => {
    const team = teams.find(t => t.id === teamId);
    const incident = incidents.find(i => i.id === incidentId);

    if (!team || !incident) return;

    setTeams(prev =>
      prev.map(t => {
        if (t.id === teamId) {
          return {
            ...t,
            status: 'Deployed',
            task: `${incident.id} · ${incident.title}`,
            eta: 'ETA 15 min'
          };
        }
        return t;
      })
    );

    setIncidents(prev =>
      prev.map(i => {
        if (i.id === incidentId) {
          return {
            ...i,
            status: i.status === 'Unverified' ? 'Verified' : i.status,
            responseSummary: team.name,
            responseDetail: 'ETA 15 min',
            assignedTeam: team.name
          };
        }
        return i;
      })
    );

    // Notify Backend & Field Teams in real time
    fetch('http://localhost:5000/api/command/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incidentId: incident.id,
        teamName: team.name,
        eta: '15 min'
      })
    }).catch(() => { });

    addToast({
      type: 'team-assigned',
      title: 'Team assigned',
      code: `${incident.id} · ${team.name} · ETA 15 min`,
      detail: `Assigned · Dispatched to ${incident.shortLocation || incident.location}`,
      incidentId: incident.id
    });

    setAssignModalTeam(null);
  };

  // Flow: Send Chat Message
  const sendMessage = (channelId, text) => {
    if (!text.trim()) return;
    const newMessage = {
      id: 'm-' + Date.now(),
      sender: `${user.name} · You`,
      initials: 'AK',
      isSelf: true,
      time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
      text: text.trim()
    };

    setMessages(prev => ({
      ...prev,
      [channelId]: [...(prev[channelId] || []), newMessage]
    }));

    // Post to Real-Time Backend
    fetch('http://localhost:5000/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newMessage.id,
        channel: channelId,
        sender: `${user.name} · You`,
        role: user.role,
        initials: 'AK',
        isSelf: true,
        text: text.trim()
      })
    }).catch(() => { });
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

    // Dispatch to Backend & all mobile apps in real time
    fetch('http://localhost:5000/api/command/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients,
        message,
        severity,
        issuedBy: `${user.name} (${user.role})`
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
