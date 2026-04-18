/**
 * interactiveZones.js — User-placed signal strength zones.
 *
 * Each zone is a draggable Leaflet circle with a 0→1 slider:
 *   0 = dead zone (penalty 6.0)   1 = strong signal (penalty 0)
 * Penalty curve: exponential  → 6.0 × (1 − strength)²
 *
 * Net A* cost on any edge = max(static_tower_penalty, zone_penalty)
 *
 * Public API:
 *   initInteractiveZones(onChangeCallback) — call once from main.js
 *   addZone(lat, lng)                      — drop a zone at a coordinate
 *   getZonePenaltyAt(lat, lng)             — called by edgeCost() in scoring.js
 *   placedZones                            — reactive array (read-only outside)
 */

import { map, layerInteractive } from "./mapInit.js";

// ── Constants ──────────────────────────────────────────────────
const ZONE_RADIUS_M   = 400;   // default radius of every new zone
const MAX_PENALTY     = 6.0;   // matches DZ_PENALTY["red"] in scoring.js

// Signal strength → Leaflet circle colour
function strengthToColor(s) {
  if (s <= 0.20) return "#ef4444"; // red   — dead zone
  if (s <= 0.45) return "#f97316"; // orange — weak
  if (s <= 0.70) return "#f59e0b"; // yellow — moderate
  return "#22c55e";                 // green  — strong
}

// Signal strength → quality label
function strengthToLabel(s) {
  if (s <= 0.20) return "Dead Zone";
  if (s <= 0.45) return "Weak Signal";
  if (s <= 0.70) return "Moderate";
  return "Strong Signal";
}

// Signal strength → approximate RSSI string
function strengthToRSSI(s) {
  // maps 0→−109 dBm, 1→−72 dBm
  return `−${Math.round(109 - s * 37)} dBm`;
}

// Exponential penalty curve: high near 0, collapses near 1
function strengthToPenalty(s) {
  return MAX_PENALTY * Math.pow(1 - s, 2);
}

// ── Zone store ─────────────────────────────────────────────────
export const placedZones = [];   // { id, lat, lng, radiusM, strength, circle }
let zoneCounter = 0;
let _onChange   = null;           // callback → main.js:runAstar()

