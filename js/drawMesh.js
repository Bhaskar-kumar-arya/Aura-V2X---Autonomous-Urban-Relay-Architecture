/**
 * drawMesh.js — Renders C-V2X mesh link visualisation on the map.
 * Shows: EV → Fleet Relay (FV-03/04) → Bridge Node → Cell Tower (LTE uplink)
 *
 * The EV position is passed in at call-time (not hardcoded) so the lines
 * originate from the actual position of the ambulance on the road network.
 */

import { layerMesh } from "./mapInit.js";
import { BRIDGE_NODES, CELL_TOWERS, FLEET_VEHICLES } from "./data.js";

/**
 * Draw animated dashed mesh links from the live EV position through the V2V relay chain.
 *
 * Chain: EV (inside dead zone)
 *        → FV-03 / FV-04 (fleet relays, within DSRC range ~500m)
 *        → Bridge Node A / B (at dead zone boundary, has LTE)
 *        → Cell Tower
 *
 * @param {[number, number]} evLatLng  — current [lat, lng] of the EV marker
 */
export function drawMeshLinks(evLatLng) {
  layerMesh.clearLayers();

  // Use the live EV position; fall back to the T04 dead zone centre if not provided
  const evPos = evLatLng ?? [40.7200, -74.0065];

  // Relay fleet vehicles (FV-03 / FV-04 — the ones near the dead zone boundary)
  const relayFV03  = [FLEET_VEHICLES[2].lat, FLEET_VEHICLES[2].lng]; // FV-03
  const relayFV04  = [FLEET_VEHICLES[3].lat, FLEET_VEHICLES[3].lng]; // FV-04

  const bridgeA    = [BRIDGE_NODES[0].lat,   BRIDGE_NODES[0].lng];   // BN-A (north boundary)
  const bridgeB    = [BRIDGE_NODES[1].lat,   BRIDGE_NODES[1].lng];   // BN-B (south boundary)

  // T02 is the uplink tower for BN-A (within green coverage at the boundary)
  const towerT2    = [CELL_TOWERS[1].lat,    CELL_TOWERS[1].lng];     // T02 — green

  // ── Hop 1: EV → Fleet Relay vehicles (C-V2X / DSRC 5.9 GHz) ──
  const v2xStyle = {
    color: "#6ee7f7", weight: 3, opacity: 0.85,
    dashArray: "10 6", className: "mesh-path",
  };

  L.polyline([evPos, relayFV03], v2xStyle)
    .bindTooltip("C-V2X Hop 1: EV → FV-03  (DSRC 5.9 GHz, ≈500m)", { sticky: true })
    .addTo(layerMesh);

  L.polyline([evPos, relayFV04], { ...v2xStyle, opacity: 0.65 })
    .bindTooltip("C-V2X Hop 1: EV → FV-04  (DSRC 5.9 GHz, ≈450m)", { sticky: true })
    .addTo(layerMesh);

  // ── Hop 2: Fleet Relay → Bridge Node (still C-V2X, shorter hop) ──
  L.polyline([relayFV03, bridgeA], { ...v2xStyle, opacity: 0.60, weight: 2.5 })
    .bindTooltip("C-V2X Hop 2: FV-03 → Bridge Node A  (DSRC, ≈350m)", { sticky: true })
    .addTo(layerMesh);

  L.polyline([relayFV04, bridgeB], { ...v2xStyle, opacity: 0.55, weight: 2.5 })
    .bindTooltip("C-V2X Hop 2: FV-04 → Bridge Node B  (DSRC, ≈300m)", { sticky: true })
    .addTo(layerMesh);

  // ── Hop 3: Bridge Node → Cell Tower (LTE uplink, back to infrastructure) ──
  const lteStyle = {
    color: "#38bdf8", weight: 2.5, opacity: 0.7,
    dashArray: "6 4", className: "mesh-path",
  };

  L.polyline([bridgeA, towerT2], lteStyle)
    .bindTooltip("LTE Uplink: Bridge Node A → Tower T02", { sticky: true })
    .addTo(layerMesh);

  // ── Glow halos around active participants ──────────────────────
  const halo = (latlng, color, radius) =>
    L.circle(latlng, {
      radius, color, fillColor: color,
      fillOpacity: 0.10, weight: 1.5, dashArray: "4 4",
    });

  halo(evPos,     "#ef4444", 130).addTo(layerMesh);   // EV (dead zone)
  halo(relayFV03, "#6ee7f7",  90).addTo(layerMesh);   // relay vehicle A
  halo(relayFV04, "#6ee7f7",  90).addTo(layerMesh);   // relay vehicle B
  halo(bridgeA,   "#38bdf8",  70).addTo(layerMesh);   // bridge node A
  halo(bridgeB,   "#38bdf8",  70).addTo(layerMesh);   // bridge node B (visual only)
}

/** Remove all mesh link layers from the map. */
export function clearMeshLinks() {
  layerMesh.clearLayers();
}
