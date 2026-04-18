/**
 * astar.js — A* pathfinding on the contracted OSM road graph.
 *
 * Uses a binary min-heap priority queue for O(log n) open-set operations.
 * Heuristic: haversine distance to goal (admissible + consistent).
 * Edge costs: provided by edgeCost() from scoring.js (dead zone + fleet aware).
 */

import { edgeCost } from "./scoring.js";

// ── Binary Min-Heap ───────────────────────────────────────────
class MinHeap {
  constructor() { this._h = []; }

  get size() { return this._h.length; }

  push(item) {
    this._h.push(item);
    this._up(this._h.length - 1);
  }

  pop() {
    const top  = this._h[0];
    const last = this._h.pop();
    if (this._h.length > 0) {
      this._h[0] = last;
      this._down(0);
    }
    return top;
  }

  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._h[p].f <= this._h[i].f) break;
      [this._h[p], this._h[i]] = [this._h[i], this._h[p]];
      i = p;
    }
  }

  _down(i) {
    const n = this._h.length;
    while (true) {
      let min = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._h[l].f < this._h[min].f) min = l;
      if (r < n && this._h[r].f < this._h[min].f) min = r;
      if (min === i) break;
      [this._h[min], this._h[i]] = [this._h[i], this._h[min]];
      i = min;
    }
  }
}

// ── Haversine heuristic ───────────────────────────────────────
function h(nodeCoords, aId, bId) {
  const a = nodeCoords.get(aId);
  const b = nodeCoords.get(bId);
  if (!a || !b) return 0;
  const R    = 6_371_000;
  const toR  = d => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const x    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ── Path reconstruction ───────────────────────────────────────
function reconstructPath(cameFrom, destId) {
  const segments = [];
  let cur = destId;
  while (cameFrom.has(cur)) {
    const { parentId, coords } = cameFrom.get(cur);
    segments.unshift(coords);
    cur = parentId;
  }
  // Flatten segments, avoiding duplicate shared endpoints
  const path = [];
  for (const seg of segments) {
    if (path.length === 0) path.push(...seg);
    else path.push(...seg.slice(1));
  }
  return path;
}

// ── Public API ────────────────────────────────────────────────
/**
 * Find the lowest-cost path from originId to destId.
 *
 * @param {Map}    adjacency      — from graph.js
 * @param {Map}    nodeCoords     — from graph.js
 * @param {string} originId
 * @param {string} destId
 * @param {number} sliderVal      — 0 (speed-only) → 100 (max connectivity)
 * @param {Array}  towers         — CELL_TOWERS from data.js
 * @param {Object} coverageRadius — COVERAGE_RADIUS from data.js
 * @param {number} fleetNow       — vehicles/hr at current hour
 * @param {Array}  [weatherZones] — WEATHER_ZONES from data.js (optional)
 * @returns {Array<[number, number]>|null}  [[lat, lng], ...] or null if no path
 */
export function findRoute(
  adjacency, nodeCoords,
  originId, destId,
  sliderVal, towers, coverageRadius, fleetNow, weatherZones
) {
  const openSet  = new MinHeap();
  const gScore   = new Map(); // nodeId → best g-cost so far
  const cameFrom = new Map(); // nodeId → { parentId, coords }
  const closed   = new Set();

  gScore.set(originId, 0);
  openSet.push({ id: originId, f: h(nodeCoords, originId, destId) });

  let iterations = 0;
  const MAX_ITER = 100_000; // safety cap

  while (openSet.size > 0 && iterations++ < MAX_ITER) {
    const { id: cur } = openSet.pop();

    if (cur === destId) return reconstructPath(cameFrom, destId);
    if (closed.has(cur)) continue;
    closed.add(cur);

    for (const edge of (adjacency.get(cur) ?? [])) {
      if (closed.has(edge.to)) continue;

      const cost       = edgeCost(edge, sliderVal, towers, coverageRadius, fleetNow, weatherZones);
      const tentativeG = gScore.get(cur) + cost;

      if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
        gScore.set(edge.to, tentativeG);
        cameFrom.set(edge.to, { parentId: cur, coords: edge.coords });
        openSet.push({
          id: edge.to,
          f:  tentativeG + h(nodeCoords, edge.to, destId),
        });
      }
    }
  }

  console.warn(`[astar] No path found (iterations: ${iterations})`);
  return null;
}
