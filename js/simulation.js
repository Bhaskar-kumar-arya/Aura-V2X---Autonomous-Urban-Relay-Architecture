/**
 * simulation.js — Emergency Vehicle animation loop.
 * Steps the EV marker along the active route, triggers dead-zone events.
 * Imports: state (mapInit), placeEV (drawMarkers), appendLog + setMeshActive (sosTelemetry)
 */

import { state } from "./mapInit.js";
import { placeEV, drawFleet } from "./drawMarkers.js";
import { appendLog, setMeshActive } from "./sosTelemetry.js";
import { FLEET_VEHICLES } from "./data.js";

const STEP_INTERVAL_MS = 500;

// ── Dead-zone step indices on the FASTEST route ────────────────
const DZ_ENTRY_STEP    = 3;   // vehicle enters dead zone
const DZ_RELAY_STEP    = 5;   // first successful relay
const DZ_EXIT_STEP     = 6;   // cellular restored

let simTotalDist = 0;
let simTotalEta = 0;

function getRemainingDistance(coords, simStep) {
  if (!coords || simStep >= coords.length - 1) return 0;
  let total = 0;
  const R = 6_371_000, toR = d => (d * Math.PI) / 180;
  for (let i = simStep + 1; i < coords.length; i++) {
    const [la, lo] = coords[i - 1];
    const [lb, lp] = coords[i];
    const dLat = toR(lb - la), dLng = toR(lp - lo);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(la)) * Math.cos(toR(lb)) * Math.sin(dLng / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total / 1000;
}

function updateMetricsDynamically(simStep, evPath) {
  const remDist = getRemainingDistance(evPath, simStep);
  const distEl = document.getElementById("metric-distance");
  if (distEl) distEl.textContent = remDist.toFixed(2) + " km";

  const totalDist = simTotalDist || getRemainingDistance(evPath, 0) || 1;
  const totalEta = simTotalEta || 14; 
  const eta = Math.round(totalEta * (remDist / totalDist));
  const etaEl = document.getElementById("metric-eta");
  if (etaEl) etaEl.textContent = Math.max(0, eta) + " min";
}

function updateGPS(pos) {
  const el = document.getElementById("gps-coords");
  if (el) el.textContent = `${pos[0].toFixed(4)}, ${pos[1].toFixed(4)}`;
}

function handleDeadZoneEvents(step, isFastestRoute) {
  if (!isFastestRoute) return;

  if (step === DZ_ENTRY_STEP) {
    appendLog("warn", "⚠ Entering cellular dead zone (RSSI −109 dBm)");
    const evPos = state.evPath[step] ?? null;
    setMeshActive(true, evPos);  // pass real EV position for accurate mesh line origin
  }
  if (step === DZ_RELAY_STEP) {
    appendLog("relay", "✔ SOS relayed via Bridge Node A → Tower T03");
  }
  if (step === DZ_EXIT_STEP) {
    appendLog("ready", "✔ Cellular restored. Mesh handoff complete.");
    setMeshActive(false);
  }
}

// ── Public API ─────────────────────────────────────────────────
/**
 * Start the EV simulation along `state.evPath`.
 * Clears any existing interval first.
 */
export function startSimulation() {
  stopSimulation();
  state.simStep = 0;

  const isFastest = state.route !== "safe";
  appendLog("warn", `▶ Simulation started — ${isFastest ? "FASTEST" : "SAFE"} route.`);

  // Initialize sim metrics
  simTotalDist = getRemainingDistance(state.evPath, 0);
  const etaText = document.getElementById("metric-eta")?.textContent || "14";
  simTotalEta = parseInt(etaText, 10) || 14;

  state.simInterval = setInterval(() => {
    // ── Pause gate ───────────────────────────────────
    if (state.simPaused) return;  // freeze marker, keep interval alive

    const { simStep, evPath } = state;

    if (simStep >= evPath.length) {
      stopSimulation();
      appendLog("ready", "■ Destination reached. Simulation complete.");
      return;
    }

    const pos = evPath[simStep];
    placeEV(pos);
    updateGPS(pos);
    updateMetricsDynamically(simStep, evPath);
    handleDeadZoneEvents(simStep, isFastest);

    // Micro-drift fleet vehicles to simulate live traffic
    FLEET_VEHICLES.forEach(v => {
      v.lat += (Math.random() - 0.5) * 0.0006;
      v.lng += (Math.random() - 0.5) * 0.0006;
    });
    // the fleet layers are only visible if the route is not 'safe'
    if (isFastest) drawFleet(true);

    state.simStep += 1;
  }, STEP_INTERVAL_MS);
}

/** Stop the simulation interval without resetting the EV position. */
export function stopSimulation() {
  if (state.simInterval) {
    clearInterval(state.simInterval);
    state.simInterval = null;
  }
  state.simPaused = false;
}

/** Pause the simulation — marker freezes, interval stays alive. */
export function pauseSimulation() {
  state.simPaused = true;
}

/** Resume a paused simulation from exactly where it stopped. */
export function resumeSimulation() {
  state.simPaused = false;
}
