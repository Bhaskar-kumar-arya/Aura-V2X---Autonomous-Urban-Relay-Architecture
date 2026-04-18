/**
 * data.js — All static simulation data for V2V MeshRoute Demo
 * No external dependencies.
 */

// ── Route endpoints (used by routing.js for OSRM API calls) ────
/** Start of both candidate routes */
export const ROUTE_ORIGIN      = [40.7421, -74.0001]; // Chelsea, NYC
/** Shared destination */
export const ROUTE_DESTINATION = [40.7075, -73.9826]; // Chinatown / Lower East Side
/**
 * Intermediate waypoint for the SAFE route.
 * Steers EAST of the T04 dead zone on West Side Hwy.
 * Forces OSRM safe route through the Village / 7th Ave corridor.
 */
export const SAFE_WAYPOINT     = [40.7200, -73.9940]; // East bypass (7th Ave area)

/** Cell tower definitions with coverage quality and RSSI */
export const CELL_TOWERS = [
  { id: "T01", lat: 40.7400, lng: -74.0045, quality: "green",  rssi: -72,  label: "Tower T01" },
  { id: "T02", lat: 40.7340, lng: -73.9960, quality: "green",  rssi: -78,  label: "Tower T02" },
  { id: "T03", lat: 40.7280, lng: -73.9900, quality: "yellow", rssi: -91,  label: "Tower T03" },
  // T04 is placed on the West Side Hwy / Washington St corridor —
  // confirmed from A* path sampling to be the actual shortest-road path.
  // At slider=0 A* routes straight through it; at high slider values it
  // detours east along 7th Ave / Broadway, producing visually distinct routes.
  { id: "T04", lat: 40.7200, lng: -74.0065, quality: "red",    rssi: -109, label: "Tower T04 (Dead Zone)" },
  // T05 moved near the Chinatown destination — provides green coverage at the
  // destination end but does NOT cover the mid-corridor eastern detour path.
  // This is critical: T05 previously cloaked the T07 orange zone with green quality.
  { id: "T05", lat: 40.7085, lng: -73.9835, quality: "green",  rssi: -74,  label: "Tower T05" },
  { id: "T06", lat: 40.7350, lng: -73.9900, quality: "green",  rssi: -80,  label: "Tower T06" },
  // T07 is placed on the confirmed middle path (slider=35-70 A* result, midpoint 40.7184,-74.0009).
  // Uses "orange" quality: moderate dead zone. A* routes THROUGH it when avoiding T04
  // (it's cheaper than a large eastern detour) but routes AROUND it at slider=70+.
  { id: "T07", lat: 40.7185, lng: -74.0015, quality: "orange", rssi: -104, label: "Tower T07 (Weak Zone)" },
];

/**
 * Coverage radius (metres) per quality tier.
 * orange = 340m: tightly covers the middle path corridor only.
 */
export const COVERAGE_RADIUS = { green: 600, yellow: 450, orange: 340, red: 420 };

/**
 * Fallback route coordinates shown if the OSRM API is unreachable.
 * FASTEST mirrors the real A* path (West Side corridor through dead zone).
 * SAFE mirrors the eastern bypass (7th Ave / Broadway east of dead zone).
 */
export const FALLBACK_FASTEST = [
  [40.7421, -74.0001],
  [40.7372, -74.0006],
  [40.7314, -74.0041],
  [40.7239, -74.0061],   // enters dead zone (West Side Hwy)
  [40.7177, -74.0076],   // deep in dead zone
  [40.7137, -74.0036],
  [40.7042, -73.9826],
];

export const FALLBACK_SAFE = [
  [40.7421, -74.0001],
  [40.7370, -73.9980],
  [40.7300, -73.9940],
  [40.7230, -73.9910],   // stays east of dead zone
  [40.7160, -73.9880],
  [40.7090, -73.9850],
  [40.7042, -73.9826],
];
// Dead-zone segment is now computed dynamically by scoring.findDeadZoneSegment()

/** Simulated fleet vehicles. FV-03 and FV-04 are deliberately placed within
 *  DSRC/C-V2X range (~500m) of the T04 dead zone boundary so the mesh relay
 *  story is geographically credible. FV-01/02/05/06 are on the eastern bypass. */
export const FLEET_VEHICLES = [
  { id: "FV-01", lat: 40.7360, lng: -73.9980, label: "Fleet Van #1" },
  { id: "FV-02", lat: 40.7300, lng: -73.9960, label: "Fleet Van #2" },
  // FV-03/04: parked near the dead zone boundary — within 500m DSRC range of T04
  { id: "FV-03", lat: 40.7240, lng: -74.0020, label: "Fleet Van #3 (Relay)" },
  { id: "FV-04", lat: 40.7165, lng: -74.0025, label: "Fleet Van #4 (Relay)" },
  { id: "FV-05", lat: 40.7120, lng: -73.9900, label: "Fleet Van #5" },
  { id: "FV-06", lat: 40.7270, lng: -73.9950, label: "Fleet Van #6" },
];

/** Bridge nodes at dead-zone boundary — can relay via C-V2X to both EV and cell tower */
export const BRIDGE_NODES = [
  // BN-A: north-east boundary of T04 dead zone — has line-of-sight to T02 (green)
  { id: "BN-A", lat: 40.7270, lng: -74.0010, label: "Bridge Node DZ-04-A", tower: "T02" },
  // BN-B: south boundary of T04 dead zone — has line-of-sight to T05 (green)
  { id: "BN-B", lat: 40.7130, lng: -74.0020, label: "Bridge Node DZ-04-B", tower: "T05" },
];

/** Historical fleet vehicle density by hour (index = hour 0–23) */
export const FLEET_DENSITY_24H = [
  1, 0, 0, 0, 1, 2, 5, 8, 11, 9, 8, 9, 10, 9, 8, 9, 10, 11, 10, 8, 6, 5, 3, 2,
];
