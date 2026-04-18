/**
 * drawCoverage.js — Renders cellular coverage circles on the map.
 * Imports: layerCoverage (mapInit), CELL_TOWERS + COVERAGE_RADIUS (data)
 */

import { layerCoverage } from "./mapInit.js";
import { CELL_TOWERS, COVERAGE_RADIUS } from "./data.js";

const FILL_COLORS = { green: "#22c55e", yellow: "#f59e0b", red: "#ef4444" };

/** Draw translucent coverage circles for every cell tower. */
export function drawCoverage() {
  layerCoverage.clearLayers();

  CELL_TOWERS.forEach(tower => {
    const color = FILL_COLORS[tower.quality];
    L.circle([tower.lat, tower.lng], {
      radius:      COVERAGE_RADIUS[tower.quality],
      color,
      fillColor:   color,
      fillOpacity: 0.10,
      weight:      1.5,
      opacity:     0.5,
      dashArray:   tower.quality === "red" ? "6 4" : null,
    }).addTo(layerCoverage);
  });
}
