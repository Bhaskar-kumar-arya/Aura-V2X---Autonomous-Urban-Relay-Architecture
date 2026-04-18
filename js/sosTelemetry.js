/**
 * sosTelemetry.js — SOS log, mesh-notification banner, and setMeshActive orchestration.
 * Imports: state (mapInit), drawMeshLinks/clearMeshLinks (drawMesh)
 */

import { state } from "./mapInit.js";
import { drawMeshLinks, clearMeshLinks } from "./drawMesh.js";

// ── SOS log ────────────────────────────────────────────────────
/**
 * Append a timestamped entry to the on-screen SOS log.
 * @param {"ready"|"relay"|"warn"|"buffer"} type - CSS class driving colour
 * @param {string} text
 */
export function appendLog(type, text) {
  const log = document.getElementById("sos-log");
  if (!log) return;

  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.textContent = text;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// ── Mesh notification banner ───────────────────────────────────
function showMeshBanner() {
  document.getElementById("mesh-notification")?.classList.remove("hidden");
}
function hideMeshBanner() {
  document.getElementById("mesh-notification")?.classList.add("hidden");
}

// ── Header status badge ────────────────────────────────────────
function setStatusBadge(active) {
  const badge = document.getElementById("system-status-badge");
  if (!badge) return;
  if (active) {
    badge.textContent = "● C-V2X MESH ACTIVE";
    badge.classList.add("active-mesh");
  } else {
    badge.textContent = "● SYSTEM READY";
    badge.classList.remove("active-mesh");
  }
}

// ── SOS indicator dot ──────────────────────────────────────────
function setSosDot(active) {
  const dot = document.getElementById("sos-dot");
  if (!dot) return;
  dot.classList.toggle("active", active);
}

// ── Relay window label ─────────────────────────────────────────
function setRelayWindow(text) {
  const el = document.getElementById("relay-val");
  if (el) el.textContent = text;
}

// ── Main orchestration ─────────────────────────────────────────
/**
 * Activate or deactivate the full C-V2X mesh relay state:
 * banner, badge, SOS dot, mesh links, and log entries.
 * @param {boolean} active
 */
/**
 * Activate or deactivate the C-V2X mesh relay UI.
 * @param {boolean} active
 * @param {[number,number]|null} evPos — current EV [lat, lng] for accurate mesh line drawing
 */
export function setMeshActive(active, evPos = null) {
  state.meshActive = active;

  setStatusBadge(active);
  setSosDot(active);

  if (active) {
    showMeshBanner();
    setRelayWindow("~4 sec");
    drawMeshLinks(evPos);   // pass real EV position — lines now originate at actual ambulance
    appendLog("relay", "⚡ Cellular dropout. C-V2X relay engaged via BN-A → T02.");
    appendLog("buffer", "📦 SOS packet buffered. Relay window: 4s");
  } else {
    hideMeshBanner();
    setRelayWindow("—");
    clearMeshLinks();
  }
}