// ── Haversine (no Leaflet needed) ─────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R   = 6_371_000;
  const toR = x => (x * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Public: penalty query (called inside scoring.edgeCost) ─────
/**
 * Return the effective penalty at a given coordinate, accounting for
 * overlapping zones.
 *
 * Overlap rule: take the MAX signal strength across all covering zones,
 * then convert that single best-strength value to a penalty.
 * → Strongest signal wins in overlap areas (physically correct: a good
 *   signal overpowers a weaker one when both cover the same spot).
 *
 * Returns 0 if no zone covers the point.
 */
export function getZonePenaltyAt(lat, lng) {
  let bestStrength = -1; // -1 means no zone covers this point
  for (const z of placedZones) {
    if (haversine(lat, lng, z.lat, z.lng) <= z.radiusM) {
      if (z.strength > bestStrength) bestStrength = z.strength;
    }
  }
  if (bestStrength < 0) return -1; // -1 signifies no zone covers this point
  return strengthToPenalty(bestStrength); // best strength → lowest penalty
}

// ── Build popup HTML for a zone ────────────────────────────────
function buildPopupHTML(zoneId, strength) {
  const color = strengthToColor(strength);
  const label = strengthToLabel(strength);
  const rssi  = strengthToRSSI(strength);
  const pct   = Math.round(strength * 100);

  return `
    <div class="iz-popup" data-zone-id="${zoneId}">
      <div class="iz-popup-header">
        <span class="iz-dot" style="background:${color}"></span>
        <span class="iz-popup-title">Signal Zone <em>SZ-${String(zoneId).padStart(2,"0")}</em></span>
      </div>
      <div class="iz-slider-row">
        <span class="iz-slider-label">Signal Strength</span>
        <div class="iz-slider-wrap">
          <input type="range" class="iz-slider" min="0" max="100" value="${pct}"
                 id="iz-slider-${zoneId}" />
        </div>
        <span class="iz-slider-val" id="iz-slider-val-${zoneId}">${pct}%</span>
      </div>
      <div class="iz-meta" id="iz-meta-${zoneId}">
        <span class="iz-quality" style="color:${color}">${label}</span>
        &nbsp;·&nbsp; RSSI: <strong>${rssi}</strong>
      </div>
      <button class="iz-remove-btn" id="iz-remove-${zoneId}">🗑 Remove Zone</button>
    </div>`;
}

// ── Attach popup listeners ─────────────────────────────────────
function bindPopupListeners(zone) {
  // Leaflet fires popupopen every time the popup reopens (e.g. after drag)
  zone.circle.on("popupopen", () => {
    const slider  = document.getElementById(`iz-slider-${zone.id}`);
    const valSpan = document.getElementById(`iz-slider-val-${zone.id}`);
    const meta    = document.getElementById(`iz-meta-${zone.id}`);
    const rmBtn   = document.getElementById(`iz-remove-${zone.id}`);

    if (!slider) return;

    slider.addEventListener("input", () => {
      const s = parseInt(slider.value, 10) / 100;
      zone.strength = s;
      valSpan.textContent = `${Math.round(s * 100)}%`;

      const color = strengthToColor(s);
      const label = strengthToLabel(s);
      const rssi  = strengthToRSSI(s);

      // Re-colour the circle
      zone.circle.setStyle({ color, fillColor: color });

      // Update meta line
      meta.innerHTML = `<span class="iz-quality" style="color:${color}">${label}</span>
        &nbsp;·&nbsp; RSSI: <strong>${rssi}</strong>`;

      console.log(`[iz] SZ-${zone.id} strength=${s.toFixed(2)} penalty=${strengthToPenalty(s).toFixed(2)}`);
      _onChange?.();
    });

    rmBtn?.addEventListener("click", () => removeZone(zone.id));
  });
}

// ── Remove a zone ──────────────────────────────────────────────
export function removeZone(id) {
  const idx = placedZones.findIndex(z => z.id === id);
  if (idx === -1) return;
  const zone = placedZones[idx];
  zone.circle.closePopup();
  layerInteractive.removeLayer(zone.circle);
  placedZones.splice(idx, 1);
  console.log(`[iz] removed SZ-${id}`);
  _onChange?.();
}

// ── Add a zone ────────────────────────────────────────────────
export function addZone(lat, lng, initialStrength = 0.0) {
  zoneCounter++;
  const id       = zoneCounter;
  const strength = initialStrength;
  const color    = strengthToColor(strength);

  const circle = L.circle([lat, lng], {
    radius:      ZONE_RADIUS_M,
    color,
    fillColor:   color,
    fillOpacity: 0.18,
    weight:      2,
    opacity:     0.85,
    dashArray:   "6 3",
    draggable:   true,
    // Leaflet circles aren't natively draggable — we use mousedown/mousemove
  }).addTo(layerInteractive);

  // Leaflet doesn't support draggable circles natively — implement manually
  let isDragging = false;
  let dragStartLatLng = null;
  let circleStartLatLng = null;

  circle.on("mousedown", (e) => {
    if (e.originalEvent.button !== 0) return; // left button only
    isDragging = true;
    dragStartLatLng   = e.latlng;
    circleStartLatLng = circle.getLatLng();
    map.dragging.disable();
    map.on("mousemove", onMouseMove);
    map.on("mouseup",   onMouseUp);
    e.originalEvent.stopPropagation();
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    const dlat = e.latlng.lat - dragStartLatLng.lat;
    const dlng = e.latlng.lng - dragStartLatLng.lng;
    const newLat = circleStartLatLng.lat + dlat;
    const newLng = circleStartLatLng.lng + dlng;
    circle.setLatLng([newLat, newLng]);
    zone.lat = newLat;
    zone.lng = newLng;
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    map.dragging.enable();
    map.off("mousemove", onMouseMove);
    map.off("mouseup",   onMouseUp);
    console.log(`[iz] SZ-${id} moved to [${zone.lat.toFixed(4)}, ${zone.lng.toFixed(4)}]`);
    _onChange?.();
  }

  // Attach popup
  const popupContent = buildPopupHTML(id, strength);
  circle.bindPopup(popupContent, {
    minWidth: 240,
    maxWidth: 280,
    className: "iz-popup-container",
    closeButton: true,
  });

  const zone = { id, lat, lng, radiusM: ZONE_RADIUS_M, strength, circle };
  placedZones.push(zone);

  bindPopupListeners(zone);

  // Open popup immediately so user can adjust slider right away
  setTimeout(() => circle.openPopup(), 80);

  console.log(`[iz] placed SZ-${id} at [${lat.toFixed(4)}, ${lng.toFixed(4)}] strength=${strength}`);
  _onChange?.();
  return zone;
}

// ── Drop mode (click-to-place) ─────────────────────────────────
let dropModeActive = false;

export function enableDropMode() {
  if (dropModeActive) return;
  dropModeActive = true;
  map.getContainer().classList.add("iz-crosshair");
  map.once("click", (e) => {
    dropModeActive = false;
    map.getContainer().classList.remove("iz-crosshair");
    addZone(e.latlng.lat, e.latlng.lng, 0.0); // always starts as dead zone
  });
}

export function cancelDropMode() {
  if (!dropModeActive) return;
  dropModeActive = false;
  map.getContainer().classList.remove("iz-crosshair");
  // Remove the "once" listener by adding a dummy no-op — Leaflet .once already removes itself
}

// ── Init ──────────────────────────────────────────────────────
/**
 * Call once from main.js after the map is ready.
 * @param {Function} onChangeCallback — called whenever zones change position or strength
 */
export function initInteractiveZones(onChangeCallback) {
  _onChange = onChangeCallback;
  console.log("[iz] interactive zones ready");
}
