# Technical Scope: coFood Collaborative Garden Digital Twin & Living Archive

**Project:** Digital capture and interactive experience for the coFood Collaborative Garden (265 East 4th Ave, Mount Pleasant, Vancouver)

**Prepared for:** Sponsors, partners, and technical collaborators

**Status:** Draft

**Codebase:** this monorepo — web-based Gaussian splat viewer with map, 3D navigation, hotspot markers, admin, and editor tooling

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

## 6. Phase-by-phase technical scope

Aligned with the project proposal. Each phase lists deliverables, engineering work, content work, and acceptance criteria.

---

### Phase 1 — Spatial capture

**Timeline:** Q2–Q3 2026 (parallel with compost site transformation)

**Objective:** Produce a web-optimized Gaussian splat of the garden and stand up hosting for the first public viewer.

#### 6.1.1 Capture production (non-code)

| Task | Detail |
|------|--------|
| Ground photography | Multi-angle coverage of paths, beds, compost zones, structures |
| Drone imagery | Site context and canopy where permitted and safe |
| Splat processing | Train/export Gaussian splat; iterate on quality vs. file size |
| Coordinate alignment | Consistent origin so hotspots remain meaningful within a capture |
| Metadata | Capture date, weather/season notes, changelog for compost rebuild |

**Target splat specs (initial):**

- Format compatible with `@mkkellogg/gaussian-splats-3d` (`.ksplat` or `.ply`)
- Web-optimized build: progressive loading or compressed variant where supported
- Initial budget: ≤ 150 MB per capture (tune based on QA); quality presets in viewer for low-end mobile

#### 6.1.2 Engineering deliverables

| Deliverable | Description |
|-------------|-------------|
| Platform baseline | coFood-branded viewer + admin (this repo) on new AWS infra |
| Infrastructure | S3 assets bucket, viewer CloudFront, API stub, DynamoDB tables |
| Capture upload pipeline | Steward uploads splat to S3; admin registers `Capture` record |
| MVP viewer | Load single capture, fly navigation, loading overlay, mobile smoke test |
| About / context page | Garden overview, accessibility statement, credits |

#### 6.1.3 Acceptance criteria

- [ ] A steward can upload a splat and open it in the public viewer via URL
- [ ] Viewer loads on desktop Chrome, Safari, Firefox and one mid-range mobile device
- [ ] Fly controls documented for first-time visitors (on-screen help)
- [ ] Capture metadata (date, label) visible in the UI

#### 6.1.4 Estimated effort

| Area | Hours (order of magnitude) |
|------|---------------------------|
| Capture production (photo, process, QA) | 80–120 |
| Platform fork + infra setup | 60–80 |
| MVP viewer integration | 40–60 |
| **Phase 1 total** | **180–260** |

---

### Phase 2 — Interactive layer

**Timeline:** Q3–Q4 2026

**Objective:** Hotspots with multimedia, compost education content, and steward authoring workflows.

#### 6.2.1 Engineering deliverables

| Deliverable | Priority | Description |
|-------------|----------|-------------|
| Hotspot panel UI | P0 | Click hotspot → side panel or modal with title, summary, media |
| Multimedia rendering | P0 | Image gallery, inline audio player, embedded or linked video |
| Media upload (admin) | P0 | Presigned S3 upload; attach assets to hotspots |
| Hotspot content types | P1 | Templates for compost system, plant, oral history, event |
| Tagging and filtering | P1 | Filter hotspot list by tag (e.g. show all compost hotspots) |
| Capture switcher | P1 | Toggle between captures (e.g. pre/post compost) |
| Mobile responsive UI | P0 | Readable panels, touch-friendly controls |
| SEO / shareable links | P2 | Deep link to capture + optional hotspot id |
| Guided tour (basic) | P2 | Linear tour: jump camera between ordered hotspots |

#### 6.2.2 Content deliverables (parallel track)

| Content pack | Hotspots (approx.) |
|--------------|-------------------|
| Garden orientation | 5–8 (welcome, paths, gathering areas) |
| Compost systems | 8–12 (one per method + workflow/maintainance) |
| Growing areas | 6–10 (beds, perennials, notable plants) |
| Structures & tools | 4–6 (shed, water, signage) |
| Events & programs | 4–6 (Music in the Garden, workshops) |

