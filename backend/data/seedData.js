export const seedIncidents = [
  {
    id: "INC-2048",
    title: "Flash flooding",
    location: "Fort Kochi · Ernakulam, Kerala",
    shortLocation: "Fort Kochi",
    area: "Fort Kochi",
    affected: 320,
    affectedCount: 320,
    time: "14:32 IST",
    timeAgo: "Now",
    timestamp: "Today · 14:32 IST",
    severity: "High",
    status: "Unverified",
    responseSummary: "Awaiting verification",
    responseDetail: "Verify to respond",
    description: "Rapid water rise near the ferry terminal. Families stranded; evacuation required.",
    fieldReport: "Field report · FK-01 camera confirmed",
    coordinates: {
      lat: "9.9658° N",
      lng: "76.2421° E",
      latitude: 9.9658,
      longitude: 76.2421,
      x: 34,
      y: 58
    },
    assignedTeam: null,
    teamAssigned: "Unassigned",
    substatus: "Citizen report · Awaiting verification",
    eta: null,
    createdAt: new Date().toISOString()
  },
  {
    id: "INC-2047",
    title: "Bridge collapse",
    location: "Mattancherry · Ernakulam, Kerala",
    shortLocation: "Mattancherry",
    area: "Mattancherry",
    affected: 85,
    affectedCount: 85,
    time: "14:25 IST",
    timeAgo: "7m",
    timestamp: "Today · 14:25 IST",
    severity: "High",
    status: "Escalated",
    responseSummary: "No team available",
    responseDetail: "District notified",
    description: "Bridge access cut off. Technical rescue assistance requested for the eastern bank.",
    fieldReport: "Field report · MC-02 camera confirmed",
    coordinates: {
      lat: "9.9587° N",
      lng: "76.2594° E",
      latitude: 9.9587,
      longitude: 76.2594,
      x: 40,
      y: 73
    },
    assignedTeam: null,
    teamAssigned: "District SAR",
    substatus: "Escalated · District response notified",
    eta: "25 min",
    createdAt: new Date(Date.now() - 7 * 60000).toISOString()
  },
  {
    id: "INC-2046",
    title: "Coastal evacuation",
    location: "Vypin · Ernakulam, Kerala",
    shortLocation: "Vypin",
    area: "Vypin",
    affected: 210,
    affectedCount: 210,
    time: "14:18 IST",
    timeAgo: "14m",
    timestamp: "Today · 14:18 IST",
    severity: "High",
    status: "Responding",
    responseSummary: "Alpha 01",
    responseDetail: "ETA 8 min",
    description: "High tidal surge threatening coastal settlement. Evacuation of zone 2 in progress.",
    fieldReport: "Field report · VP-03 camera confirmed",
    coordinates: {
      lat: "9.9920° N",
      lng: "76.2300° E",
      latitude: 9.9920,
      longitude: 76.2300,
      x: 36,
      y: 37
    },
    assignedTeam: "Alpha 01",
    teamAssigned: "Team Alpha (Alpha 01)",
    substatus: "Team assigned · Alpha 01 · ETA 8 min",
    eta: "8 min",
    createdAt: new Date(Date.now() - 14 * 60000).toISOString()
  },
  {
    id: "INC-101",
    title: "Flash Flood Alert",
    location: "Joshimath, Uttarakhand",
    shortLocation: "Joshimath",
    area: "Joshimath Valley",
    affected: 247,
    affectedCount: 247,
    time: "10:24 AM IST",
    timeAgo: "Active",
    timestamp: "Today · 10:24 AM",
    severity: "High",
    status: "Responding",
    responseSummary: "Team Alpha",
    responseDetail: "ETA 12 min",
    description: "Flash flood alert in Joshimath lower valley. Water level rising 0.8m at Bridge 2. Access road blocked.",
    fieldReport: "Tactical Sensor · Water level alert",
    coordinates: {
      lat: "30.5562° N",
      lng: "79.5670° E",
      latitude: 30.5562,
      longitude: 79.5670,
      x: 50,
      y: 50
    },
    assignedTeam: "Team Alpha",
    teamAssigned: "Team Alpha",
    substatus: "Team assigned · Team Alpha · ETA 12 min",
    eta: "12 min",
    createdAt: new Date(Date.now() - 25 * 60000).toISOString()
  },
  {
    id: "INC-102",
    title: "Landslide Risk & Rockfall",
    location: "Chamoli, Uttarakhand",
    shortLocation: "Chamoli",
    area: "NH-07 Km 42",
    affected: 85,
    affectedCount: 85,
    time: "08:45 AM IST",
    timeAgo: "Active",
    timestamp: "Today · 08:45 AM",
    severity: "Medium",
    status: "Responding",
    responseSummary: "District SAR",
    responseDetail: "ETA 25 min",
    description: "Slope instability along NH-07 near Km 42. Multiple rockfall events recorded.",
    fieldReport: "Field recon verified",
    coordinates: {
      lat: "30.4000° N",
      lng: "79.3300° E",
      latitude: 30.4000,
      longitude: 79.3300,
      x: 52,
      y: 48
    },
    assignedTeam: "District SAR",
    teamAssigned: "District SAR",
    substatus: "Escalated · District response notified",
    eta: "25 min",
    createdAt: new Date(Date.now() - 50 * 60000).toISOString()
  }
];

