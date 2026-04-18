/**
 * main.js — Application entry point.
 *
 * Boot sequence:
 *  1. Draw static map layers (coverage circles, towers, density chart).
 *  2. Bind all UI events.
 *  3. Immediately show OSRM-fetched routes as a fast first paint.
 *  4. Asynchronously load the OSM road graph (~900 KB).
 *  5. Run A* on the graph for every slider change — the route, dead-zone
 *     highlight, and all metrics update live on real street nodes.
 */

import { state }                                          from "./mapInit.js";
import { ROUTE_ORIGIN, ROUTE_DESTINATION, SAFE_WAYPOINT,
         FALLBACK_FASTEST, FALLBACK_SAFE,
         CELL_TOWERS, COVERAGE_RADIUS,
         FLEET_DENSITY_24H, WEATHER_ZONES }               from "./data.js";

import { drawCoverage }                                   from "./drawCoverage.js";
import { drawWeatherZones }                               from "./drawWeather.js";
import { drawTowers, drawFleet, drawBridges, placeEV }    from "./drawMarkers.js";
import { drawRoutes, drawDynamicRoute, drawGhostRoutes }  from "./drawRoutes.js";
import { setMeshActive, appendLog }                       from "./sosTelemetry.js";
import { updateMetrics, renderDensityChart,
         getRouteFromSlider, setSliderLabel }              from "./uiPanels.js";
import { startSimulation, stopSimulation,
         pauseSimulation, resumeSimulation }             from "./simulation.js";
import { fetchBothRoutes }                                from "./routing.js";
import { computeConnScore, findDeadZoneSegment,
         estimateDZDuration, getWeatherPenalty }          from "./scoring.js";
import { loadGraph, getNearestNode }                      from "./graph.js";
import { findRoute }                                      from "./astar.js";
import { initInteractiveZones, getZonePenaltyAt,
         enableDropMode }                                  from "./interactiveZones.js";

// ── Live route storage (OSRM fallback, pre-graph) ─────────────
const routes = {
  fastest:   FALLBACK_FASTEST,
  safe:      FALLBACK_SAFE,
  dzSegment: [],
  scores:    { fastest: 42, safe: 91 },
};

// ── A* graph state ────────────────────────────────────────────
let graphReady    = false;
let graphAdj      = null;
let graphNodes    = null;
let originNodeId  = null;
let destNodeId    = null;

// ── Ghost routes (slider=0 and slider=100 reference paths) ─────
let ghostFast = null;   // shown as thin red dashed — fastest possible
let ghostSafe = null;   // shown as thin green dashed — safest possible

// ── Slider debounce ───────────────────────────────────────────
let sliderDebounceTimer = null;
const DEBOUNCE_MS       = 220;

// ── Utility: path distance in km ─────────────────────────────
function pathDistanceKm(coords) {
  if (!coords || coords.length < 2) return 0;
  const R   = 6_371_000;
  const toR = d => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [la, lo] = coords[i - 1];
    const [lb, lp] = coords[i];
    const dLat = toR(lb - la), dLng = toR(lp - lo);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toR(la)) * Math.cos(toR(lb)) * Math.sin(dLng / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total / 1000;
}

// ── Mesh viability score (based on fleet density + slider) ────
function computeMeshViabilityScore(sliderVal, fleetNow) {
  if (sliderVal > 75) return 0; // safe mode — mesh not needed
  const fleetRatio = Math.min(1, (fleetNow ?? 0) / 11);
  return Math.round(fleetRatio * 100 * (1 - sliderVal / 200));
}

// ── Dead zone panel ───────────────────────────────────────────
function updateDeadZonePanel(dzSegment) {
  const duration = estimateDZDuration(dzSegment, 50);
  const el = document.getElementById("dz-duration");
  if (el) el.textContent = duration > 0 ? `~${duration} sec` : "N/A";
}

