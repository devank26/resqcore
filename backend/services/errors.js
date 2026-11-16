export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (msg, extra) => new HttpError(400, msg, extra);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, msg);
export const forbidden = (msg = 'You do not have permission to perform this action') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);
export const tooMany = (msg = 'Too many requests, try again later', extra = {}) => new HttpError(429, msg, extra);

// ---- small validation helpers ------------------------------------------------

export function cleanString(value, { max = 500, required = false, field = 'value' } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') throw badRequest(`${field} must be a string`);
  const trimmed = value.trim();
  if (required && !trimmed) throw badRequest(`${field} is required`);
  if (trimmed.length > max) throw badRequest(`${field} must be at most ${max} characters`);
  return trimmed;
}

export function oneOf(value, allowed, { field = 'value', fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw badRequest(`${field} is required`);
  }
  if (!allowed.includes(value)) {
    throw badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

/**
 * Accepts {lat,lng} or {latitude,longitude} with numeric (or numeric-string) values.
 * Returns {lat,lng} or null when nothing was provided. Throws on invalid input.
 */
export function parseCoords(input, { field = 'coordinates' } = {}) {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'object') throw badRequest(`${field} must be an object with lat/lng`);
  const rawLat = input.latitude ?? input.lat;
  const rawLng = input.longitude ?? input.lng;
  if ((rawLat === undefined || rawLat === null || rawLat === '') &&
      (rawLng === undefined || rawLng === null || rawLng === '')) {
    return null;
  }
  const lat = typeof rawLat === 'number' ? rawLat : Number(rawLat);
  const lng = typeof rawLng === 'number' ? rawLng : Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw badRequest(`${field} must contain numeric lat (-90..90) and lng (-180..180)`);
  }
  return { lat, lng };
}
