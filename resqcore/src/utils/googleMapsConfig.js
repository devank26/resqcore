// Tactical Dark Styling for Command Center Google Maps
export const TACTICAL_DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#091122' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#091122' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#748DA6' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#94A3B8' }]
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748B' }]
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#0D1E32' }]
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#38BDF8' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#162846' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0E172A' }]
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8899A6' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#1E3A8A' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0F172A' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#60A5FA' }]
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#132338' }]
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#94A3B8' }]
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#030814' }]
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#38BDF8' }]
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#030814' }]
  }
];

// Helper to parse coordinate string like "9.9658° N" or number into float
export function parseCoord(val, defaultVal = 0) {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return defaultVal;
  const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return defaultVal;
  if (val.includes('S') || val.includes('W')) return -num;
  return num;
}

// Default Command Center Focus (Dehradun, Uttarakhand)
export const DEFAULT_COMMAND_CENTER_LOCATION = {
  lat: 30.3165,
  lng: 78.0322,
  zoom: 10
};

export const UTTARAKHAND_DISTRICT_COORDS = {
  'Dehradun, Uttarakhand': { lat: 30.3165, lng: 78.0322, zoom: 11 },
  'Dehradun': { lat: 30.3165, lng: 78.0322, zoom: 11 },
  'Joshimath, Uttarakhand': { lat: 30.5593, lng: 79.5644, zoom: 12 },
  'Joshimath': { lat: 30.5593, lng: 79.5644, zoom: 12 },
  'Chamoli, Uttarakhand': { lat: 30.4072, lng: 79.3242, zoom: 11 },
  'Chamoli': { lat: 30.4072, lng: 79.3242, zoom: 11 },
  'Rudraprayag, Uttarakhand': { lat: 30.2844, lng: 78.9811, zoom: 11 },
  'Uttarkashi, Uttarakhand': { lat: 30.7268, lng: 78.4354, zoom: 10 },
  'Nainital, Uttarakhand': { lat: 29.3919, lng: 79.4542, zoom: 11 },
  'Haridwar, Uttarakhand': { lat: 29.9457, lng: 78.1642, zoom: 11 },
  'Pithoragarh, Uttarakhand': { lat: 29.5829, lng: 80.2182, zoom: 10 },
  'Tehri Garhwal, Uttarakhand': { lat: 30.3789, lng: 78.4803, zoom: 10 },
  'Rishikesh, Uttarakhand': { lat: 30.0869, lng: 78.2676, zoom: 12 },
  'Ernakulam, Kerala': { lat: 9.9816, lng: 76.2999, zoom: 12 },
  'Ernakulam': { lat: 9.9816, lng: 76.2999, zoom: 12 },
  'Fort Kochi, Kerala': { lat: 9.9658, lng: 76.2421, zoom: 13 },
  'Vypin, Kerala': { lat: 9.9920, lng: 76.2300, zoom: 13 }
};

export function getDistrictCenter(districtName) {
  if (districtName && UTTARAKHAND_DISTRICT_COORDS[districtName]) {
    return UTTARAKHAND_DISTRICT_COORDS[districtName];
  }
  // Check partial match
  if (districtName) {
    const match = Object.keys(UTTARAKHAND_DISTRICT_COORDS).find(k =>
      districtName.toLowerCase().includes(k.toLowerCase()) ||
      k.toLowerCase().includes(districtName.toLowerCase())
    );
    if (match) return UTTARAKHAND_DISTRICT_COORDS[match];
  }
  return DEFAULT_COMMAND_CENTER_LOCATION;
}

