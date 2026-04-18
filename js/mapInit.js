/**
 * mapInit.js — Leaflet map initialisation, layer groups, and shared mutable state.
 * All other modules import from here to access the map and state.
 * Depends on: global `L` (Leaflet CDN)
 */

// ── Map ────────────────────────────────────────────────────────
export const map = L.map("map", {
  center: [40.7282, -73.9942],
  zoom: 14,
  zoomControl: true,
  attributionControl: true,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
  maxZoom: 18,
}).addTo(map);

// ── Layer groups ───────────────────────────────────────────────
export const layerCoverage = L.layerGroup().addTo(map);
export const layerTowers   = L.layerGroup().addTo(map);
export const layerFleet    = L.layerGroup().addTo(map);
export const layerBridges  = L.layerGroup().addTo(map);
export const layerGhost    = L.layerGroup().addTo(map); // always-visible reference paths
export const layerRoutes   = L.layerGroup().addTo(map); // active A* route (above ghosts)
export const layerMesh     = L.layerGroup().addTo(map);
export const layerEV       = L.layerGroup().addTo(map);

// ── Shared mutable application state ──────────────────────────
export const state = {
  route:       "fastest",   // "fastest" | "safe" | "auto"
  sliderVal:   50,
  simActive:   false,
  meshActive:  false,
  evMarker:    null,
  simInterval: null,
  simStep:     0,
  evPath:      [],          // set by main.js on route change
  selectedHour: [6, 9, 12, 15, 18, 21].reduce((a, b) => Math.abs(b - new Date().getHours()) < Math.abs(a - new Date().getHours()) ? b : a),
};
