import { dbManager as db } from './database.js';
import { eventBus } from './eventBus.js';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const USGS_INDIA_URL =
  'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=6&maxlatitude=38&minlongitude=68&maxlongitude=98&minmagnitude=3.5&limit=20';

async function fetchJsonWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function pollUsgsEarthquakes() {
  try {
    const geo = await fetchJsonWithTimeout(USGS_INDIA_URL);
    const features = Array.isArray(geo?.features) ? geo.features : [];
    for (const f of features) {
      const externalId = String(f.id || '');
      if (!externalId) continue;
      const mag = Number(f.properties?.mag ?? 0);
      const place = f.properties?.place || 'India Region';
      const coords = f.geometry?.coordinates || [];
      const sector = coords.length >= 2 ? await db.findSectorForPoint(coords[1], coords[0]) : null;
      const severity = mag >= 5.5 ? 'Critical' : mag >= 4.5 ? 'High' : 'Medium';

      const alert = await db.insertAlert({
        title: `Earthquake M${mag.toFixed(1)} · ${place}`,
        code: `USGS-${externalId.slice(0, 8).toUpperCase()}`,
        subtitle: `USGS seismic event magnitude ${mag.toFixed(1)} near ${place}`,
        severity,
        recipients: 'All units & sectors',
        audience: 'all',
        issuedBy: 'USGS Feed',
        sectorId: sector?.id ?? null,
        source: 'usgs',
        externalId
      });
      if (alert) {
        eventBus.emitRealtime('alert_created', { alert });
      }
    }
  } catch (err) {
    console.warn('[Feeds] USGS poll error:', err.message);
  }
}

export async function pollOpenMeteoSectors() {
  try {
    const sectors = await db.getSectors();
    const hourBucket = new Date().toISOString().slice(0, 13); // dedupe per sector per hour
    for (const sector of sectors) {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${sector.center.lat}&longitude=${sector.center.lng}&current=precipitation,rain,weather_code,wind_speed_10m`;
        const data = await fetchJsonWithTimeout(url);
        const cur = data?.current;
        if (!cur) continue;

        const rain = Number(cur.rain || 0);
        const precip = Number(cur.precipitation || 0);
        const wind = Number(cur.wind_speed_10m || 0);
        const code = Number(cur.weather_code || 0);

        const isSevere = rain >= 10 || precip >= 10 || wind >= 50 || code >= 95;
        if (!isSevere) continue;

        const severity = rain >= 25 || precip >= 25 || wind >= 70 ? 'Critical' : 'High';
        const alert = await db.insertAlert({
          title: `Severe Weather / Flood Risk · ${sector.shortName}`,
          code: `METEO-${sector.id}`,
          subtitle: `Rain ${rain}mm, Precip ${precip}mm, Wind ${wind} km/h (WMO ${code})`,
          severity,
          recipients: sector.name,
          audience: 'all',
          issuedBy: 'Open-Meteo Feed',
          sectorId: sector.id,
          source: 'open-meteo',
          externalId: `${sector.id}:${hourBucket}`
        });
        if (alert) {
          eventBus.emitRealtime('alert_created', { alert });
        }
      } catch (err) {
        console.warn(`[Feeds] Open-Meteo error for ${sector.id}:`, err.message);
      }
    }
  } catch (err) {
    console.warn('[Feeds] Open-Meteo poll error:', err.message);
  }
}

export async function runFeedsOnce() {
  await pollUsgsEarthquakes();
  await pollOpenMeteoSectors();
}

let feedTimer = null;
export function startFeeds() {
  if (feedTimer) return;
  // Delay initial poll slightly so startup doesn't block on external network
  const initial = setTimeout(() => {
    runFeedsOnce().catch(() => {});
  }, 5000);
  initial.unref?.();

  feedTimer = setInterval(() => {
    runFeedsOnce().catch(() => {});
  }, TEN_MINUTES_MS);
  feedTimer.unref?.();
}

export function stopFeeds() {
  if (feedTimer) {
    clearInterval(feedTimer);
    feedTimer = null;
  }
}
