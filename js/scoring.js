/**
 * scoring.js — Computes connectivity scores from real route geometry
 * against simulated cell tower coverage zones.
 *
 * No Leaflet dependency — uses a pure Haversine distance formula.
 */

// Quality ranking for connectivity score weights:
//   green > yellow > orange > red > none
const QUALITY_WEIGHT = { green: 1.0, yellow: 0.6, orange: 0.3, red: 0.0, none: 0.5 };

// ── Haversine distance (no Leaflet needed) ─────────────────────
/**
 * Distance in metres between two lat/lng points.
 * @returns {number} metres
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R    = 6_371_000; // Earth radius in metres
  const toR  = x => (x * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Per-point signal quality ───────────────────────────────────
/**
 * Determine the best signal quality available at a given lat/lng
 * by checking all towers.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {Array}  towers        — CELL_TOWERS array from data.js
 * @param {Object} coverageRadius — { green, yellow, red } from data.js
 * @returns {"green"|"yellow"|"red"|"none"}
 */
export function getPointSignalQuality(lat, lng, towers, coverageRadius) {
  let best = "none";

  for (const tower of towers) {
    const dist   = haversineDistance(lat, lng, tower.lat, tower.lng);
    const radius = coverageRadius[tower.quality];
    if (!radius || dist > radius) continue;

    // Rank: green > yellow > orange > red > none
    if (tower.quality === "green")                                   return "green";
    if (tower.quality === "yellow" && best !== "green")              best = "yellow";
    if (tower.quality === "orange" && !['green','yellow'].includes(best)) best = "orange";
    if (tower.quality === "red"    && best === "none")               best = "red";
  }

  return best;
}

// ── Route connectivity score ───────────────────────────────────
/**
 * Walk every coordinate in a route and compute a weighted connectivity
 * score from 0 → 100.
 *
 * @param {Array<[number, number]>} routeCoords - [[lat, lng], ...]
 * @param {Array}  towers
 * @param {Object} coverageRadius
 * @returns {number} 0–100 (rounded integer)
 */
export function computeConnScore(routeCoords, towers, coverageRadius) {
  if (!routeCoords.length) return 0;

  const totalWeight = routeCoords.reduce((sum, [lat, lng]) => {
    const quality = getPointSignalQuality(lat, lng, towers, coverageRadius);
    return sum + QUALITY_WEIGHT[quality];
  }, 0);

  return Math.round((totalWeight / routeCoords.length) * 100);
}

// ── Dead zone segment extraction ───────────────────────────────
/**
 * Return the subset of route coordinates that fall inside any RED coverage
 * zone (RSSI < −100 dBm). Used to draw the dead-zone highlight on the map.
 *
 * If no points are in a red zone, returns the 3 points nearest to the
 * weakest tower instead (guarantees something to highlight).
 *
 * @param {Array<[number, number]>} routeCoords
 * @param {Array}  towers
 * @param {Object} coverageRadius
 * @returns {Array<[number, number]>} subset (may be empty only if route has < 2 coords)
 */
export function findDeadZoneSegment(routeCoords, towers, coverageRadius) {
  const redTowers = towers.filter(t => t.quality === "red");
  if (!redTowers.length) return [];

  // Points that fall inside any red tower's radius
  const inRed = routeCoords.filter(([lat, lng]) =>
    redTowers.some(t => haversineDistance(lat, lng, t.lat, t.lng) <= coverageRadius.red)
  );
  if (inRed.length >= 2) return inRed;

  // Fallback: find the 5 route points closest to the nearest red tower,
  // but keep them in their original route order (not sorted by distance).
  const redTower = redTowers[0];
  const indexed  = routeCoords.map((pt, i) => ({
    pt, i,
    dist: haversineDistance(pt[0], pt[1], redTower.lat, redTower.lng),
  }));
  const closest5Indices = new Set(
    indexed.sort((a, b) => a.dist - b.dist).slice(0, 5).map(x => x.i)
  );
  // Restore route order
  return routeCoords.filter((_, i) => closest5Indices.has(i));
}

