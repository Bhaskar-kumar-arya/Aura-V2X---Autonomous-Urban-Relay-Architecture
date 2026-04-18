/**
 * build_graph.mjs — One-time OSM graph builder.
 *
 * Downloads road data from Overpass API for the NYC route area,
 * contracts the graph to intersection-only nodes (dramatically reduces size),
 * and writes js/graph.json for use by the browser A* engine.
 *
 * Run: node scripts/build_graph.mjs
 */

import { writeFileSync } from "node:fs";

// ── Bounding box: Chelsea → Chinatown, NYC ────────────────────
// minlat, minlng, maxlat, maxlng
const BBOX = "40.700,-74.010,40.750,-73.975";

const OVERPASS = "https://overpass-api.de/api/interpreter";

// Only include road types relevant to vehicle routing
const HIGHWAY_TYPES = [
  "motorway", "motorway_link",
  "trunk", "trunk_link",
  "primary", "primary_link",
  "secondary", "secondary_link",
  "tertiary", "tertiary_link",
  "residential", "unclassified",
].join("|");

const QUERY = `
[out:json][timeout:90];
(
  way["highway"~"^(${HIGHWAY_TYPES})$"](${BBOX});
);
out body;
>;
out skel qt;
`.trim();

// ── Haversine distance (metres) ───────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const toR = d => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Main ──────────────────────────────────────────────────────
console.log("📡 Fetching OSM road data from Overpass API…");
console.log(`   BBOX: ${BBOX}`);

const res = await fetch(OVERPASS, {
  method:  "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body:    "data=" + encodeURIComponent(QUERY),
});

if (!res.ok) throw new Error(`Overpass API responded ${res.status}`);

const data = await res.json();
console.log(`✓ Received ${data.elements.length} OSM elements`);

// ── Parse raw elements ────────────────────────────────────────
const nodeMap = new Map(); // rawId → { lat, lng }
const ways    = [];

for (const el of data.elements) {
  if (el.type === "node") {
    nodeMap.set(el.id, { lat: el.lat, lng: el.lon });
  } else if (el.type === "way") {
    ways.push(el);
  }
}
console.log(`   Raw nodes: ${nodeMap.size}  |  Ways: ${ways.length}`);

// ── Find intersection nodes ────────────────────────────────────
// A node is an intersection if it's used by ≥2 ways, or is the
// first/last node of any way (dead-end / route endpoint).
const nodeUseCount = new Map(); // rawId → int

for (const way of ways) {
  for (const id of way.nodes) {
    nodeUseCount.set(id, (nodeUseCount.get(id) ?? 0) + 1);
  }
}

const isIntersection = id => (nodeUseCount.get(id) ?? 0) >= 2;

// ── Build contracted graph (intersection → intersection edges) ─
const nodes = {};   // "strId" → { lat, lng }
const edges = [];   // { from, to, distM, coords }

for (const way of ways) {
  const ns     = way.nodes;
  const oneWay =
    way.tags?.oneway === "yes" ||
    way.tags?.oneway === "1"   ||
    way.tags?.junction === "roundabout";

  // Walk the way; create an edge each time we hit an intersection node
  let segStart = 0; // index of the last intersection we came from

  for (let i = 1; i < ns.length; i++) {
    const atEnd          = i === ns.length - 1;
    const atIntersection = isIntersection(ns[i]);

    if (!atIntersection && !atEnd) continue;

    // Collect geometry for segment [segStart … i]
    const segIds = ns.slice(segStart, i + 1);
    const coords = [];
    let   distM  = 0;
    let   valid  = true;

    for (let j = 0; j < segIds.length; j++) {
      const n = nodeMap.get(segIds[j]);
      if (!n) { valid = false; break; }
      coords.push([n.lat, n.lng]);
      if (j > 0) {
        const p = nodeMap.get(segIds[j - 1]);
        if (p) distM += haversine(p.lat, p.lng, n.lat, n.lng);
      }
    }

    if (valid && coords.length >= 2) {
      const fromId = String(ns[segStart]);
      const toId   = String(ns[i]);

      // Ensure endpoint nodes are in the node table
      const fn = nodeMap.get(ns[segStart]);
      const tn = nodeMap.get(ns[i]);
      if (fn) nodes[fromId] = { lat: fn.lat, lng: fn.lng };
      if (tn) nodes[toId]   = { lat: tn.lat, lng: tn.lng };

      edges.push({ from: fromId, to: toId, distM: Math.round(distM), coords });
      if (!oneWay) {
        edges.push({
          from:   toId,
          to:     fromId,
          distM:  Math.round(distM),
          coords: [...coords].reverse(),
        });
      }
    }

    segStart = i;
  }
}

const graph = { nodes, edges };

console.log(
  `✓ Graph contracted: ${Object.keys(nodes).length} nodes | ${edges.length} edges`
);

const outPath = "js/graph.json";
writeFileSync(outPath, JSON.stringify(graph));

const sizeKB = Math.round(
  Buffer.byteLength(JSON.stringify(graph)) / 1024
);
console.log(`✓ Written → ${outPath}  (${sizeKB} KB)`);