// ── Weather panel ─────────────────────────────────────────────
function updateWeatherPanel(path) {
  const rows = document.getElementById("wz-active-rows");
  if (!rows) return;

  const isWeatherEnabled = document.getElementById("weather-toggle")?.checked ?? true;
  if (!isWeatherEnabled) {
    rows.innerHTML = `<div class="wz-row wz-none">Weather effects disabled</div>`;
    const badge = document.getElementById("wz-impact-badge");
    if (badge) {
      badge.textContent = "✔ OFF";
      badge.className = "wz-badge wz-badge-clear";
    }
    return;
  }

  const hit = WEATHER_ZONES.filter(wz =>
    path.some(([lat, lng]) => {
      const dx = lat - wz.lat, dy = lng - wz.lng;
      return Math.sqrt(dx * dx + dy * dy) * 111_000 <= wz.radiusM;
    })
  );

  const severityIcon  = { light: "🌧", heavy: "⛈", storm: "🌩" };
  const severityClass = { light: "wz-light", heavy: "wz-heavy", storm: "wz-storm" };

  if (hit.length === 0) {
    rows.innerHTML = `<div class="wz-row wz-none">✔ No weather zones on active route</div>`;
  } else {
    rows.innerHTML = hit.map(wz => `
      <div class="wz-row">
        <span class="wz-row-icon">${severityIcon[wz.severity] ?? "🌧"}</span>
        <div class="wz-row-info">
          <span class="wz-row-label ${severityClass[wz.severity]}">${wz.label} <em>${wz.id}</em></span>
          <span class="wz-row-meta">Drop: <strong>${wz.rssiDrop}</strong> &nbsp;|&nbsp; Penalty ×${wz.signalPenalty}</span>
        </div>
      </div>`).join("");
  }

  const badge = document.getElementById("wz-impact-badge");
  if (badge) {
    if (hit.some(z => z.severity === "storm")) {
      badge.textContent = "⚠ SEVERE IMPACT";
      badge.className = "wz-badge wz-badge-storm";
    } else if (hit.some(z => z.severity === "heavy")) {
      badge.textContent = "⚡ MODERATE IMPACT";
      badge.className = "wz-badge wz-badge-heavy";
    } else if (hit.length > 0) {
      badge.textContent = "🌧 LIGHT IMPACT";
      badge.className = "wz-badge wz-badge-light";
    } else {
      badge.textContent = "✔ CLEAR";
      badge.className = "wz-badge wz-badge-clear";
    }
  }
}


// ── Route comparison table ────────────────────────────────────
function updateComparisonTable() {
  const { fastest: cF, safe: cS } = routes.scores;
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set("ct-conn-fast", `${cF}%`);
  set("ct-conn-safe", `${cS}%`);

  const fastEl = document.getElementById("ct-conn-fast");
  const safeEl = document.getElementById("ct-conn-safe");
  if (fastEl) fastEl.className = cF >= 70 ? "green-val" : cF >= 50 ? "" : "red-val";
  if (safeEl) safeEl.className = cS >= 70 ? "green-val" : cS >= 50 ? "" : "red-val";
}

// ── Status badge ──────────────────────────────────────────────
function setStatusBadge(text) {
  const badge = document.getElementById("system-status-badge");
  if (badge) badge.textContent = text;
}

// ── Core A* route calculation ─────────────────────────────────
/**
 * Run A* for the given slider value, then update the map and all panels.
 * Called after debounce when graph is ready.
 */