// ── Dead zone duration estimate ────────────────────────────────
/**
 * Estimate how long (seconds) a vehicle spends in the dead zone,
 * assuming a constant speed.
 *
 * @param {Array<[number, number]>} dzSegment
 * @param {number} speedKmh - default 50 km/h
 * @returns {number} seconds (rounded)
 */
export function estimateDZDuration(dzSegment, speedKmh = 50) {
  if (dzSegment.length < 2) return 0;

  let totalMetres = 0;
  for (let i = 1; i < dzSegment.length; i++) {
    const [la, lo] = dzSegment[i - 1];
    const [lb, lp] = dzSegment[i];
    totalMetres += haversineDistance(la, lo, lb, lp);
  }

  const speedMs = (speedKmh * 1000) / 3600;
  return Math.max(0, Math.round(totalMetres / speedMs));
}

// ── A* edge cost function ──────────────────────────────────────
/**
 * Dead zone penalty multipliers per signal quality tier.
 * orange = 2.0: moderate penalty — routes through it when the detour is worse,
 *               but avoids it once the slider is high enough.
 * red    = 6.0: severe penalty — avoided as soon as slider hits ~35.
 */
const DZ_PENALTY = { green: 0.0, yellow: 0.2, orange: 3.0, red: 6.0, none: 0.05 };

/** Orange zones do NOT get the mesh-buffer discount (V2V relay story only applies to full dead zones). */
const MESH_BUFFERED_QUALITIES = new Set(['red']);

/** Historical peak fleet density (used to normalise mesh buffer). */
const FLEET_MAX = 11;

/**
 * Compute the A* traversal cost for one road graph edge.
 *
 * The formula encodes the core project idea:
 *   - At sliderVal=0  (speed-only): cost = raw distM, dead zones are free.
 *   - At sliderVal=100 (max signal): a red dead-zone edge costs 3.5× more.
 *   - High fleet density at the current hour → mesh relay is viable →
 *     the dead-zone penalty is partially discounted ("mesh buffer"),
 *     because a nearby bridge node can absorb the SOS payload.
 *
 * @param {{ distM: number, coords: [number,number][] }} edge
 * @param {number} sliderVal      — 0–100
 * @param {Array}  towers         — CELL_TOWERS from data.js
 * @param {Object} coverageRadius — COVERAGE_RADIUS from data.js
 * @param {number} fleetNow       — vehicles/hr at the current hour
 * @returns {number} cost in metres (weighted)
 */
export function edgeCost(edge, sliderVal, towers, coverageRadius, fleetNow) {
  const t = sliderVal / 100; // 0 = speed-only, 1 = max connectivity

  // Find the worst quality and highest raw penalty along this edge
  let worstPenalty = 0;
  let worstQuality = "none";
  for (const [lat, lng] of edge.coords) {
    const quality = getPointSignalQuality(lat, lng, towers, coverageRadius);
    const pen     = DZ_PENALTY[quality] ?? 0;
    if (pen > worstPenalty) { worstPenalty = pen; worstQuality = quality; }
  }

  // Mesh viability buffer: only applies to full red dead zones (the V2V relay story).
  // Orange zones (infrastructure gaps) aren't reachable by bridge nodes — no discount.
  //
  // Buffer fires whenever the slider is above 0 AND P2P is available (fleetNow > 0).
  // At full fleet (fleetRatio=1.0) the discount is 90% of the raw penalty, making the
  // dead zone nearly free to traverse. At fleetNow=0 (P2P toggled off) the buffer is 0
  // and the full 6× penalty applies — enough to trigger a detour across the entire
  // slider range, making the P2P toggle dramatic and clearly visible.
  const fleetRatio  = Math.min(1, (fleetNow ?? 0) / FLEET_MAX);
  const meshBuffer  = (MESH_BUFFERED_QUALITIES.has(worstQuality) && t > 0)
    ? fleetRatio * 0.9 * worstPenalty
    : 0;

  const effectivePenalty = Math.max(0, worstPenalty - meshBuffer);
  return edge.distM * (1 + t * effectivePenalty);
}

