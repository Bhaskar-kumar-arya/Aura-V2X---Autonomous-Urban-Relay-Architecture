# Aura-V2X Data Architecture Pipeline

This document outlines the data architecture for the Aura-V2X mesh routing application, detailing how fixed (historical) data interacts with real-time telemetry to create a self-healing, accurate, and highly responsive routing engine.

## 1. Overview: The Lambda Architecture Approach

To achieve both instantaneous pathfinding (A*) and long-term accuracy without bringing down the system with heavy database queries, Aura-V2X utilizes a variation of **Lambda Architecture**. 

This separates our data processing into two distinct streams:
- **The Hot Path (Real-Time):** Ingests live telemetry from fleet vehicles, providing immediate overrides (e.g., temporary dead zones, sudden congestion, weather events). Prioritizes speed and low latency.
- **The Cold Path (Historical/Batch):** A highly structured, pre-computed baseline map of "fixed" signal strengths and fleet densities. Prioritizes accuracy and serves as the ultimate fallback.

---

## 2. Pipeline Components

### A. Data Sources (Ingestion)
1. **Historical Baseline Data:** Seed data consisting of known cellular tower locations, standard coverage radii, and historical fleet densities bucketed by time of day (e.g., Morning Rush, Night).
2. **Live Fleet Telemetry (V2V / V2I):** Connected fleet vehicles constantly pinging the edge servers with:
   - Current GPS Coordinates (Lat/Lng)
   - Current Cellular Signal Strength (RSSI / dBm)
   - Timestamps
3. **External Real-Time Overrides:** Dynamic data such as live weather APIs (storm cells) that artificially impact signal strengths.

### B. The Hot Path (Speed Layer)
*Technology Stack Example: Redis / Memcached / Apache Kafka*

- Live pings are streamed into an in-memory datastore.
- Data is strictly geo-indexed (e.g., using H3 or Geohash) and attached to specific map segments.
- **Time-to-Live (TTL):** Real-time events expire. If a vehicle reports a completely dead signal in a previously "Green" zone, it becomes a "Red" zone override for the next 45 minutes. If no other vehicle confirms the dead zone within that TTL, the system reverts to the Cold Path average.

### C. The Cold Path (Serving Layer & Batch Processing)
*Technology Stack Example: PostgreSQL + PostGIS, Apache Spark*

- **The Serving Layer:** A highly optimized, read-only grid map combining historical signal averages and historical fleet density. This is what the A* algorithm queries 95% of the time.
- **The Batch Processor:** Every 24 hours (e.g., at 3:00 AM), a batch job takes all the cached live telemetry from the Hot Path and merges it into the Cold Path database.
- **Exponential Moving Average (EMA):** When merging live data into the fixed base, we use an EMA to prevent a single weird day (e.g., a massive parade) from permanently ruining the baseline. 
  `New_Historical_Avg = (Old_Historical_Avg * 0.9) + (Average_of_Yesterday's_Live_Data * 0.1)`

---

## 3. The Pathfinding Execution Loop (The A* Engine)

When an emergency vehicle requests a route, the following loop runs in milliseconds:

1. **Request Sent:** Origin, Destination, and "Connectivity Urgency" (Slider Value).
2. **Graph Assembly:** The system pulls the base road network topology.
3. **Cost Calculation (edgeCost.js):** For every edge considered:
   - *Query Hot Path:* Is there an active weather storm or temporary dead zone/congestion override here? If yes, apply Hot cost.
   - *Query Cold Path (Fallback):* If no Hot data exists, what is the historical signal strength and historical fleet density for this specific Hour of Day?
4. **Mesh Buffer Discount:** If a dead zone is detected (Hot or Cold), calculate the V2V mesh viability. If fleet density is high enough adjacent to the dead zone, reduce the dead-zone penalty, allowing the ambulance to drive *through* the coverage gap.
5. **Route Returned:** A* algorithm outputs the cheapest path based on the blended weights.

---

## 4. Why This Architecture Wins

* **Zero-Downtime Resilience:** If the Hot Path crashes, or there are zero cars on the road to provide live data, the A* algorithm falls back to the Cold Path instantaneously. Routing never fails.
* **Self-Healing Connectivity Map:** As cities evolve (new 5G towers are built, old buildings are demolished), the real-time data slowly shifts the historical averages via the nightly EMA batch job. The map maintains itself.
* **Insanely Fast Pathfinding:** By keeping the complex geographical math (like calculating overlapping tower radii) largely restricted to the nightly batch jobs, the A* algorithm only has to do simple lookups against the pre-computed grid and the fast Hot cache.

## 5. Visual Pipeline Diagram (Text Representation)

```text
[ Connected Fleet Vehicles ] --ping--> [ Load Balancer ]
                                            |
                         +------------------+------------------+
                         |                                     |
               (Live Pings & RSSI)                   (Nightly Batch Export)
                         V                                     V
        +---------------------------------+     +-----------------------------------+
        |       HOT PATH (Speed)          |     |       COLD PATH (Batch)           |
        | [ Redis / In-Memory Cache ]     |     | [ PostGIS / Spatial DB ]          |
        | - Temporary Dead Zones          |     | - Nightly EMA Calculation         |
        | - Live Weather Events           |     | - Fixed Tower Signal Radii        |
        | - Drops data after 45m (TTL)    |     | - Historical Fleet Density Matrix |
        +---------------------------------+     +-----------------------------------+
                         |                                     |
                         +------------------+------------------+
                                            |
                                            V
                          [ A* ROUTING ENGINE (edgeCost) ]
                          - Blends Hot (Live overrides) 
                          - Falls back to Cold (Baseline)
                          - Computes V2V Mesh Viability Buffer
                                            |
                                            V
                                [ EMERGENCY VEHICLE UI ]
```
