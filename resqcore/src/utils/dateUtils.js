import { useState, useEffect } from 'react';

/**
 * Formats a Date into e.g. "Sunday, 15 November 2026".
 */
export function formatOperationalLongDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${byType.weekday}, ${byType.day} ${byType.month} ${byType.year}`;
}

/**
 * Formats a Date into e.g. "15 Nov".
 */
export function formatOperationalShortDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short'
  }).format(date);
}

/**
 * Returns a Date kept fresh across midnight rollovers.
 */
export function useCurrentDate(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
