/**
 * graph.js — Loads js/graph.json and builds an adjacency list.
 * Also provides getNearestNode() to snap lat/lng to the OSM graph.
 */

// ── Module state (populated after loadGraph()) ────────────────
export let adjacency  = null; // Map<nodeId, [{to, distM, coords}]>
export let nodeCoords = null; // Map<nodeId, {lat, lng}>

/**
 * Fetch and parse graph.json, build the adjacency list.
 * Call once on app init. Returns { adjacency, nodeCoords }.
 */
export async function loadGraph() {
  const res = await fetch("/js/graph.json");
  if (!res.ok) throw new Error(`graph.json fetch failed: ${res.status}`);

  const { nodes, edges } = await res.json();

  nodeCoords = new Map(Object.entries(nodes));
  adjacency  = new Map();

  // Init empty neighbour lists
  for (const id of nodeCoords.keys()) adjacency.set(id, []);

  // Populate from edge list
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push({
      to:     edge.to,
      distM:  edge.distM,
      coords: edge.coords,
    });
  }

  console.log(
    `[graph] Loaded: ${nodeCoords.size} nodes | ${edges.length} edges`
  );
  return { adjacency, nodeCoords };
}

/**
 * Snap a [lat, lng] point to the nearest node in the graph.
 * O(n) linear scan — only called a handful of times on init.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {Map}    nodeMap  — optional, defaults to module-level nodeCoords
 * @returns {string|null}  nodeId
 */
export function getNearestNode(lat, lng, nodeMap = nodeCoords) {
  if (!nodeMap) return null;
  let bestId   = null;
  let bestDist = Infinity;
  for (const [id, pos] of nodeMap) {
    // Cheap Euclidean proxy — fine for snapping within a few km
    const d = (pos.lat - lat) ** 2 + (pos.lng - lng) ** 2;
    if (d < bestDist) { bestDist = d; bestId = id; }
  }
  return bestId;
}
