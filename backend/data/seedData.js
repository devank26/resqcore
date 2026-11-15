/**
 * Reference data only. Seeded once into an EMPTY database.
 *
 * No incidents, messages, alerts, teams, volunteers or users are ever seeded:
 * all operational data in ResQCore is created by real users at runtime.
 *
 * NOTE: the shelters below are placeholder reference entries (name/capacity/
 * amenities). Their coordinates default to the centre of the sector they
 * belong to and occupancy starts at 0. Replace them with real shelter data
 * for your deployment (via direct DB edit / a future admin endpoint).
 */

const sector = (id, theater, name, shortName, color, description, centerLat, centerLng, bounds) => ({
  id,
  theater,
  name,
  short_name: shortName,
  color,
  description,
  center_lat: centerLat,
  center_lng: centerLng,
  bounds,
  status: 'Active',
  alert_level: 'Normal'
});

export const referenceSectors = [
  // Uttarakhand (primary theater)
  sector('SEC-UK-01', 'uttarakhand', 'Sector 1: Alpha Valley', 'SEC-1: Alpha', '#EF4444',
    'Alaknanda River Gorge & Lower Valley. Flash flood & landslide vulnerability.', 30.565, 79.545,
    [{ lat: 30.585, lng: 79.525 }, { lat: 30.585, lng: 79.565 }, { lat: 30.545, lng: 79.565 }, { lat: 30.545, lng: 79.525 }]),
  sector('SEC-UK-02', 'uttarakhand', 'Sector 2: Bravo Urban', 'SEC-2: Bravo', '#F59E0B',
    'Joshimath Urban Center & Main Bazaar. Structural monitoring & shelter zone.', 30.565, 79.585,
    [{ lat: 30.585, lng: 79.565 }, { lat: 30.585, lng: 79.605 }, { lat: 30.545, lng: 79.605 }, { lat: 30.545, lng: 79.565 }]),
  sector('SEC-UK-03', 'uttarakhand', 'Sector 3: Charlie Ridge', 'SEC-3: Charlie', '#38BDF8',
    'Auli / Upper Mountain Ridge. Helipad extraction & high-altitude recon.', 30.525, 79.585,
    [{ lat: 30.545, lng: 79.565 }, { lat: 30.545, lng: 79.605 }, { lat: 30.505, lng: 79.605 }, { lat: 30.505, lng: 79.565 }]),
  sector('SEC-UK-04', 'uttarakhand', 'Sector 4: Delta Logistics', 'SEC-4: Delta', '#10B981',
    'Chamoli Transit & National Highway Corridor. Heavy machinery & staging.', 30.525, 79.545,
    [{ lat: 30.545, lng: 79.525 }, { lat: 30.545, lng: 79.565 }, { lat: 30.505, lng: 79.565 }, { lat: 30.505, lng: 79.525 }]),

  // Kerala
  sector('SEC-KL-01', 'kerala', 'Sector 1: Coastal Vypin', 'SEC-1: Vypin', '#EF4444',
    'Vypin Island Coastal Surge Zone. Coastal erosion and high tide warnings.', 9.992, 76.225,
    [{ lat: 10.010, lng: 76.210 }, { lat: 10.010, lng: 76.240 }, { lat: 9.975, lng: 76.240 }, { lat: 9.975, lng: 76.210 }]),
  sector('SEC-KL-02', 'kerala', 'Sector 2: Mattancherry Basin', 'SEC-2: Mattancherry', '#F59E0B',
    'Historic District & Canal Inundation Zone.', 9.958, 76.260,
    [{ lat: 9.975, lng: 76.245 }, { lat: 9.975, lng: 76.275 }, { lat: 9.940, lng: 76.275 }, { lat: 9.940, lng: 76.245 }]),
  sector('SEC-KL-03', 'kerala', 'Sector 3: Willingdon Hub', 'SEC-3: Port Hub', '#38BDF8',
    'Willingdon Island Maritime Logistics & Naval Base Relief Staging.', 9.945, 76.280,
    [{ lat: 9.965, lng: 76.265 }, { lat: 9.965, lng: 76.305 }, { lat: 9.925, lng: 76.305 }, { lat: 9.925, lng: 76.265 }]),
  sector('SEC-KL-04', 'kerala', 'Sector 4: Fort Kochi Waterways', 'SEC-4: Fort Kochi', '#10B981',
    'Low-Lying Canal Basin & Ferry Terminal. Swiftwater rescue boat grid.', 9.966, 76.240,
    [{ lat: 9.975, lng: 76.220 }, { lat: 9.975, lng: 76.250 }, { lat: 9.945, lng: 76.250 }, { lat: 9.945, lng: 76.220 }])
];

export const referenceShelters = [
  {
    id: 'SH-01',
    name: 'Govt Higher Secondary Camp',
    location: 'Upper Ridge Safe Sector',
    capacity: 300,
    sector_id: 'SEC-UK-03',
    amenities: 'Medical tent, Clean water, Hot meals',
    has_medical: true,
    has_airlift: false
  },
  {
    id: 'SH-02',
    name: 'Community Hall Safe Elevation',
    location: 'Ward 2 Safe Elevation',
    capacity: 150,
    sector_id: 'SEC-UK-02',
    amenities: 'Generator power, Blankets, Dry rations',
    has_medical: false,
    has_airlift: false
  },
  {
    id: 'SH-03',
    name: 'Helipad Staging Relief Camp',
    location: 'Transit Post Perimeter',
    capacity: 400,
    sector_id: 'SEC-UK-04',
    amenities: 'Helitac medevac staging, Surgical unit',
    has_medical: true,
    has_airlift: true
  }
];

export const referenceVolunteers = [
  {
    id: 'VOL-SEED-01',
    name: 'Dr. Meera Rawat',
    phone: '+91 94120 11001',
    email: 'meera.rawat@resqcore.local',
    skills: ['Trauma Triage', 'First Aid'],
    sector_id: 'SEC-UK-02',
    status: 'Available',
    lat: 30.565,
    lng: 79.585
  },
  {
    id: 'VOL-SEED-02',
    name: 'Arjun Negi',
    phone: '+91 94120 11002',
    email: 'arjun.negi@resqcore.local',
    skills: ['Swiftwater Rescue', 'Radio Comms'],
    sector_id: 'SEC-UK-01',
    status: 'Available',
    lat: 30.565,
    lng: 79.545
  }
];
