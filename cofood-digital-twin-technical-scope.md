# Technical Scope: coFood Collaborative Garden Digital Twin & Living Archive

**Project:** Digital capture and interactive experience for the coFood Collaborative Garden (265 East 4th Ave, Mount Pleasant, Vancouver)

**Prepared for:** Sponsors, partners, and technical collaborators

**Status:** Draft

**Codebase:** this monorepo — web-based Gaussian splat viewer with map, 3D navigation, hotspot markers, admin, and editor tooling

**Implementation plan:** [`cofood-digital-twin-implementation-plan.md`](./cofood-digital-twin-implementation-plan.md)  
**Near-term student window:** [`docs/cofood-scope.md`](./docs/cofood-scope.md)

---

## 1. Executive summary

This document defines the technical scope for building a **navigable digital twin** of the coFood Collaborative Garden: a web-accessible 3D environment where visitors explore a Gaussian splat capture of the site and discover **warm data** — stories, oral histories, compost knowledge, seasonal observations, and community memories linked to specific places in the garden.

This repository is the coFood platform fork. It already provides:

- Web rendering of Gaussian splat scenes (Three.js + `@mkkellogg/gaussian-splats-3d`, PlayCanvas migration in progress)
- Fly-through navigation and performance tuning for varied devices
- 3D world-space hotspots (markers) with click-to-reveal labels
- An in-scene editor for placing hotspots without developer intervention
- An authenticated admin panel for managing site content
- AWS deployment patterns (S3, CloudFront, API Gateway, Lambda, DynamoDB, Cognito) — **new project-owned infra required**

New work focuses on **multimedia archives**, **community contribution workflows**, **capture versioning across seasons**, and **garden-specific content structures** (compost systems, oral histories, educational overlays).

### Strategic constraint

The garden faces redevelopment pressure; **2026 is the last guaranteed growing season**. Technical planning prioritizes:

1. **Spatial capture early** — preserve the site before physical change accelerates
2. **Incremental launch** — ship a usable public viewer with curated hotspots before the full archive is complete
3. **Document transformation in progress** — capture the compost infrastructure rebuild (summer–fall 2026) as an evolving record, not only a final state

---

## 2. Goals and non-goals

### Goals

| Goal | Technical expression |
|------|----------------------|
| Navigable digital twin | Web Gaussian splat viewer with intuitive movement and orientation |
| Situated warm data | Hotspots at 3D coordinates carrying text, images, audio, and video |
| Compost education | Structured content for vermicompost, Earth Machine, drum, and static pile systems |
| Community archive | Stewards can add and curate content; optional moderated public contributions |
| Seasonal documentation | Multiple dated captures of the same site, selectable by visitors |
| Accessibility | Remote/async exploration for people who cannot visit physically |
| Replicable methodology | Documented fork of the platform for other community gardens |

### Non-goals (initial release)

- Real-time or live sensor integration (soil moisture, temperature, etc.)
- Full VR/AR native applications (web-first; VR export is a future consideration)
- Automated AI narration or generative content
- Replacement for physical garden operations or land advocacy tooling
- Blockchain or decentralized storage schemes

These may be revisited in later phases if sponsor interest and capacity allow.

---

## 3. Technical foundation

### 3.1 Platform codebase

This repository is a TypeScript monorepo:

```text
apps/
  viewer/     Public read-only 3D experience
  admin/      Authenticated admin panel + in-scene editor

packages/
  shared/     Three.js runtime, types, marker utilities, styles
```

| Component | Role for coFood |
|-----------|-----------------|
| `GaussianViewer` | Load and render garden splat files |
| `ThreeApp` | Camera, controls, render loop, quality presets |
| `WorldMarkers` | Hotspot sprites and label overlays in 3D space |
| `FlyControls` | WASD + mouse navigation through the garden |
| `MarkerPickingController` | Raycast click on hotspots |
| Admin `Editor` | Place and edit hotspot positions in the splat scene |
| Admin `Admin` | CRUD for site metadata and marker arrays |
| `publicApi` / `adminApi` | Read and write content via API Gateway + Lambda |