async function runAstar(sliderVal) {
  if (!graphReady || !originNodeId || !destNodeId) return;

  const isP2pEnabled = document.getElementById("p2p-toggle")?.checked ?? true;
  const isWeatherEnabled = document.getElementById("weather-toggle")?.checked ?? true;

  // Use historical fleet density to determine mesh viability.
  // CRITICAL: If the user disables P2P, we force fleet density to 0 for this run,
  // which mathematically removes the mesh-buffer discount in the A* engine.
  const fleetNow = isP2pEnabled 
    ? FLEET_DENSITY_24H[state.selectedHour] 
    : 0;

  console.log(`[A*] sliderVal=${sliderVal}  fleetNow=${fleetNow}  origin=${originNodeId}  dest=${destNodeId}`);

  let activeOriginId = originNodeId;
  let traveledPath = [];
  const inMotion = (state.simActive || state.simStep > 0) && state.evPath && state.simStep < state.evPath.length;

  if (inMotion) {
    const currentLoc = state.evPath[state.simStep];
    activeOriginId = getNearestNode(currentLoc[0], currentLoc[1], graphNodes);
    traveledPath = state.evPath.slice(0, state.simStep);
  }

  const remainingPath = findRoute(
    graphAdj, graphNodes,
    activeOriginId, destNodeId,
    sliderVal, CELL_TOWERS, COVERAGE_RADIUS, fleetNow, isWeatherEnabled ? WEATHER_ZONES : [],
    getZonePenaltyAt
  );

  if (!remainingPath) {
    appendLog("warn", "⚠ A* could not find a path. Check graph connectivity.");
    return;
  }

  const path = traveledPath.concat(remainingPath);

  console.log(`[A*] path found  coords=${path.length}  midpoint=[${path[Math.floor(path.length/2)]}]`);
  window.lastPath = path;

  // Update shared state so simulation can follow the live route
  state.evPath = path;

  // Geometry-derived metrics
  const dzSegment  = findDeadZoneSegment(path, CELL_TOWERS, COVERAGE_RADIUS);
  const connScore  = computeConnScore(path, CELL_TOWERS, COVERAGE_RADIUS);
  const distKm     = pathDistanceKm(path).toFixed(2);
  const meshScore  = computeMeshViabilityScore(sliderVal, fleetNow);

  // ETA: interpolate 14 min (pure speed) → 22 min (max signal detour)
  const etaMins = Math.round(14 + (22 - 14) * (sliderVal / 100));

  // Draw the dynamic route (colour blends red → purple → green)
  drawDynamicRoute(path, dzSegment, sliderVal);

  // Show fleet + bridge nodes when not in full-safe mode
  // Show fleet + bridge nodes when not in full-safe mode, AND P2P is enabled
  const showMesh = sliderVal < 80 && isP2pEnabled;
  drawFleet(showMesh);
  drawBridges(showMesh);
  setMeshActive(showMesh && dzSegment.length >= 2);

  // Panel updates
  updateMetrics({ eta: `${etaMins} min`, dist: `${distKm} km`, conn: connScore, mesh: meshScore });
  updateDeadZonePanel(dzSegment);
  updateWeatherPanel(path);

  // Keep comparison table in sync with live fastest / safe scores
  routes.scores.fastest = computeConnScore(routes.fastest, CELL_TOWERS, COVERAGE_RADIUS);
  routes.scores.safe    = computeConnScore(routes.safe,    CELL_TOWERS, COVERAGE_RADIUS);
  updateComparisonTable();

  if (inMotion) {
    placeEV(path[state.simStep]);
  } else {
    placeEV(path[0]);
  }
}

// ── Graph initialisation ──────────────────────────────────────
async function initGraph() {
  setStatusBadge("⏳ LOADING ROAD GRAPH…");
  appendLog("warn", "⏳ Loading OSM road graph (~900 KB)…");

  try {
    const { adjacency, nodeCoords } = await loadGraph();
    graphAdj   = adjacency;
    graphNodes = nodeCoords;

    // Snap our route endpoints to the nearest OSM intersection nodes
    originNodeId = getNearestNode(ROUTE_ORIGIN[0],      ROUTE_ORIGIN[1],      graphNodes);
    destNodeId   = getNearestNode(ROUTE_DESTINATION[0], ROUTE_DESTINATION[1], graphNodes);

    graphReady = true;
    console.log(`[graph] graphReady=true  origin=${originNodeId}  dest=${destNodeId}`);
    appendLog("ready", "✔ OSM graph ready. A* engine active.");
    setStatusBadge("● A* ENGINE ACTIVE");

    // Pre-compute the two extreme A* paths for the ghost route overlay.
    // These are always visible behind the active route to show the full solution space.
    const fleetNow = FLEET_DENSITY_24H[state.selectedHour];
    const isW = document.getElementById("weather-toggle")?.checked ?? true;
    ghostFast = findRoute(graphAdj, graphNodes, originNodeId, destNodeId,   0, CELL_TOWERS, COVERAGE_RADIUS, fleetNow, isW ? WEATHER_ZONES : [], getZonePenaltyAt);
    ghostSafe = findRoute(graphAdj, graphNodes, originNodeId, destNodeId, 100, CELL_TOWERS, COVERAGE_RADIUS, fleetNow, isW ? WEATHER_ZONES : [], getZonePenaltyAt);
    if (ghostFast && ghostSafe) {
      drawGhostRoutes(ghostFast, ghostSafe);
      console.log(`[ghost] fast=${ghostFast.length}coords  safe=${ghostSafe.length}coords  midFast=[${ghostFast[Math.floor(ghostFast.length/2)]}]  midSafe=[${ghostSafe[Math.floor(ghostSafe.length/2)]}]`);
    }

    // Run A* immediately at the current slider position
    const slider = document.getElementById("priority-slider");
    await runAstar(slider ? parseInt(slider.value, 10) : 50);

  } catch (err) {
    console.error("Graph init failed:", err);
    appendLog("warn", `⚠ Graph load failed: ${err.message}. Staying on OSRM routes.`);
    setStatusBadge("● SYSTEM READY (OSRM)");
  }
}

