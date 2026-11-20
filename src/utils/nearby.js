// [F3] Nearby helpers — Livo F3 (Nearby + filters).
// Plain JS (no JSX, no expo-location import at the top of this file).
// expo-location is NOT installed in this project, so this module must
// never import/require it — not statically, and not with a dynamic
// require either: LIVO-3 proved a guarded dynamic require still crashes
// the app when the Nearby tab opens. loadLocationModule() below simply
// returns null until the package is really installed.
// Country-based proximity is the LIVE path today (same-country hosts
// first, then the rest). Real-distance mode (haversine, below) is wired
// for when expo-location is ever installed later; it must not activate
// or crash without the package. No location is ever read without
// permission — callers must request it first (see HomeScreen).
// Known limitation: host lat/lng in src/data.js are DEMO home-city
// coordinates (Dhaka / Delhi / Karachi / Mumbai), not live host GPS.
// [/F3]

/**
 * [F3] expo-location is NOT installed in this project, so there is
 * nothing to load: always return null and let callers use the
 * country-based fallback (same-country hosts first).
 * LIVO-3 (2026-11-19 23:09 SGT, Sentry): the previous version tried a
 * dynamic require('expo' + '-location') guarded by try/catch, and it
 * still crashed the app fatally ("Requiring unknown module
 * 'undefined'") the first time the Nearby tab opened — Metro cannot
 * resolve a variable require. Do NOT bring the dynamic require back.
 * If expo-location is ever added to package.json, replace this with a
 * static import instead. [/F3]
 */
export function loadLocationModule() {
  return null;
}

/**
 * [F3] Great-circle distance in km between two lat/lng points.
 * [/F3]
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * [F3] Distance in km from the user to a host, or null when either
 * side has no usable coordinates (host coords are demo city coords).
 * userCoords: { latitude, longitude }. Host: { lat, lng }.
 * [/F3]
 */
export function distanceToHostKm(userCoords, host) {
  if (!userCoords || typeof userCoords.latitude !== 'number' || typeof userCoords.longitude !== 'number') {
    return null;
  }
  if (!host || typeof host.lat !== 'number' || typeof host.lng !== 'number') {
    return null;
  }
  return haversineKm(userCoords.latitude, userCoords.longitude, host.lat, host.lng);
}

/**
 * [F3] Human-readable distance: "2,885 km", "4.2 km", "<1 km".
 * Returns '' when the distance is unknown (null/undefined).
 * [/F3]
 */
export function formatDistance(km) {
  if (km === null || km === undefined || Number.isNaN(km)) {
    return '';
  }
  if (km < 1) {
    return '<1 km';
  }
  if (km < 100) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

/**
 * [F3] Order hosts for the Nearby tab.
 * - When userCoords exist: nearest-first by real distance; hosts
 *   without coordinates sort last. (Only reachable once expo-location
 *   is installed and permission is granted — never today.)
 * - Otherwise: same-country-first (userCountry, e.g. 'SGP'), then the
 *   rest. Stable: hosts that tie keep their original list order.
 * Never mutates the input array.
 * [/F3]
 */
export function sortNearbyHosts(hosts, { userCoords, userCountry } = {}) {
  const indexed = (hosts || []).map((host, index) => ({ host, index }));
  if (userCoords) {
    indexed.sort((a, b) => {
      const da = distanceToHostKm(userCoords, a.host);
      const db = distanceToHostKm(userCoords, b.host);
      if (da === null && db === null) return a.index - b.index;
      if (da === null) return 1;
      if (db === null) return -1;
      if (da !== db) return da - db;
      return a.index - b.index;
    });
  } else if (userCountry) {
    indexed.sort((a, b) => {
      const aSame = a.host.country === userCountry ? 0 : 1;
      const bSame = b.host.country === userCountry ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
      return a.index - b.index;
    });
  }
  return indexed.map(({ host }) => host);
}
