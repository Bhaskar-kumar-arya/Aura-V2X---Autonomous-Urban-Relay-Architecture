/**
 * drawWeather.js — Renders atmospheric weather disruption zones on the map.
 *
 * Each zone is drawn as a translucent circle with a severity-coded colour:
 *   light  → slate-blue   (#7dd3fc)
 *   heavy  → deep indigo  (#818cf8)
 *   storm  → vivid violet (#c084fc) with a pulsing dash pattern
 *
 * The circles behave identically to dead zone circles (same Leaflet API),
 * but they are drawn on their own layerWeather group so they can be toggled
 * independently if needed.
 */

import { layerWeather } from "./mapInit.js";
import { WEATHER_ZONES } from "./data.js";

/** Visual config per severity tier */
const SEVERITY_STYLE = {
  light: {
    color:       "#7dd3fc",
    fillColor:   "#7dd3fc",
    fillOpacity: 0.08,
    opacity:     0.45,
    weight:      1.5,
    dashArray:   null,
    icon:        "🌧",
  },
  heavy: {
    color:       "#818cf8",
    fillColor:   "#818cf8",
    fillOpacity: 0.13,
    opacity:     0.65,
    weight:      2,
    dashArray:   "8 5",
    icon:        "⛈",
  },
  storm: {
    color:       "#c084fc",
    fillColor:   "#c084fc",
    fillOpacity: 0.18,
    opacity:     0.85,
    weight:      2.5,
    dashArray:   "5 4",
    icon:        "🌩",
  },
};

/**
 * Draw all weather zone circles.
 * Call once on init (same pattern as drawCoverage).
 */
export function drawWeatherZones(enabled = true) {
  layerWeather.clearLayers();
  
  if (!enabled) return;

  WEATHER_ZONES.forEach(zone => {
    const s = SEVERITY_STYLE[zone.severity] ?? SEVERITY_STYLE.light;

    // Main area circle
    const circle = L.circle([zone.lat, zone.lng], {
      radius:      zone.radiusM,
      color:       s.color,
      fillColor:   s.fillColor,
      fillOpacity: s.fillOpacity,
      weight:      s.weight,
      opacity:     s.opacity,
      dashArray:   s.dashArray,
    });

    // Tooltip — visible on hover
    circle.bindTooltip(
      `<div class="wz-tooltip">
        <div class="wz-tt-header">${s.icon} <strong>${zone.label}</strong> <span class="wz-tt-id">${zone.id}</span></div>
        <div class="wz-tt-body">
          <span>Severity:</span> <strong class="wz-sev-${zone.severity}">${zone.severity.toUpperCase()}</strong><br>
          <span>RSSI drop:</span> <strong>${zone.rssiDrop}</strong><br>
          <span>Radius:</span> ${zone.radiusM} m<br>
          <em>${zone.description}</em>
        </div>
      </div>`,
      { permanent: false, direction: "top", className: "wz-leaflet-tooltip", opacity: 0.97 }
    );

    circle.addTo(layerWeather);

    // Small icon marker at the centre for instant readability
    const iconHtml = `
      <div class="wz-pin wz-pin-${zone.severity}">
        <span class="wz-pin-icon">${s.icon}</span>
        <span class="wz-pin-label">${zone.id}</span>
      </div>`;

    L.marker([zone.lat, zone.lng], {
      icon: L.divIcon({ html: iconHtml, className: "", iconAnchor: [24, 16] }),
      interactive: true,
    })
      .bindTooltip(
        `<strong>${zone.label}</strong> — penalty ×${zone.signalPenalty} (${zone.rssiDrop})`,
        { direction: "top", opacity: 0.95 }
      )
      .addTo(layerWeather);
  });
}