// ── OSRM fetch (fast first paint) ────────────────────────────
async function loadRealRoutes() {
  setStatusBadge("⏳ FETCHING ROUTES…");
  appendLog("warn", "⏳ Fetching road routes via OSRM…");

  try {
    const { fastest, safe } = await fetchBothRoutes({
      origin:       ROUTE_ORIGIN,
      destination:  ROUTE_DESTINATION,
      safeWaypoint: SAFE_WAYPOINT,
    });

    routes.fastest   = fastest;
    routes.safe      = safe;
    routes.dzSegment = findDeadZoneSegment(fastest, CELL_TOWERS, COVERAGE_RADIUS);
    routes.scores.fastest = computeConnScore(fastest, CELL_TOWERS, COVERAGE_RADIUS);
    routes.scores.safe    = computeConnScore(safe,    CELL_TOWERS, COVERAGE_RADIUS);

    updateDeadZonePanel(routes.dzSegment);
    updateComparisonTable();

    appendLog("ready", `✔ OSRM routes loaded. Conn — Fastest: ${routes.scores.fastest}%, Safe: ${routes.scores.safe}%`);
    setStatusBadge("● SYSTEM READY");

    // Show OSRM routes as a visual placeholder before A* is ready
    if (!graphReady) selectRouteFallback(state.route);

  } catch (err) {
    console.error("OSRM fetch failed:", err);
    appendLog("warn", `⚠ OSRM unavailable, using fallback. (${err.message})`);
    setStatusBadge("● SYSTEM READY (offline)");
    routes.scores.fastest = computeConnScore(routes.fastest, CELL_TOWERS, COVERAGE_RADIUS);
    routes.scores.safe    = computeConnScore(routes.safe,    CELL_TOWERS, COVERAGE_RADIUS);
    routes.dzSegment      = findDeadZoneSegment(routes.fastest, CELL_TOWERS, COVERAGE_RADIUS);
    updateDeadZonePanel(routes.dzSegment);
    updateComparisonTable();
    if (!graphReady) selectRouteFallback(state.route);
  }
}

// ── OSRM fallback route selection (before graph loads) ────────
function selectRouteFallback(mode) {
  state.route = mode;
  [" fastest", "safe", "auto"].forEach(m =>
    document.getElementById(`btn-${m.trim()}`)?.classList.toggle("active", m.trim() === mode)
  );

  const showMesh = mode !== "safe";
  drawRoutes(mode, routes.fastest, routes.safe, showMesh ? routes.dzSegment : []);
  drawFleet(showMesh);
  drawBridges(showMesh);
  if (showMesh) {
    setMeshActive(true);
    state.evPath = routes.fastest;
  } else {
    setMeshActive(false);
    state.evPath = routes.safe;
  }

  const cF = routes.scores.fastest, cS = routes.scores.safe;
  if (mode === "fastest") {
    updateMetrics({ eta: "14 min", dist: "6.2 km", conn: cF, mesh: 84 });
  } else if (mode === "safe") {
    updateMetrics({ eta: "19 min", dist: "8.1 km", conn: cS, mesh: 0 });
  } else {
    updateMetrics({ eta: "16 min", dist: "7.0 km", conn: Math.round((cF + cS) / 2), mesh: 45 });
  }
  placeEV(state.evPath[0]);
}

// ── Route button handler ──────────────────────────────────────
function selectRoute(mode) {
  state.route = mode;

  [" fastest", "safe", "auto"].forEach(m =>
    document.getElementById(`btn-${m.trim()}`)?.classList.toggle("active", m.trim() === mode)
  );

  // Map mode → slider value and run A*
  const sliderMap = { fastest: 10, auto: 50, safe: 90 };
  const sliderVal = sliderMap[mode] ?? 50;

  const slider = document.getElementById("priority-slider");
  if (slider) {
    slider.value = sliderVal;
    setSliderLabel(sliderVal);
  }


  if (graphReady) {
    runAstar(sliderVal);
  } else {
    selectRouteFallback(mode);
  }
}

