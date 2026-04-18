/**
 * uiPanels.js — All DOM-panel updates: metrics, score bars, density chart.
 * Pure DOM manipulation — no Leaflet dependency.
 * Imports: FLEET_DENSITY_24H (data)
 */

import { FLEET_DENSITY_24H } from "./data.js";

// ── Score bar animation ────────────────────────────────────────
/**
 * Animate a score bar and its numeric label from its previous value to `pct`.
 * @param {string} barId   - element id of the fill div
 * @param {string} numId   - element id of the numeric label
 * @param {number} pct     - target percentage (0–100)
 * @param {string} bg      - CSS gradient string for the fill
 */
export function animateBar(barId, numId, pct, bg) {
  const bar = document.getElementById(barId);
  const num = document.getElementById(numId);
  if (!bar || !num) return;

  bar.style.width      = pct + "%";
  bar.style.background = bg;

  const from = parseInt(num.dataset.prev || "0", 10);
  num.dataset.prev = pct;

  const duration = 600;
  let start = null;
  requestAnimationFrame(function step(ts) {
    if (!start) start = ts;
    const t = Math.min((ts - start) / duration, 1);
    num.textContent = Math.round(from + (pct - from) * t);
    if (t < 1) requestAnimationFrame(step);
  });
}

// ── Route metrics card ─────────────────────────────────────────
/**
 * Update the route metrics card (ETA, distance, connectivity + mesh scores).
 * @param {{ eta: string, dist: string, conn: number, mesh: number }} metrics
 */
export function updateMetrics({ eta, dist, conn, mesh }) {
  document.getElementById("metric-eta").textContent      = eta;
  document.getElementById("metric-distance").textContent = dist;

  const connGradient =
    conn < 50 ? "linear-gradient(90deg,#ef4444,#f59e0b)" :
    conn < 75 ? "linear-gradient(90deg,#f59e0b,#22c55e)" :
                "linear-gradient(90deg,#22c55e,#38bdf8)";

  animateBar("conn-score-bar", "conn-score-value", conn, connGradient);

  if (mesh > 0) {
    animateBar("mesh-score-bar", "mesh-score-value", mesh,
      "linear-gradient(90deg,#38bdf8,#a855f7)");
  } else {
    document.getElementById("mesh-score-bar").style.width      = "0%";
    document.getElementById("mesh-score-bar").style.background = "transparent";
    document.getElementById("mesh-score-value").textContent    = "N/A";
    document.getElementById("mesh-score-value").dataset.prev   = "0";
  }
}

// ── Fleet density chart ────────────────────────────────────────
/** Render the 6-column fleet density bar chart and update the density label. */
export function renderDensityChart() {
  const wrap   = document.getElementById("density-bars");
  const hour   = new Date().getHours();
  const max    = Math.max(...FLEET_DENSITY_24H);
  const hours  = [6, 9, 12, 15, 18, 21];
  const values = hours.map(h => FLEET_DENSITY_24H[h]);

  wrap.innerHTML = values.map((v, i) => {
    const isNow = Math.abs(hours[i] - hour) <= 2;
    const pct   = Math.round((v / max) * 100);
    const color = v >= 8 ? "#22c55e" : v >= 4 ? "#f59e0b" : "#ef4444";
    return `<div class="density-bar" style="height:${pct}%;background:${color};opacity:${isNow ? 1 : 0.55};${isNow ? `box-shadow:0 0 6px ${color}` : ""}"></div>`;
  }).join("");

  const nowVal  = FLEET_DENSITY_24H[hour];
  const label   = nowVal >= 8 ? "High Density" : nowVal >= 4 ? "Medium Density" : "Low Density";
  const color   = nowVal >= 8 ? "var(--green)"  : nowVal >= 4 ? "var(--amber)"   : "var(--red)";
  const el      = document.getElementById("density-window");
  if (el) { el.textContent = label; el.style.color = color; }

  // Push mesh viability score based on density
  const meshViab = Math.min(100, Math.round((nowVal / max) * 100) + 30);
  animateBar("mesh-score-bar", "mesh-score-value", meshViab,
    "linear-gradient(90deg,#38bdf8,#a855f7)");
}

// ── Slider label ───────────────────────────────────────────────
/**
 * Set the readable label under the priority slider.
 * @param {number} val - slider value 0–100
 * @returns {"fastest"|"safe"|"auto"}
 */
export function getRouteFromSlider(val) {
  if (val < 25) return "fastest";
  if (val > 75) return "safe";
  return "auto";
}

export function setSliderLabel(val) {
  const label = document.getElementById("slider-value-label");
  if (!label) return;
  if (val < 25)      label.textContent = "Max Speed";
  else if (val > 75) label.textContent = "Max Connectivity";
  else               label.textContent = "Balanced (Auto AI)";
}