Content production includes copy, photos, diagrams, and at least **3–5 short audio clips** (oral history pilots).

#### 6.2.3 API changes

- `GET /captures/:id/hotspots` — public hotspots for a capture
- `POST /admin/api/hotspots` — CRUD with media references
- `POST /admin/api/media/upload-url` — presigned POST
- Extend editor: media picker, content type, tags, visibility toggle

#### 6.2.4 Acceptance criteria

- [ ] Steward places hotspot in editor and attaches image + audio without developer help
- [ ] Public visitor clicks compost drum hotspot and sees diagram, maintenance steps, and optional audio
- [ ] At least two captures published with working capture switcher
- [ ] All public hotspot media served over HTTPS via CDN
- [ ] Panel usable on phone (readable text, playable audio)

#### 6.2.5 Estimated effort

| Area | Hours |
|------|-------|
| Hotspot multimedia UI + API | 80–120 |
| Admin media upload + editor extensions | 60–80 |
| Capture switcher + tagging | 30–40 |
| Content authoring (curated packs) | 80–120 |
| QA + mobile pass | 30–40 |
| **Phase 2 total** | **280–400** |

---

### Phase 3 — Storytelling & living archive

**Timeline:** Q4 2026 – Q2 2027

**Objective:** Oral history collection, community submissions, steward moderation, and steward-only archive tier.

#### 6.3.1 Engineering deliverables

| Deliverable | Priority | Description |
|-------------|----------|-------------|
| Contribution form | P0 | Public form: text, file upload, optional location note |
| Moderation queue | P0 | Admin list: approve → creates/links hotspot |
| Role-based visibility | P0 | `public` vs `stewards` hotspots and captures |
| Transcript field | P1 | Text alongside audio/video for accessibility |
| Timeline view | P1 | Chronological index of stories and captures |
| Oral history workflow | P1 | Batch import template; consent checkbox on submit |
| Search | P2 | Full-text search across hotspot titles and summaries |

#### 6.3.2 Governance (non-code, required)

| Policy | Purpose |
|--------|---------|
| Media consent form | Permission to publish voices and likenesses |
| Moderation guidelines | What stewards approve for public vs. archive-only |
| Attribution standard | Contributor name on approved stories |
| Retention / takedown | Process for removal requests |

#### 6.3.3 Acceptance criteria

- [ ] Contributor submits memory with photo; steward approves and it appears on the site
- [ ] Steward-only hotspot visible only when logged in
- [ ] At least 10 oral history clips published with transcripts
- [ ] Timeline page lists major 2026 garden events and captures

#### 6.3.4 Estimated effort

| Area | Hours |
|------|-------|
| Contribution + moderation system | 80–100 |
| Visibility roles + archive UI | 40–60 |
| Timeline + search | 40–60 |
| Oral history intake + content | 60–100 |
| **Phase 3 total** | **220–320** |

---

### Phase 4 — Knowledge sharing & replication

**Timeline:** Q2–Q3 2027

**Objective:** Public launch, replication documentation, and open components for other community projects.

#### 6.4.1 Engineering deliverables

| Deliverable | Description |
|-------------|-------------|
| Launch hardening | Performance, error monitoring, analytics (privacy-respecting) |
| Replication guide | How to fork, capture, host, and author content |
| Compost documentation export | Static PDF or microsite generated from hotspot content |
| Optional open-source release | Sanitized repo + `packages/shared` as reusable splat+hotspot library |
| Exhibition mode | Kiosk-friendly fullscreen + guided tour autoplay |

#### 6.4.2 Acceptance criteria

- [ ] Public launch URL promoted with stable uptime
- [ ] Replication doc enables a technical partner to deploy a second site
- [ ] Compost education pack downloadable for Fraser Lowland partners
- [ ] Launch event demo: live guided tour on projector + mobile

#### 6.4.3 Estimated effort

