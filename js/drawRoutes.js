/**
 * drawRoutes.js — Draws route polylines on the Leaflet map.
 *
 * Two layers are used:
 *  layerGhost  — permanent reference lines (slider=0 and slider=100),
 *                drawn once on graph init and never cleared.
 *  layerRoutes — active A* route for current slider, redrawn on every change.
 */

import { layerRoutes, layerGhost } from "./mapInit.js";

// ── Colour helpers ─────────────────────────────────────────────
function blendColors(hex1, hex2, t) {
  const parse = h => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  const r = Math.round(r1 + (r2 - r1) * t).toString(16).padStart(2, "0");
  const g = Math.round(g1 + (g2 - g1) * t).toString(16).padStart(2, "0");
  const b = Math.round(b1 + (b2 - b1) * t).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

/**
 * Active route colour: red (speed) → amber → purple (balanced) → teal → green (signal)
 */
function routeColor(sliderVal) {
  const t = sliderVal / 100;
  if (t < 0.25)  return blendColors("#ef4444", "#f59e0b", t * 4);
  if (t < 0.5)   return blendColors("#f59e0b", "#a855f7", (t - 0.25) * 4);
  if (t < 0.75)  return blendColors("#a855f7", "#38bdf8", (t - 0.5)  * 4);
  return blendColors("#38bdf8", "#22c55e", (t - 0.75) * 4);
}

// ── Ghost reference routes (drawn ONCE on init) ────────────────
/**
 * Draw the always-visible ghost routes (fastest and safest extremes).
 * Lives in layerGhost — independent of the active route layer.
 *
 * @param {Array<[number,number]>} fastPath  — slider=0 path
 * @param {Array<[number,number]>} safePath  — slider=100 path
 */
export function drawGhostRoutes(fastPath, safePath) {
  layerGhost.clearLayers();

  if (fastPath?.length >= 2) {
    L.polyline(fastPath, {
      color:     "#ef4444",
      weight:    2.5,
      opacity:   0.28,
      dashArray: "10 7",
    })
      .bindTooltip("⚡ Fastest possible (speed-only baseline)", { sticky: true })
      .addTo(layerGhost);
  }

  if (safePath?.length >= 2) {
    L.polyline(safePath, {
      color:     "#22c55e",
      weight:    2.5,
      opacity:   0.28,
      dashArray: "10 7",
    })
      .bindTooltip("📶 Safest possible (max connectivity baseline)", { sticky: true })
      .addTo(layerGhost);
  }
}

// ── Active A* route (redrawn on every slider tick) ─────────────
/**
 * Draw the dynamic A* route for the current slider value.
 * Colour transitions across the full spectrum as sliderVal changes.
 *
 * @param {Array<[number,number]>} coords    — A* result path
 * @param {Array<[number,number]>} dzSegment — dead-zone highlight subset
 * @param {number} sliderVal                 — 0–100
 */
export function drawDynamicRoute(coords, dzSegment = [], sliderVal = 50) {
  layerRoutes.clearLayers();
  if (!coords || coords.length < 2) return;

  const color = routeColor(sliderVal);
  const modeLabel =
    sliderVal < 25 ? "⚡ Speed-Optimised (A*)" :
    sliderVal > 75 ? "📶 Connectivity-Safe (A*)" :
    "🤖 AI-Balanced (A*)";

  // Main route — thick, prominent
  L.polyline(coords, {
    color,
    weight:  6,
    opacity: 0.92,
    lineJoin: "round",
    lineCap:  "round",
  })
    .bindTooltip(`${modeLabel} — priority ${sliderVal}`, { sticky: true })
    .addTo(layerRoutes);

  // Dead-zone segment overlay
  if (dzSegment.length >= 2) {
    // Outer glow
    L.polyline(dzSegment, {
      color:     "#ef4444",
      weight:    14,
      opacity:   0.18,
    }).addTo(layerRoutes);
    // Inner dashed highlight
    L.polyline(dzSegment, {
      color:     "#fbbf24",
      weight:    5,
      opacity:   0.85,
      dashArray: "6 5",
    })
      .bindTooltip("⚠ Dead Zone — RSSI −109 dBm | Store-and-forward buffer active", { sticky: true })
      .addTo(layerRoutes);
  }
}

// ── Legacy dual-route draw (OSRM fallback only) ────────────────
export function drawRoutes(mode, fastCoords, safeCoords, dzSegment = []) {
  layerRoutes.clearLayers();

  const showFastest = mode === "fastest" || mode === "auto";
  const showSafe    = mode === "safe"    || mode === "auto";

  if (showFastest && fastCoords.length) {
    L.polyline(fastCoords, {
      color: "#ef4444", weight: 5,
      opacity: mode === "fastest" ? 0.9 : 0.45,
      dashArray: mode === "auto" ? "8 5" : null,
    }).bindTooltip("⚡ Fastest Route", { sticky: true }).addTo(layerRoutes);

    if (dzSegment.length >= 2) {
      L.polyline(dzSegment, { color: "#ef4444", weight: 9, opacity: 0.45, dashArray: "4 4" })
        .bindTooltip("⚠ Dead Zone", { sticky: true }).addTo(layerRoutes);
    }
  }

  if (showSafe && safeCoords.length) {
    L.polyline(safeCoords, {
      color: "#22c55e", weight: 5,
      opacity: mode === "safe" ? 0.9 : 0.45,
    }).bindTooltip("📶 Safe Route", { sticky: true }).addTo(layerRoutes);
  }
}
