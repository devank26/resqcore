const rawBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

export const API_BASE_URL = rawBase;

export function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export function wsUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE_URL) {
    const wsBase = API_BASE_URL.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
    return `${wsBase}${normalized}`;
  }
  const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:5000';
  return `${proto}//${host}${normalized}`;
}

export const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

const GOOGLE_MAPS_OVERRIDE_STORAGE_KEY = 'RESQCORE_GOOGLE_MAPS_API_KEY_OVERRIDE';

export function getGoogleMapsApiKey() {
  try {
    const override = (localStorage.getItem(GOOGLE_MAPS_OVERRIDE_STORAGE_KEY) || '').trim();
    if (override) return override;
  } catch {
    // ignore storage errors
  }
  return GOOGLE_MAPS_API_KEY;
}

export function hasGoogleMapsApiKeyOverride() {
  try {
    return Boolean((localStorage.getItem(GOOGLE_MAPS_OVERRIDE_STORAGE_KEY) || '').trim());
  } catch {
    return false;
  }
}

export function setGoogleMapsApiKeyOverride(key) {
  try {
    const cleaned = (key || '').trim();
    if (cleaned) {
      localStorage.setItem(GOOGLE_MAPS_OVERRIDE_STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(GOOGLE_MAPS_OVERRIDE_STORAGE_KEY);
    }
    clearGoogleMapsSessionError();
  } catch {
    // ignore storage errors
  }
}

export function clearGoogleMapsApiKeyOverride() {
  try {
    localStorage.removeItem(GOOGLE_MAPS_OVERRIDE_STORAGE_KEY);
    clearGoogleMapsSessionError();
  } catch {
    // ignore storage errors
  }
}

const GOOGLE_MAPS_SESSION_ERROR_KEY = 'RESQCORE_GMAPS_SESSION_ERROR';

export function getGoogleMapsSessionError(apiKey) {
  try {
    const raw = sessionStorage.getItem(GOOGLE_MAPS_SESSION_ERROR_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    if (parsed?.key === apiKey && parsed?.message) {
      return parsed.message;
    }
    return '';
  } catch {
    return '';
  }
}

export function markGoogleMapsSessionError(apiKey, message) {
  try {
    if (!apiKey) return;
    sessionStorage.setItem(
      GOOGLE_MAPS_SESSION_ERROR_KEY,
      JSON.stringify({ key: apiKey, message: message || 'Google Maps API key rejected or quota exceeded.' })
    );
  } catch {
    // ignore storage errors
  }
}

export function clearGoogleMapsSessionError() {
  try {
    sessionStorage.removeItem(GOOGLE_MAPS_SESSION_ERROR_KEY);
  } catch {
    // ignore storage errors
  }
}

const TOKEN_STORAGE_KEY = 'RESQCORE_COMMAND_JWT';

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredToken(token, remember = true) {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    if (!token) return;
    if (remember) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore storage errors
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}