Deployment follows a **two-app, two-CloudFront** model: public viewer and authenticated admin/editor, sharing one API and one assets bucket for splats and media.

### 3.2 Rebrand and hosting strategy

This fork continues as the coFood / Living Systems Network product with:

- coFood branding and copy
- Removal of prior soil-science-specific content and multi-field map assumptions where inappropriate
- Extended data model for multimedia, captures, and contributions
- Environment and infrastructure provisioned under coFood or LSN AWS accounts (or equivalent sponsor-provided hosting)

Legacy production buckets, CloudFront distributions, and CDN URLs from the previous project are **not** referenced in this repo; all deploy scripts require explicit env vars.

---

## 4. System architecture

### 4.1 High-level diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         Content producers                                │
│   Stewards · volunteers · oral historians · compost educators           │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Capture team  │     │ Admin + Editor  │     │ Contribution    │
│ (splat export)│     │ (hotspot CRUD)  │     │ portal (Phase 3)│
└───────┬───────┘     └────────┬────────┘     └────────┬────────┘
        │                      │                       │
        ▼                      ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ S3 assets bucket                                                         │
│   /captures/{captureId}/scene.ksplat                                     │
│   /media/{assetId}/...   (images, audio, video, PDFs)                    │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ API Gateway + Lambda                                                     │
│   GET  /captures, /hotspots, /tours        (public)                      │
│   POST /contributions                      (authenticated / moderated)   │
│   CRUD /admin/api/*                        (steward Cognito JWT)           │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ DynamoDB                                                                 │
│   Sites · Captures · Hotspots · MediaAssets · Contributions · Tours      │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ CloudFront + S3 (viewer app)          CloudFront + S3 (admin app)        │
│ Public 3D experience                  Steward tooling + editor           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 User roles

| Role | Access | Capabilities |
|------|--------|--------------|
| **Public visitor** | Viewer app, no login | Explore splat, view public hotspots, follow guided tours |
| **Steward** | Admin app (Cognito) | Edit hotspots, upload media, manage captures, moderate submissions |
| **Contributor** | Contribution flow (Phase 3) | Submit memories/media for steward review |
| **Capture operator** | Offline tools + steward upload | Produce and publish splat files |

### 4.3 Client technology stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite |
| 3D | Three.js, `@mkkellogg/gaussian-splats-3d` |
| Map (optional context) | Leaflet + OpenStreetMap (single-site or zone overview) |
| Auth | AWS Cognito (stewards); optional magic-link or OAuth for contributors |
| API | API Gateway, Lambda, DynamoDB |
| Media | S3 + CloudFront; presigned uploads for large files |
| IaC | Terraform (project-owned stack; pattern from existing modules) |

---

## 5. Data model (proposed)

Extends existing `Field` / `markers` concepts in this codebase.

### 5.1 Site

One record for the coFood garden.

```ts
Site {
  siteId: string
  name: string
  address: string
  description: string
  lat: number
  lng: number
  thumbnailUrl: string
  defaultCaptureId: string
}
```

### 5.2 Capture

A dated Gaussian splat snapshot of the site. Supports seasonal and pre/post-compost documentation.

```ts
Capture {
  captureId: string
  siteId: string
  label: string              // e.g. "Summer 2026 — pre-compost rebuild"
  capturedAt: ISO8601
  splatUrl: string           // S3 HTTPS URL (.ksplat / .ply)
  thumbnailUrl?: string
  notes?: string
  visibility: "public" | "stewards"
}
```

### 5.3 Hotspot

A point of interest in 3D space with structured warm data.

```ts
Hotspot {
  hotspotId: string
  captureId: string          // hotspots are capture-specific (positions may shift)
  position: { x, y, z }
  icon?: string
  scale?: number
  title: string
  summary: string
  contentType: "story" | "compost" | "plant" | "structure" | "event" | "timeline" | "oral-history"
  tags: string[]             // e.g. ["vermicompost", "2026", "workshop"]
  visibility: "public" | "stewards"
  media: MediaRef[]          // ordered attachments
  createdBy: string
  updatedAt: ISO8601
}

MediaRef {
  assetId: string
  kind: "image" | "audio" | "video" | "pdf" | "link"
  url: string
  caption?: string
  transcript?: string        // for audio/video accessibility
}
```

### 5.4 Contribution (Phase 3)

```ts
Contribution {
  contributionId: string
  siteId: string
  status: "pending" | "approved" | "rejected"
  submitterName: string
  submitterEmail?: string
  title: string
  body: string
  media: MediaRef[]
  suggestedPosition?: { x, y, z }   // optional, steward places in editor
  linkedHotspotId?: string          // if appended to existing hotspot
  submittedAt: ISO8601
  reviewedBy?: string
}
```

### 5.5 Tour (Phase 2 stretch / Phase 3)

```ts
Tour {
  tourId: string
  siteId: string
  captureId: string
  title: string
  description: string
  stops: { hotspotId: string, narration?: string, dwellSeconds?: number }[]
  visibility: "public" | "stewards"
}
```

### 5.6 Data model evolution

| Current model | Target coFood model |
|---------------|---------------------|
| `Field` | `Site` + `Capture` |
| `markers[]` | `Hotspot[]` |
| `MarkerLabel [title, description]` | `title`, `summary`, plus `media[]` |
| `GET /pins` | `GET /captures` + nested public hotspots |
| Admin marker tuples | Hotspot editor with media picker |

---

## 6. Implementation plan

Phase-by-phase deliverables, effort ranges, capacity rules (including the **30-hour EML student** cap), and the 2026–2027 milestone schedule live in:

**→ [`cofood-digital-twin-implementation-plan.md`](./cofood-digital-twin-implementation-plan.md)**

Near-term student delivery (iteration windows inside Phase 1 / early Phase 2):

**→ [`docs/cofood-scope.md`](./docs/cofood-scope.md)**

Product phases (for reference): **1 Spatial capture → 2 Interactive layer → 3 Storytelling archive → 4 Knowledge sharing**.

---

## 7. Infrastructure and operations

### 7.1 AWS resources (estimated monthly, modest traffic)

| Service | Purpose |
|---------|---------|
| S3 | Splats, images, audio, video |
| CloudFront (×2) | Viewer and admin static apps + media CDN |
| API Gateway + Lambda | REST API |
| DynamoDB | Content records (on-demand billing) |
| Cognito | Steward authentication |
| Route 53 (optional) | Custom domain |

**Cost drivers:** splat and video storage, CloudFront egress. Budget **$50–200/month** for early public launch; scale with traffic and media volume.

### 7.2 Environments

| Environment | Use |
|-------------|-----|
| `dev` | Local Vite + optional local API proxy |
| `staging` | Steward QA, capture preview |
| `production` | Public viewer |

### 7.3 Backup and preservation

- S3 versioning enabled on assets bucket
- DynamoDB point-in-time recovery
- **Cold archive:** annual export of all captures + metadata to a preservation bucket (proposal aligns with long-term community memory goals)
- Document splat source files and capture raw imagery offline in steward custody

### 7.4 Security

- No long-lived AWS keys in the browser (address known auth debt via backend signing or Cognito Identity Pool)
- Presigned uploads with type and size limits
- Cognito groups: `steward`, `admin`
- Contributor PII (email) stored minimally; not displayed publicly without consent
- HTTPS everywhere; CORS restricted to known origins

---

## 8. Accessibility

| Requirement | Approach |
|-------------|----------|
| Keyboard navigation | Focusable UI panels; skip-to-content for non-3D fallback |
| Screen readers | Text alternatives for hotspot content; transcripts for audio |
| Reduced motion | Option to disable fly controls; static camera presets per zone |
| Low bandwidth | Quality preset (existing ScreenSpace low/medium/high) |
| Non-WebGL fallback | Map + list view of hotspots with media (degraded but readable) |

---

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Splat too large for mobile | Excludes key audiences | Aggressive compression; quality presets; zone-based captures if needed |
| Hotspot drift between captures | Broken positions after rescan | Hotspots scoped per `captureId`; editor re-placement workflow |
| Compost rebuild mid-project | Visual mismatch | Multiple captures; label timelines clearly |
| Oral history consent gaps | Legal/ethical exposure | Consent forms before Phase 3 launch; steward review |
| Single technical bus factor | Project stall | Documentation from Phase 1; open-source Phase 4 |
| Land sale before capture | Lost spatial record | **Prioritize Phase 1 capture in summer 2026** |
| Sponsor infra lapse | Site goes offline | Preservation bucket + exportable static bundle |

---

## 10. Dependencies

| Dependency | Owner | Needed by |
|------------|-------|-----------|
| Garden access for capture | coFood stewards | Phase 1 |
| Drone permissions / insurance | Project lead | Phase 1 |
| AWS or equivalent hosting budget | Sponsor | Phase 1 |
| Cognito / domain for admin | Technical lead | Phase 1 |
| Compost educational copy | Compost working group | Phase 2 |
| Oral history participants | Community outreach | Phase 3 |
| Legal review of consent (lightweight) | LSN / sponsor | Phase 3 |

---

## 11. Milestone schedule

See **Suggested milestone schedule** in [`cofood-digital-twin-implementation-plan.md`](./cofood-digital-twin-implementation-plan.md).

---

## 12. Success criteria (project-level)

1. **Preservation:** A high-fidelity navigable record of the 2026 garden exists and remains accessible after physical site change.
2. **Education:** Compost systems are documented so an external community could replicate the approach.
3. **Warm data:** Stories and oral histories are discoverable in context — attached to places, not buried in a folder.
4. **Participation:** Stewards author content without developers; community members can submit memories under moderation.
5. **Replication:** Technical documentation allows another garden to adopt the stack within a reasonable effort envelope.

---

## 13. Open decisions

Record stakeholder choices before Phase 2 kickoff:

| Decision | Options |
|----------|---------|
| Hosting owner | LSN AWS · sponsor AWS · academic partner |
| Contributor auth | Open form + CAPTCHA · email verification · steward-only intake |
| Video hosting | Self-hosted S3 · embedded Vimeo/YouTube for cost |
| Map prominence | Full Leaflet entry vs. direct-to-3D landing |
| Capture frequency | One hero capture · quarterly · event-triggered |
| Open-source timing | Phase 4 · never (fork only) · partial (`packages/shared` only) |

---

## 14. Appendix A — Component reuse matrix

| Existing asset | Reuse | Modify | Replace |
|----------------|-------|--------|---------|
| `GaussianViewer` | ✓ | Tune loading | |
| `ThreeApp` | ✓ | | |
| `WorldMarkers` | ✓ | Icon set, panel trigger | |
| `FlyControls` | ✓ | Optional bounds for garden fence | |
| `Editor` | ✓ | Media picker, tags | |
| `Admin` | ✓ | Hotspot schema, captures | |
| Multi-pin `UBCMap` | | | ✓ → single-site or zone map |
| `MarkerLabel` text only | | ✓ → rich hotspot model | |
| DynamoDB `eml_fields` | | ✓ → new tables | |
| Cognito auth | ✓ | Role groups | |

---

## 15. Appendix B — Compost content template (authoring)

Each compost hotspot should support a consistent structure for replication value:

```text
Title:           [System name]
Summary:         [1–2 sentences]
What it is:      [Description]
How we built it: [Steps / link to PDF]
How we maintain: [Workflow / schedule]
What we learned: [Failures, tips]
Seasonal notes:  [Free text]
Media:           [Diagram, photo, optional audio]
Related tags:    compost, vermicompost, workshop-2026, etc.
```

---

*Document version: 0.1 — draft for sponsor and partner review*
