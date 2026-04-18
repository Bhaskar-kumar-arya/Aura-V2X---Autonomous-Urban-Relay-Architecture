/**
 * drawMarkers.js — Tower, fleet vehicle, bridge node, and EV marker rendering.
 * Imports: layer groups (mapInit), data (data)
 */

import { layerTowers, layerFleet, layerBridges, layerEV, state } from "./mapInit.js";
import { CELL_TOWERS, FLEET_VEHICLES, BRIDGE_NODES } from "./data.js";

// ── Shared icon factory ────────────────────────────────────────
function divIcon(html, size = [28, 28]) {
  return L.divIcon({ className: "", html, iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] });
}

// ── Cell tower markers ─────────────────────────────────────────
export function drawTowers() {
  layerTowers.clearLayers();

  CELL_TOWERS.forEach(tower => {
    const emoji = tower.quality === "green" ? "📶" : tower.quality === "yellow" ? "📡" : "⚠️";
    const icon  = divIcon(`<div class="tower-marker ${tower.quality}">${emoji}</div>`);

    L.marker([tower.lat, tower.lng], { icon })
      .bindPopup(`
        <div class="popup-title">${tower.label}</div>
        <div class="popup-row"><span>RSSI</span><span class="popup-val">${tower.rssi} dBm</span></div>
        <div class="popup-row"><span>Coverage</span><span class="popup-val">${tower.quality.toUpperCase()}</span></div>
        <div class="popup-row"><span>Radius</span><span class="popup-val">${({ green:600,yellow:400,red:300 })[tower.quality]}m</span></div>
      `)
      .addTo(layerTowers);
  });
}

// ── Fleet vehicle markers ──────────────────────────────────────
export function drawFleet(visible) {
  layerFleet.clearLayers();
  if (!visible) return;

  FLEET_VEHICLES.forEach(v => {
    const icon = divIcon(`<div class="fleet-marker" title="${v.label}">🚐</div>`, [22, 22]);

    L.marker([v.lat, v.lng], { icon })
      .bindPopup(`
        <div class="popup-title">${v.label}</div>
        <div class="popup-row"><span>Status</span><span class="popup-val">Active</span></div>
        <div class="popup-row"><span>C-V2X</span><span class="popup-val">Enabled</span></div>
        <div class="popup-row"><span>Role</span><span class="popup-val">Potential Relay</span></div>
      `)
      .addTo(layerFleet);
  });
}

// ── Bridge node markers ────────────────────────────────────────
export function drawBridges(visible) {
  layerBridges.clearLayers();
  if (!visible) return;

  BRIDGE_NODES.forEach(b => {
    const icon = divIcon(`<div class="bridge-marker">📡</div>`, [30, 30]);

    L.marker([b.lat, b.lng], { icon })
      .bindPopup(`
        <div class="popup-title">${b.label}</div>
        <div class="popup-row"><span>Type</span><span class="popup-val">C-V2X Bridge</span></div>
        <div class="popup-row"><span>Linked Tower</span><span class="popup-val">${b.tower}</span></div>
        <div class="popup-row"><span>Range</span><span class="popup-val">~1000m (DSRC)</span></div>
        <div class="popup-row"><span>Status</span><span class="popup-val" style="color:#6ee7f7">RELAY READY</span></div>
      `)
      .addTo(layerBridges);
  });
}

// ── Emergency Vehicle marker ───────────────────────────────────
export function placeEV(latlng) {
  layerEV.clearLayers();

  state.evMarker = L.marker(latlng, {
    icon: divIcon(`<div class="ev-marker">🚑</div>`, [34, 34]),
    zIndexOffset: 1000,
  })
  .bindPopup(`
    <div class="popup-title">Emergency Vehicle (EV-01)</div>
    <div class="popup-row"><span>Mode</span><span class="popup-val" style="color:#ef4444">SOS ACTIVE</span></div>
    <div class="popup-row"><span>C-V2X</span><span class="popup-val">Enabled (DSRC)</span></div>
    <div class="popup-row"><span>Telematics</span><span class="popup-val">Buffering…</span></div>
  `)
  .addTo(layerEV);
}