// ── Slider change handler ─────────────────────────────────────
function onSliderChange(val) {
  const numVal     = parseInt(val, 10);
  state.sliderVal  = numVal;
  setSliderLabel(val);

  // Update the route mode button highlight
  const newMode = getRouteFromSlider(val);
  if (newMode !== state.route) {
    state.route = newMode;
    [" fastest", "safe", "auto"].forEach(m =>
      document.getElementById(`btn-${m.trim()}`)?.classList.toggle("active", m.trim() === newMode)
    );
  }

  if (graphReady) {
    // ── A* path (debounced) ──────────────────────────────────
    clearTimeout(sliderDebounceTimer);
    sliderDebounceTimer = setTimeout(() => runAstar(numVal), DEBOUNCE_MS);

    // Immediately interpolate the UI numbers so the panels feel instant
    const t        = numVal / 100;
    const cF       = routes.scores.fastest;
    const cS       = routes.scores.safe;
    const conn     = Math.round(cF + (cS - cF) * t);
    const etaMins  = Math.round(14 + (22 - 14) * t);
    const distKm   = (6.2 + (8.5 - 6.2) * t).toFixed(1);
    const mesh     = computeMeshViabilityScore(numVal, FLEET_DENSITY_24H[state.selectedHour]);
    updateMetrics({ eta: `${etaMins} min`, dist: `${distKm} km`, conn, mesh });

  } else {
    // Graph not loaded yet — interpolate metrics only
    const t       = numVal / 100;
    const cF      = routes.scores.fastest;
    const cS      = routes.scores.safe;
    const conn    = Math.round(cF + (cS - cF) * t);
    const etaMins = Math.round(14 + (19 - 14) * t);
    const distKm  = (6.2 + (8.1 - 6.2) * t).toFixed(1);
    const mesh    = Math.round(84 * (1 - t));
    updateMetrics({ eta: `${etaMins} min`, dist: `${distKm} km`, conn, mesh });
  }
}

// ── Event binding ─────────────────────────────────────────────
function bindRouteButtons() {
  ["fastest", "safe", "auto"].forEach(mode => {
    document.getElementById(`btn-${mode}`)?.addEventListener("click", () => selectRoute(mode));
  });
}

function bindSlider() {
  const slider = document.getElementById("priority-slider");
  if (slider) {
    slider.addEventListener("input", function () {
      onSliderChange(this.value);
    });
  }

  const p2pToggle = document.getElementById("p2p-toggle");
  if (p2pToggle && slider) {
    p2pToggle.addEventListener("change", () => {
      // If toggling P2P on/off, re-run A* instantly to show path jump
      if (graphReady) {
        runAstar(parseInt(slider.value, 10));
      }
    });
  }

  const weatherToggle = document.getElementById("weather-toggle");
  if (weatherToggle && slider) {
    weatherToggle.addEventListener("change", () => {
      drawWeatherZones(weatherToggle.checked);
      if (graphReady) {
        // Recompute ghosts on weather toggle
        const fleetNow = FLEET_DENSITY_24H[state.selectedHour];
        ghostFast = findRoute(graphAdj, graphNodes, originNodeId, destNodeId,   0, CELL_TOWERS, COVERAGE_RADIUS, fleetNow, weatherToggle.checked ? WEATHER_ZONES : [], getZonePenaltyAt);
        ghostSafe = findRoute(graphAdj, graphNodes, originNodeId, destNodeId, 100, CELL_TOWERS, COVERAGE_RADIUS, fleetNow, weatherToggle.checked ? WEATHER_ZONES : [], getZonePenaltyAt);
        if (ghostFast && ghostSafe) drawGhostRoutes(ghostFast, ghostSafe);
        
        runAstar(parseInt(slider.value, 10));
      }
    });
  }
}

function bindSimToggle() {
  document.getElementById("sim-toggle")?.addEventListener("change", function () {
    state.simActive = this.checked;
    if (state.simActive) {
      state.simPaused = false;
      updatePauseBtn();
      startSimulation();
    } else {
      stopSimulation();
      state.simPaused = false;
      updatePauseBtn();
      placeEV(state.evPath[0]);
      appendLog("warn", "■ Simulation stopped.");
    }
  });
}

function bindKeyboardShortcuts() {
  document.addEventListener("keydown", e => {
    if (e.key === "1") selectRoute("fastest");
    if (e.key === "2") selectRoute("safe");
    if (e.key === "3") selectRoute("auto");
    if (e.key === " ") {
      e.preventDefault();
      const toggle = document.getElementById("sim-toggle");
      if (toggle) { toggle.checked = !toggle.checked; toggle.dispatchEvent(new Event("change")); }
    }
    if (e.key === "p" || e.key === "P") {
      if (state.simActive) togglePause();
    }
  });
}

