# Aura-V2X: HARMAN Integration & Productization Strategy

*"Where satellite adds a second antenna, our solution adds a second network — one built from the vehicles already on the road."*

## The Strategic Vision

Aura-V2X is not a replacement for HARMAN's existing connectivity hardware. Rather, it is a **software-driven V2X platform extension** designed to sit directly on top of HARMAN's industry-leading TCU portfolio. 

While HARMAN’s **Ready Connect** already provides the market's first TCU with NB-NTN satellite capabilities for remote areas, Aura-V2X introduces a hyper-dense, urban-focused layer of resilience. We transform the vehicle ecosystem into an active routing mesh, creating a multi-tiered safety net for critical telematics.

---

## How HARMAN Can Productize Aura-V2X

By integrating our routing logic and mesh viability protocols into the HARMAN software stack, we can offer OEMs and fleet operators an unprecedented "Cascade Fallback" architecture.

### 1. The Connectivity Cascade Fallback
Instead of a binary choice between fast terrestrial networks and high-latency NB-NTN satellite connectivity, Aura-V2X introduces the **V2V Bridge Node** as the optimal intermediary. The routing hierarchy becomes:
1. **Primary:** 5G / LTE (Direct to Tower)
2. **Secondary:** Aura V2V Mesh Relay (Low latency, leveraging fleet density via PC5)
3. **Tertiary:** NB-NTN Satellite (High latency, guaranteed delivery for remote areas)
4. **Final Fallback:** Onboard Store-and-Forward Buffer

This additive approach ensures that high-priority urban dead zones (tunnels, concrete canyons) are handled by the low-latency mesh before relying on satellite links (which often suffer 20–40s round trips or require clear line-of-sight).

### 2. Native NR-V2X Mode 2 Sidelink Integration
Aura-V2X is built on real-world spec requirements. Our Bridge Node paradigm operates on **3GPP Release 16 NR-V2X Mode 2**. 
* **The Benefit to HARMAN:** Mode 2 allows vehicles to perform autonomous resource selection for direct V2V communications *without any base station assistance*. By commercializing our algorithm alongside HARMAN C-V2X hardware, HARMAN can market a true "Off-Grid V2V" capability that is fully compliant with modern telecom standards.

### 3. Savari MECWAVE & StreetWAVE Expansion
Aura-V2X naturally extends to Vehicle-to-Infrastructure (V2I). We propose integrating the HARMAN **Savari MECWAVE edge computing platform** and **StreetWAVE RSUs** as optional, high-capacity relay nodes.
* **The Use Case:** In critical corridors where vehicle fleet density might be low, a StreetWAVE RSU instantly acts as a permanent Bridge Node. This bridges the gap between infrastructure and vehicles, ensuring mesh coverage is guaranteed regardless of traffic.

### 4. Intelligent Payload Priority Triage
In a real-world emergency, uplink bandwidth on a proxy relay node (the Bridge Vehicle) may be congested. Aura-V2X implements a strict payload priority queue to ensure critical data survives:
1. **Tier 1 (Instant):** eCall / Crash Buffer Data / SOS Telematics (~200 bytes)
2. **Tier 2 (High):** Live GPS Location Pings
3. **Tier 3 (Normal):** Diagnostic Telemetry
4. **Tier 4 (Low):** Standard Status Heartbeats

This engineering depth ensures that HARMAN TCUs running our software will never drop an SOS ping due to mesh saturation.

### 5. Zero-Trust Mesh Security (SCMS)
To address the inherent trust gaps in peer-to-peer mesh networks (spoofing, packet dropping), Aura-V2X natively adopts the **PKI-based certificates (V2X Security Credential Management System - SCMS)** already embedded in HARMAN’s C-V2X stack.
* **The Mechanism:** The relay node signs the forwarded payload with its own certificate. The backend verifies the chain of custody. We aren't building a new security protocol; we are leveraging HARMAN's existing enterprise-grade security to authenticate every mesh transaction.

---

## Market Positioning & Monetization for HARMAN

1. **Premium Software Subscriptions:** Aura-V2X's "Mesh Viability Score" routing engine can be sold as a premium tier subscription within the HARMAN Ignite App Store, specifically targeted at municipal EMS, police, and lucrative commercial fleets.
2. **Hardware Upsell:** The desire for this software capability drives the adoption of HARMAN's higher-end TCUs equipped with C-V2X PC5 chipsets.
3. **Ecosystem Lock-in:** By turning every HARMAN-equipped vehicle into a potential relay node, OEMs are incentivized to utilize HARMAN across their entire lineup to increase mesh density and overall fleet safety.