| Area | Hours |
|------|-------|
| Hardening + monitoring | 30–50 |
| Documentation + open-source prep | 40–60 |
| Exhibition mode + launch support | 20–40 |
| **Phase 4 total** | **90–150** |

---

## 7. Consolidated effort summary

Assumes **1 technical lead (part-time)** + **1 student or contract developer** + **content/steward team** for media.

| Phase | Engineering | Content / capture | Total (range) |
|-------|-------------|---------------------|---------------|
| 1 — Spatial capture | 100–140 | 80–120 | 180–260 |
| 2 — Interactive layer | 170–240 | 80–120 | 280–400 |
| 3 — Storytelling archive | 160–220 | 60–100 | 220–320 |
| 4 — Knowledge sharing | 90–150 | 20–40 | 90–150 |
| **Grand total** | **520–750** | **240–380** | **770–1,130** |

At 20 hours/week engineering, Phases 1–2 are roughly **4–6 months**; the full scope is roughly **12–18 months** depending on sponsorship, capture cadence, and content volume.

---

## 8. Infrastructure and operations

### 8.1 AWS resources (estimated monthly, modest traffic)

| Service | Purpose |
|---------|---------|
| S3 | Splats, images, audio, video |
| CloudFront (×2) | Viewer and admin static apps + media CDN |
| API Gateway + Lambda | REST API |
| DynamoDB | Content records (on-demand billing) |
| Cognito | Steward authentication |
| Route 53 (optional) | Custom domain |

**Cost drivers:** splat and video storage, CloudFront egress. Budget **$50–200/month** for early public launch; scale with traffic and media volume.

### 8.2 Environments

| Environment | Use |
|-------------|-----|
| `dev` | Local Vite + optional local API proxy |
| `staging` | Steward QA, capture preview |
| `production` | Public viewer |

### 8.3 Backup and preservation

- S3 versioning enabled on assets bucket
- DynamoDB point-in-time recovery
- **Cold archive:** annual export of all captures + metadata to a preservation bucket (proposal aligns with long-term community memory goals)
- Document splat source files and capture raw imagery offline in steward custody

### 8.4 Security

- No long-lived AWS keys in the browser (address known auth debt via backend signing or Cognito Identity Pool)
- Presigned uploads with type and size limits
- Cognito groups: `steward`, `admin`
- Contributor PII (email) stored minimally; not displayed publicly without consent
- HTTPS everywhere; CORS restricted to known origins

---

## 9. Accessibility

| Requirement | Approach |
|-------------|----------|
| Keyboard navigation | Focusable UI panels; skip-to-content for non-3D fallback |
| Screen readers | Text alternatives for hotspot content; transcripts for audio |
| Reduced motion | Option to disable fly controls; static camera presets per zone |
| Low bandwidth | Quality preset (existing ScreenSpace low/medium/high) |
| Non-WebGL fallback | Map + list view of hotspots with media (degraded but readable) |

---

## 10. Risks and mitigations

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

## 11. Dependencies

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

## 12. Suggested milestone schedule (2026–2027)

| Date | Milestone |
|------|-----------|
| **Jun 2026** | Platform fork live in staging; first ground capture during compost prep |
| **Aug 2026** | Public MVP: single splat, 10+ text/image hotspots, compost zone started |
| **Oct 2026** | Second capture (post-rebuild); capture switcher; audio hotspots |
| **Jan 2027** | Contribution form + moderation; steward archive |
| **Spring 2027** | Timeline, 20+ oral histories, guided tour |
| **Summer 2027** | Public launch, replication docs, exhibition kit |

---

## 13. Success criteria (project-level)

1. **Preservation:** A high-fidelity navigable record of the 2026 garden exists and remains accessible after physical site change.
2. **Education:** Compost systems are documented so an external community could replicate the approach.
3. **Warm data:** Stories and oral histories are discoverable in context — attached to places, not buried in a folder.
4. **Participation:** Stewards author content without developers; community members can submit memories under moderation.
5. **Replication:** Technical documentation allows another garden to adopt the stack within a reasonable effort envelope.

---

## 14. Open decisions

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

## 15. Appendix A — Component reuse matrix

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

## 16. Appendix B — Compost content template (authoring)

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