// ── Pause / Resume helpers ────────────────────────────────
function updatePauseBtn() {
  const btn = document.getElementById("pause-btn");
  if (!btn) return;
  if (!state.simActive) {
    btn.textContent = "⏸ Pause";
    btn.disabled = true;
    btn.classList.remove("paused");
  } else if (state.simPaused) {
    btn.textContent = "▶ Resume";
    btn.disabled = false;
    btn.classList.add("paused");
  } else {
    btn.textContent = "⏸ Pause";
    btn.disabled = false;
    btn.classList.remove("paused");
  }
}

function togglePause() {
  if (!state.simActive) return;
  if (state.simPaused) {
    resumeSimulation();
    appendLog("ready", "▶ Simulation resumed.");
  } else {
    pauseSimulation();
    appendLog("warn", "⏸ Simulation paused.");
  }
  updatePauseBtn();
}

function bindPauseBtn() {
  document.getElementById("pause-btn")?.addEventListener("click", togglePause);
  updatePauseBtn();
}

function bindDensityChart() {
  const wrap = document.getElementById("density-bars");
  if (wrap) {
    wrap.addEventListener("click", (e) => {
      const bar = e.target.closest(".density-bar");
      if (bar) {
        const h = parseInt(bar.dataset.hour, 10);
        if (!isNaN(h) && h !== state.selectedHour) {
          state.selectedHour = h;
          renderDensityChart();

          if (graphReady) {
            // Recompute ghost routes when density changes
            const fleetNow = FLEET_DENSITY_24H[state.selectedHour];
            const isW = document.getElementById("weather-toggle")?.checked ?? true;
            ghostFast = findRoute(graphAdj, graphNodes, originNodeId, destNodeId,   0, CELL_TOWERS, COVERAGE_RADIUS, fleetNow, isW ? WEATHER_ZONES : [], getZonePenaltyAt);
            ghostSafe = findRoute(graphAdj, graphNodes, originNodeId, destNodeId, 100, CELL_TOWERS, COVERAGE_RADIUS, fleetNow, isW ? WEATHER_ZONES : [], getZonePenaltyAt);
            if (ghostFast && ghostSafe) {
              drawGhostRoutes(ghostFast, ghostSafe);
            }
            
            const slider = document.getElementById("priority-slider");
            const sliderVal = slider ? parseInt(slider.value, 10) : 50;
            runAstar(sliderVal);
          } else {
            selectRouteFallback(state.route);
          }
        }
      }
    });
  }
}

// ── Init ──────────────────────────────────────────────
async function init() {
  // 1. Static map layers
  drawCoverage();
  drawWeatherZones();
  drawTowers();
  renderDensityChart();

  // 2. Bind all interactions
  bindRouteButtons();
  bindSlider();
  bindSimToggle();
  bindKeyboardShortcuts();
  bindDensityChart();
  bindPauseBtn();

  // 3. Init interactive zones  — connects to runAstar as the onChange callback
  initInteractiveZones(() => {
    const slider = document.getElementById("priority-slider");
    const val    = slider ? parseInt(slider.value, 10) : 50;
    appendLog("warn", "⚠ Zone changed — recalculating route…");
    // Recompute ghost routes too so the reference paths move
    if (graphReady) {
      const fleetNow = FLEET_DENSITY_24H[state.selectedHour];
      const isW = document.getElementById("weather-toggle")?.checked ?? true;
      ghostFast = findRoute(graphAdj, graphNodes, originNodeId, destNodeId,   0, CELL_TOWERS, COVERAGE_RADIUS, fleetNow, isW ? WEATHER_ZONES : [], getZonePenaltyAt);
      ghostSafe = findRoute(graphAdj, graphNodes, originNodeId, destNodeId, 100, CELL_TOWERS, COVERAGE_RADIUS, fleetNow, isW ? WEATHER_ZONES : [], getZonePenaltyAt);
      if (ghostFast && ghostSafe) drawGhostRoutes(ghostFast, ghostSafe);
    }
    runAstar(val);
  });

  // 4. "Add Zone" button — enables click-to-place mode
  document.getElementById("btn-add-zone")?.addEventListener("click", () => {
    enableDropMode();
    appendLog("warn", "🟣 Click anywhere on the map to place a signal zone.");
  });

  // 5. Immediate first paint with fallback data
  state.evPath = routes.fastest;
  selectRouteFallback("fastest");

  // 6. Fetch real OSRM routes (fast, used as visual placeholder)
  await loadRealRoutes();

  // 7. Load full OSM graph + activate A* engine
  //    (runs concurrently after OSRM so we show something immediately)
  initGraph(); // intentionally not awaited — happens in background
}

init();