export const seedTeams = [
  {
    id: "alpha-01",
    name: "Alpha 01",
    callsign: "GARHWAL-01",
    type: "NDRF Fast Response Unit",
    sector: "Zone 1 · Fort Kochi / Joshimath Grid",
    status: "Deployed",
    personnel: 8,
    commander: "Capt. Rajesh Negi",
    commanderPhone: "+91 98110 44201",
    task: "INC-2046 · Coastal evacuation",
    eta: "ETA 8 min",
    coordinates: { lat: 9.9820, lng: 76.2410 },
    battery: 92
  },
  {
    id: "bravo-02",
    name: "Bravo 02",
    callsign: "SPEEDBOAT-02",
    type: "Marine / Inundation Speedboat Unit",
    sector: "Sector 4-B · Waterways & Ferry Terminal",
    status: "Available",
    personnel: 6,
    commander: "Lt. Sunil Varma",
    commanderPhone: "+91 98470 33910",
    task: "Standby for water rescue dispatch",
    eta: "Available",
    coordinates: { lat: 9.9650, lng: 76.2390 },
    battery: 88
  },
  {
    id: "charlie-03",
    name: "Charlie 03",
    callsign: "TRIAGE-03",
    type: "Emergency Medical Triage Team",
    sector: "Sector B · Mobile Medical Tent",
    status: "Available",
    personnel: 5,
    commander: "Dr. Priya Sharma",
    commanderPhone: "+91 98223 11842",
    task: "Field triage ready",
    eta: "Available",
    coordinates: { lat: 9.9700, lng: 76.2500 },
    battery: 95
  },
  {
    id: "delta-04",
    name: "Delta 04",
    callsign: "CLEARANCE-04",
    type: "Heavy Equipment & Roadway Clearing",
    sector: "Sector 2 · Mattancherry Junction",
    status: "Deployed",
    personnel: 10,
    commander: "Sub. Harish Rawat",
    commanderPhone: "+91 94110 55192",
    task: "INC-2045 · Residential fire perimeter",
    eta: "ETA 16 min",
    coordinates: { lat: 9.9600, lng: 76.2600 },
    battery: 76
  }
];

export const seedMessages = {
  "ernakulam-command": [
    {
      id: "m-1",
      sender: "Capt. Rajesh Negi",
      role: "Lead Comms · Alpha 01",
      initials: "RN",
      isSelf: false,
      time: "10:14",
      text: "Alpha 01 on standby. Water level rising near the lower bridge."
    },
    {
      id: "m-2",
      sender: "Paramedic Priya Sharma",
      role: "Triage Specialist",
      initials: "PS",
      isSelf: false,
      time: "10:16",
      text: "Medical triage buggy ready at staging area. 40 IV kits packed.",
      locationTag: "Ward 4 Clinic (Sector B)"
    },
    {
      id: "m-3",
      sender: "Ananya Kumar · You",
      role: "Command Operator",
      initials: "AK",
      isSelf: true,
      time: "10:18",
      text: "Acknowledged. Bravo 02 speedboats moving to high-risk perimeter."
    }
  ],
  "alpha-01-tactical": [
    {
      id: "m-a1",
      sender: "Capt. Rajesh Negi",
      role: "Team Commander",
      initials: "RN",
      isSelf: false,
      time: "10:20",
      text: "Thermal drone deployed over sector 4 grid. Marking civilian cluster."
    }
  ]
};

export const seedAlerts = [
  {
    id: "a-101",
    title: "Flash Flood Warning — Zone 04",
    code: "SEOC-RED-2026",
    subtitle: "Water level breached danger mark by 0.6m at Ferry point.",
    timeAgo: "10m ago",
    severity: "Critical",
    issuedBy: "State Emergency Operations Center (SEOC)"
  },
  {
    id: "a-102",
    title: "Severe Weather & Gale Advisory",
    code: "IMD-ORANGE-09",
    subtitle: "Heavy rainfall with wind gusts up to 65 km/h over the next 6 hours.",
    timeAgo: "45m ago",
    severity: "High",
    issuedBy: "India Meteorological Department"
  }
];

export const seedShelters = [
  {
    id: "SH-01",
    name: "Govt Higher Secondary Camp",
    location: "Upper Ridge Safe Sector",
    capacity: 300,
    occupied: 264,
    distance: "1.2 km NW",
    amenities: "Medical tent, Clean water, Hot meals",
    hasMedical: true,
    hasAirlift: false
  },
  {
    id: "SH-02",
    name: "Community Hall Safe Elevation",
    location: "Ward 2 Safe Elevation",
    capacity: 150,
    occupied: 63,
    distance: "2.4 km N",
    amenities: "Generator power, Blankets, Dry rations",
    hasMedical: false,
    hasAirlift: false
  },
  {
    id: "SH-03",
    name: "Helipad Staging Relief Camp",
    location: "Transit Post Perimeter",
    capacity: 400,
    occupied: 110,
    distance: "4.8 km NE",
    amenities: "Helitac medevac staging, Surgical unit",
    hasMedical: true,
    hasAirlift: true
  }
];
