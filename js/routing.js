/**
 * routing.js — Fetches real road-following routes from the OSRM public API.
 * Falls back to hardcoded coordinates if the API is unavailable.
 *
 * OSRM demo server: https://router.project-osrm.org  (free, no API key)
 * Note: OSRM returns coordinates as [lng, lat]; Leaflet needs [lat, lng].
 */

const OSRM_BASE    = "https://router.project-osrm.org/route/v1/driving";
const TIMEOUT_MS   = 8000;

// ── Hardcoded fallbacks (used if OSRM is unreachable) ─────────
const FALLBACK = {
  fastest: [
    [40.7421, -74.0001],
    [40.7370, -74.0000],
    [40.7310, -73.9950],
    [40.7250, -73.9920],
    [40.7200, -73.9890],
    [40.7160, -73.9870],
    [40.7075, -73.9826],
  ],
  safe: [
    [40.7421, -74.0001],
    [40.7430, -73.9900],
    [40.7400, -73.9760],
    [40.7340, -73.9680],
    [40.7250, -73.9640],
    [40.7150, -73.9710],
    [40.7075, -73.9826],
  ],
};

// ── Internal helpers ───────────────────────────────────────────
/**
 * Build an OSRM URL from an array of [lat, lng] waypoints.
 * OSRM needs "lng,lat" separated by semicolons.
 */
function buildOSRMUrl(waypoints) {
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
  return `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;
}

/**
 * Convert OSRM GeoJSON coordinates ([lng, lat]) → Leaflet format ([lat, lng]).
 */
function osrmCoordsToLeaflet(coords) {
  return coords.map(([lng, lat]) => [lat, lng]);
}

// ── Public API ─────────────────────────────────────────────────
/**
 * Fetch a road-following route from OSRM.
 *
 * @param {Array<[number, number]>} waypoints - Ordered [[lat, lng], ...] pairs
 * @returns {Promise<Array<[number, number]>>} [[lat, lng], ...] following real roads
 * @throws {Error} if network fails or OSRM returns no route
 */
export async function fetchOSRMRoute(waypoints) {
  const url = buildOSRMUrl(waypoints);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res  = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) {
      throw new Error("OSRM returned no route");
    }

    return osrmCoordsToLeaflet(data.routes[0].geometry.coordinates);

  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Fetch both candidate routes concurrently.
 * Returns hardcoded fallbacks for any route that fails.
 *
 * @param {{ origin, destination, safeWaypoint }} pts — [lat, lng] triplet
 * @returns {Promise<{ fastest: LatLng[], safe: LatLng[] }>}
 */
export async function fetchBothRoutes({ origin, destination, safeWaypoint }) {
  const [fastResult, safeResult] = await Promise.allSettled([
    fetchOSRMRoute([origin, destination]),
    fetchOSRMRoute([origin, safeWaypoint, destination]),
  ]);

  const fastest = fastResult.status === "fulfilled"
    ? fastResult.value
    : (console.warn("OSRM fastest failed, using fallback:", fastResult.reason), FALLBACK.fastest);

  const safe = safeResult.status === "fulfilled"
    ? safeResult.value
    : (console.warn("OSRM safe failed, using fallback:", safeResult.reason), FALLBACK.safe);

  return { fastest, safe };
}
