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

  // Real-Time Citizen App SSE Bridge Listener
  useEffect(() => {
    let eventSource;
    try {
      eventSource = new EventSource('http://localhost:5000/api/stream');

      eventSource.onopen = () => {
        setCitizenBridgeConnected(true);
      };

      eventSource.addEventListener('new_citizen_sos', (e) => {
        try {
          const data = JSON.parse(e.data);
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST';
          const citizenInc = {
            id: data.id,
            title: `🚨 ${data.title} (${data.citizenName || 'Citizen'})`,
            location: data.fullAddress || data.location,
            shortLocation: data.location,
            area: data.location,
            affected: 1,
            time: nowStr,
            timeAgo: 'Now',
            severity: data.severity || 'High',
            status: 'Unverified',
            responseSummary: 'Citizen SOS · Awaiting verification',
            responseDetail: 'Verify to respond',
            description: data.description,
            fieldReport: `Citizen App direct report · Contact: ${data.contactNumber}`,
            coordinates: {
              lat: `${data.coordinates?.lat || 30.3165}° N`,
              lng: `${data.coordinates?.lng || 78.0322}° E`,
              x: 50,
              y: 50
            },
            isCitizenSOS: true,
            contactNumber: data.contactNumber,
            assignedTeam: null
          };

          setIncidents(prev => [citizenInc, ...prev.filter(i => i.id !== citizenInc.id)]);

          addToast({
            id: 'toast-citizen-' + Date.now(),
            type: 'high-incident',
            title: '🚨 Real-Time Citizen SOS Received',
            code: `${data.id} · ${data.citizenName || 'Citizen'}`,
            detail: `${data.title} · ${data.location}`,
            incidentId: data.id
          });
        } catch (err) {
          console.warn('Error parsing incoming citizen SOS:', err);
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

  // Get active selected incident object
  const selectedIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0];

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
        teamName: 'Bravo 02',
        eta: '12 min'
      })
    }).catch(() => {});

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

    addToast({
      type: 'team-assigned',
      title: 'Team assigned',
      code: `${incident.id} · ${team.name} · ETA 15 min`,
      detail: `Assigned · Dispatched to ${incident.shortLocation}`,
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
  };

  // Open incident in drawer & navigate
  const inspectIncident = (id, targetTab = null) => {
    setSelectedIncidentId(id);
    setIsDrawerOpen(true);
    if (targetTab) {
      setActiveTab(targetTab);
    }
  };

  // Demo Mode Effect
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