// Generates an SVG Data URI for an Ongoing Mission Vector Midpoint Badge
export function createMissionBadgeIcon(label = 'MISSION', isSelected = false) {
  const width = Math.max(label.length * 7 + 34, 110);
  const height = 24;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="badgeShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#10B981" flood-opacity="0.5"/>
        </filter>
      </defs>
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="11" fill="#091427" stroke="${isSelected ? '#38BDF8' : '#10B981'}" stroke-width="${isSelected ? 2 : 1.2}" filter="url(#badgeShadow)"/>
      <circle cx="12" cy="12" r="3.5" fill="${isSelected ? '#38BDF8' : '#10B981'}"/>
      <text x="${width / 2 + 5}" y="15.5" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9.5" font-weight="800" fill="#F8FAFC" text-anchor="middle" letter-spacing="0.4">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// Special high-contrast pulsating SOS marker for Citizen & Rescue distress emergencies
export function createSosMarkerIcon(isRescue = false, isSelected = false) {
  const size = isSelected ? 44 : 36;
  const radius = size / 2;
  const color = '#EF4444';
  const label = isRescue ? 'RESCUE' : 'SOS';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <radialGradient id="beaconGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#EF4444" stop-opacity="0.95"/>
          <stop offset="65%" stop-color="#DC2626" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="#991B1B" stop-opacity="0.1"/>
        </radialGradient>
        <filter id="sosGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#EF4444" flood-opacity="0.9"/>
        </filter>
      </defs>
      <!-- Outer expanding pulse circle -->
      <circle cx="${radius}" cy="${radius}" r="${radius - 2}" fill="url(#beaconGlow)" filter="url(#sosGlow)"/>
      <!-- Inner dark tactical core -->
      <circle cx="${radius}" cy="${radius}" r="${radius - 6}" fill="#0A0F1D" stroke="#EF4444" stroke-width="${isSelected ? 3 : 2}"/>
      <!-- Center alarm signal -->
      <circle cx="${radius}" cy="${radius - 5}" r="3" fill="#FFFFFF"/>
      <!-- Emergency Badge Text -->
      <text x="${radius}" y="${radius + 7}" font-family="sans-serif" font-size="7.5" font-weight="900" fill="#EF4444" text-anchor="middle" letter-spacing="0.5">${label}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// Generates an SVG Data URI for tactical pins
export function createTacticalMarkerIcon(severity, isVerified = false, isSelected = false, isCitizenSOS = false, isRescueSOS = false) {
  if (isRescueSOS) {
    return createSosMarkerIcon(true, isSelected);
  }
  if (isCitizenSOS) {
    return createSosMarkerIcon(false, isSelected);
  }

  const color = isVerified
    ? '#10B981'
    : severity === 'High' || severity === 'Critical'
    ? '#EF4444'
    : severity === 'Medium'
    ? '#F59E0B'
    : '#38BDF8';

  const size = isSelected ? 36 : 28;
  const radius = size / 2;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${color}" flood-opacity="0.6"/>
        </filter>
      </defs>
      <circle cx="${radius}" cy="${radius}" r="${radius - 3}" fill="#091122" stroke="${color}" stroke-width="${isSelected ? 3 : 2}" filter="url(#glow)"/>
      <circle cx="${radius}" cy="${radius}" r="5" fill="${color}"/>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// Marker for Rescue Teams (Shield)
export function createTeamMarkerIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="#091122" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// Tactical Sectors division across operational theaters
export const TACTICAL_SECTORS = {
  uttarakhand: [
    {
      id: 'SEC-1',
      name: 'Sector 1: Alpha Valley',
      shortName: 'SEC-1: Alpha',
      color: '#EF4444',
      description: 'Alaknanda River Gorge & Lower Valley. Flash flood & landslide vulnerability.',
      center: { lat: 30.565, lng: 79.545 },
      bounds: [
        { lat: 30.585, lng: 79.525 },
        { lat: 30.585, lng: 79.565 },
        { lat: 30.545, lng: 79.565 },
        { lat: 30.545, lng: 79.525 }
      ]
    },
    {
      id: 'SEC-2',
      name: 'Sector 2: Bravo Urban',
      shortName: 'SEC-2: Bravo',
      color: '#F59E0B',
      description: 'Joshimath Urban Center & Main Bazaar. Structural monitoring & shelter zone.',
      center: { lat: 30.565, lng: 79.585 },
      bounds: [
        { lat: 30.585, lng: 79.565 },
        { lat: 30.585, lng: 79.605 },
        { lat: 30.545, lng: 79.605 },
        { lat: 30.545, lng: 79.565 }
      ]
    },
    {
      id: 'SEC-3',
      name: 'Sector 3: Charlie Ridge',
      shortName: 'SEC-3: Charlie',
      color: '#38BDF8',
      description: 'Auli / Upper Mountain Ridge. Helipad extraction & high-altitude recon.',
      center: { lat: 30.525, lng: 79.585 },
      bounds: [
        { lat: 30.545, lng: 79.565 },
        { lat: 30.545, lng: 79.605 },
        { lat: 30.505, lng: 79.605 },
        { lat: 30.505, lng: 79.565 }
      ]
    },
    {
      id: 'SEC-4',
      name: 'Sector 4: Delta Logistics',
      shortName: 'SEC-4: Delta',
      color: '#10B981',
      description: 'Chamoli Transit & National Highway Corridor. Heavy machinery & staging.',
      center: { lat: 30.525, lng: 79.545 },
      bounds: [
        { lat: 30.545, lng: 79.525 },
        { lat: 30.545, lng: 79.565 },
        { lat: 30.505, lng: 79.565 },
        { lat: 30.505, lng: 79.525 }
      ]
    }
  ],
  kerala: [
    {
      id: 'SEC-1',
      name: 'Sector 1: Coastal Vypin',
      shortName: 'SEC-1: Vypin',
      color: '#EF4444',
      description: 'Vypin Island Coastal Surge Zone. Coastal erosion and high tide warnings.',
      center: { lat: 9.992, lng: 76.225 },
      bounds: [
        { lat: 10.010, lng: 76.210 },
        { lat: 10.010, lng: 76.240 },
        { lat: 9.975, lng: 76.240 },
        { lat: 9.975, lng: 76.210 }
      ]
    },
    {
      id: 'SEC-2',
      name: 'Sector 2: Mattancherry Basin',
      shortName: 'SEC-2: Mattancherry',
      color: '#F59E0B',
      description: 'Historic District & Canal Inundation Zone. Heritage drainage barriers.',
      center: { lat: 9.958, lng: 76.260 },
      bounds: [
        { lat: 9.975, lng: 76.245 },
        { lat: 9.975, lng: 76.275 },
        { lat: 9.940, lng: 76.275 },
        { lat: 9.940, lng: 76.245 }
      ]
    },
    {
      id: 'SEC-3',
      name: 'Sector 3: Willingdon Hub',
      shortName: 'SEC-3: Port Hub',
      color: '#38BDF8',
      description: 'Willingdon Island Maritime Logistics & Naval Base Relief Staging.',
      center: { lat: 9.945, lng: 76.280 },
      bounds: [
        { lat: 9.965, lng: 76.265 },
        { lat: 9.965, lng: 76.305 },
        { lat: 9.925, lng: 76.305 },
        { lat: 9.925, lng: 76.265 }
      ]
    },
    {
      id: 'SEC-4',
      name: 'Sector 4: Fort Kochi Waterways',
      shortName: 'SEC-4: Fort Kochi',
      color: '#10B981',
      description: 'Low-Lying Canal Basin & Ferry Terminal. Swiftwater rescue boat grid.',
      center: { lat: 9.966, lng: 76.240 },
      bounds: [
        { lat: 9.975, lng: 76.220 },
        { lat: 9.975, lng: 76.250 },
        { lat: 9.945, lng: 76.250 },
        { lat: 9.945, lng: 76.220 }
      ]
    }
  ],
  california: [
    {
      id: 'SEC-1',
      name: 'Sector 1: Shoreline North',
      shortName: 'SEC-1: Shoreline',
      color: '#EF4444',
      description: 'North Bay Wetland & Flood Basin. Waterway containment and drone patrol.',
      center: { lat: 37.435, lng: -122.085 },
      bounds: [
        { lat: 37.450, lng: -122.105 },
        { lat: 37.450, lng: -122.065 },
        { lat: 37.420, lng: -122.065 },
        { lat: 37.420, lng: -122.105 }
      ]
    },
    {
      id: 'SEC-2',
      name: 'Sector 2: East Bayfront',
      shortName: 'SEC-2: Bayfront',
      color: '#F59E0B',
      description: 'Newark & Bayfront Levee Sector. Evacuation route and logistics hub.',
      center: { lat: 37.435, lng: -122.045 },
      bounds: [
        { lat: 37.450, lng: -122.065 },
        { lat: 37.450, lng: -122.025 },
        { lat: 37.420, lng: -122.025 },
        { lat: 37.420, lng: -122.065 }
      ]
    },
    {
      id: 'SEC-3',
      name: 'Sector 3: Tech Grid Central',
      shortName: 'SEC-3: Central',
      color: '#38BDF8',
      description: 'Mountain View Central Operational Hub & Medical Response Base.',
      center: { lat: 37.405, lng: -122.085 },
      bounds: [
        { lat: 37.420, lng: -122.105 },
        { lat: 37.420, lng: -122.065 },
        { lat: 37.390, lng: -122.065 },
        { lat: 37.390, lng: -122.105 }
      ]
    },
    {
      id: 'SEC-4',
      name: 'Sector 4: South Highway Transit',
      shortName: 'SEC-4: Transit',
      color: '#10B981',
      description: 'Highway 101 / 237 Corridor. Transport staging and triage checkpoints.',
      center: { lat: 37.405, lng: -122.045 },
      bounds: [
        { lat: 37.420, lng: -122.065 },
        { lat: 37.420, lng: -122.025 },
        { lat: 37.390, lng: -122.025 },
        { lat: 37.390, lng: -122.065 }
      ]
    }
  ]
};

export function getTacticalSectors(lat, lng, isDemo = false) {
  if (lat && lng) {
    if (lat > 35 && lat < 40 && lng < -115 && lng > -125) {
      return TACTICAL_SECTORS.california;
    }
    if (lat < 15 && lat > 7) {
      return TACTICAL_SECTORS.kerala;
    }
  }
  return isDemo ? TACTICAL_SECTORS.kerala : TACTICAL_SECTORS.uttarakhand;
}
