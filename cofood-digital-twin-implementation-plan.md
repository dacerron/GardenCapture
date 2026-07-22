# coFood Digital Twin — Implementation Plan

**Project:** coFood Collaborative Garden digital twin & living archive  
**Status:** Draft  
**Companion docs:**

| Doc | Role |
|-----|------|
| [`cofood-digital-twin-technical-scope.md`](./cofood-digital-twin-technical-scope.md) | Architecture, data model, infra, risks |
| [`cofood-digital-twin-executive-brief.md`](./cofood-digital-twin-executive-brief.md) | Sponsor summary of the same four product phases |
| [`docs/cofood-scope.md`](./docs/cofood-scope.md) | Near-term EML student delivery window (maps into Phase 1 / early Phase 2 below) |

This file owns the **product phases**, effort ranges, and milestone schedule. Phase numbers here match the executive brief (**1 Capture → 2 Interactive → 3 Archive → 4 Share**). Do not reuse these phase numbers for short student sprints — see [`docs/cofood-scope.md`](./docs/cofood-scope.md) for iteration windows.

---

## Capacity assumptions

| Role | Budget |
|------|--------|
| **EML student (each)** | **30 hours total** for the whole project (not per week). Prefer self-contained tasks under that cap. |
| **Technical lead** | Part-time; owns infra, architecture, and work beyond student caps |
| **Content / stewards** | Capture, copy, media, oral histories (outside engineering hour counts when noted) |

Hour ranges in this plan are **full project effort** (lead + students + content). They are **not** EML-student-only budgets. Anything larger than ~30 hours must be lead-owned, steward-owned, or split across multiple people.

---

## How the near-term window maps here

[`docs/cofood-scope.md`](./docs/cofood-scope.md) covers roughly the **next 4 months** of capture + EML student + lead work. That window contributes to:

| Implementation phase | What the near-term window advances |
|----------------------|-------------------------------------|
| **Phase 1** | **Capture event 21 July 2026** (images + video), splat processing, first viewer publish, UX / first-run help, About/context, mobile smoke |
| **Phase 2 (early)** | Starter marker/hotspot content packs (including stills from July), responsive UI of panels/controls, feedback loops — not full multimedia/API rebuild |

**Fixed date:** on-site garden capture is scheduled for **Tuesday, 21 July 2026**. Detail and checklists live in [`docs/cofood-scope.md`](./docs/cofood-scope.md).

Out of the near-term student window (defer to lead / later phases): net-new contribution portal, moderation queue, capture switcher at full fidelity, oral-history platform, replication packaging.

---

## Phase 1 — Spatial capture

**Timeline:** Q2–Q3 2026 (parallel with compost site transformation)  
**First capture event:** **21 July 2026** (images + video)

**Objective:** Produce a web-optimized Gaussian splat of the garden and stand up hosting for the first public viewer.

### 1.1 Capture production (non-code)

**First capture event:** **21 July 2026** — on-site images and video at the coFood Collaborative Garden (see near-term window checklists).

| Task | Detail |
|------|--------|
| Ground photography | Multi-angle coverage of paths, beds, compost zones, structures (primary output of 21 July) |
| Ground video | Walkthrough / B-roll for splat support and hotspot media |
| Drone imagery | Site context and canopy where permitted and safe (optional if cleared for the event) |
| Splat processing | Train/export Gaussian splat after 21 July; iterate on quality vs. file size |
| Coordinate alignment | Consistent origin so hotspots remain meaningful within a capture |
| Metadata | Capture date (21 July 2026), weather/season notes, changelog for compost rebuild |

**Target splat specs (initial):**

- Format compatible with `@mkkellogg/gaussian-splats-3d` (`.ksplat` or `.ply`) and/or PlayCanvas streamed LOD already in this repo
- Web-optimized build: progressive loading or compressed variant where supported
- Initial budget: ≤ 150 MB per capture (tune based on QA); quality presets in viewer for low-end mobile

### 1.2 Engineering deliverables

| Deliverable | Description |
|-------------|-------------|
| Platform baseline | coFood-branded viewer + admin (this repo) on new AWS infra |
| Infrastructure | S3 assets bucket, viewer CloudFront, API stub, DynamoDB tables |
| Capture upload pipeline | Steward uploads splat to S3; admin registers `Capture` record |
| MVP viewer | Load single capture, fly navigation, loading overlay, mobile smoke test |
| About / context page | Garden overview, accessibility statement, credits |

### 1.3 Acceptance criteria

- [ ] A steward can upload a splat and open it in the public viewer via URL
- [ ] Viewer loads on desktop Chrome, Safari, Firefox and one mid-range mobile device
- [ ] Fly controls documented for first-time visitors (on-screen help)
- [ ] Capture metadata (date, label) visible in the UI

### 1.4 Estimated effort

| Area | Hours (order of magnitude) |
|------|---------------------------|
| Capture production (photo, process, QA) | 80–120 |
| Platform fork + infra setup | 60–80 |
| MVP viewer integration | 40–60 |
| **Phase 1 total** | **180–260** |

---

## Phase 2 — Interactive layer

**Timeline:** Q3–Q4 2026

**Objective:** Hotspots with multimedia, compost education content, and steward authoring workflows.

### 2.1 Engineering deliverables

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

### 2.2 Content deliverables (parallel track)

| Content pack | Hotspots (approx.) |
|--------------|-------------------|
| Garden orientation | 5–8 (welcome, paths, gathering areas) |
| Compost systems | 8–12 (one per method + workflow/maintenance) |
| Growing areas | 6–10 (beds, perennials, notable plants) |
| Structures & tools | 4–6 (shed, water, signage) |
| Events & programs | 4–6 (Music in the Garden, workshops) |

Content production includes copy, photos, diagrams, and at least **3–5 short audio clips** (oral history pilots).

### 2.3 API changes

- `GET /captures/:id/hotspots` — public hotspots for a capture
- `POST /admin/api/hotspots` — CRUD with media references
- `POST /admin/api/media/upload-url` — presigned POST
- Extend editor: media picker, content type, tags, visibility toggle

### 2.4 Acceptance criteria

- [ ] Steward places hotspot in editor and attaches image + audio without developer help
- [ ] Public visitor clicks compost drum hotspot and sees diagram, maintenance steps, and optional audio
- [ ] At least two captures published with working capture switcher
- [ ] All public hotspot media served over HTTPS via CDN
- [ ] Panel usable on phone (readable text, playable audio)

### 2.5 Estimated effort

| Area | Hours |
|------|-------|
| Hotspot multimedia UI + API | 80–120 |
| Admin media upload + editor extensions | 60–80 |
| Capture switcher + tagging | 30–40 |
| Content authoring (curated packs) | 80–120 |
| QA + mobile pass | 30–40 |
| **Phase 2 total** | **280–400** |

---

## Phase 3 — Storytelling & living archive

**Timeline:** Q4 2026 – Q2 2027

**Objective:** Oral history collection, community submissions, steward moderation, and steward-only archive tier.

### 3.1 Engineering deliverables

| Deliverable | Priority | Description |
|-------------|----------|-------------|
| Contribution form | P0 | Public form: text, file upload, optional location note |
| Moderation queue | P0 | Admin list: approve → creates/links hotspot |
| Role-based visibility | P0 | `public` vs `stewards` hotspots and captures |
| Transcript field | P1 | Text alongside audio/video for accessibility |
| Timeline view | P1 | Chronological index of stories and captures |
| Oral history workflow | P1 | Batch import template; consent checkbox on submit |
| Search | P2 | Full-text search across hotspot titles and summaries |

### 3.2 Governance (non-code, required)

| Policy | Purpose |
|--------|---------|
| Media consent form | Permission to publish voices and likenesses |
| Moderation guidelines | What stewards approve for public vs. archive-only |
| Attribution standard | Contributor name on approved stories |
| Retention / takedown | Process for removal requests |

### 3.3 Acceptance criteria

- [ ] Contributor submits memory with photo; steward approves and it appears on the site
- [ ] Steward-only hotspot visible only when logged in
- [ ] At least 10 oral history clips published with transcripts
- [ ] Timeline page lists major 2026 garden events and captures

### 3.4 Estimated effort

| Area | Hours |
|------|-------|
| Contribution + moderation system | 80–100 |
| Visibility roles + archive UI | 40–60 |
| Timeline + search | 40–60 |
| Oral history intake + content | 60–100 |
| **Phase 3 total** | **220–320** |

---

## Phase 4 — Knowledge sharing & replication

**Timeline:** Q2–Q3 2027

**Objective:** Public launch, replication documentation, and open components for other community projects.

### 4.1 Engineering deliverables

| Deliverable | Description |
|-------------|-------------|
| Launch hardening | Performance, error monitoring, analytics (privacy-respecting) |
| Replication guide | How to fork, capture, host, and author content |
| Compost documentation export | Static PDF or microsite generated from hotspot content |
| Optional open-source release | Sanitized repo + `packages/shared` as reusable splat+hotspot library |
| Exhibition mode | Kiosk-friendly fullscreen + guided tour autoplay |

### 4.2 Acceptance criteria

- [ ] Public launch URL promoted with stable uptime
- [ ] Replication doc enables a technical partner to deploy a second site
- [ ] Compost education pack downloadable for Fraser Lowland partners
- [ ] Launch event demo: live guided tour on projector + mobile

### 4.3 Estimated effort

| Area | Hours |
|------|-------|
| Hardening + monitoring | 30–50 |
| Documentation + open-source prep | 40–60 |
| Exhibition mode + launch support | 20–40 |
| **Phase 4 total** | **90–150** |

---

## Consolidated effort summary

Assumes **1 technical lead (part-time)** + **EML students (≤30 hours each)** and/or contract developer + **content/steward team** for media.

| Phase | Engineering | Content / capture | Total (range) |
|-------|-------------|---------------------|---------------|
| 1 — Spatial capture | 100–140 | 80–120 | 180–260 |
| 2 — Interactive layer | 170–240 | 80–120 | 280–400 |
| 3 — Storytelling archive | 160–220 | 60–100 | 220–320 |
| 4 — Knowledge sharing | 90–150 | 20–40 | 90–150 |
| **Grand total** | **520–750** | **240–380** | **770–1,130** |

Phases 1–2 (~460–660 hours) deliver the highest-value preservation and education outcomes and should be prioritized if budget is constrained. Full scope is roughly **12–18 months** depending on sponsorship, capture cadence, and content volume. Calendar duration is **not** the same as EML student hours — students contribute small slices; lead and stewards carry the bulk.

---

## Suggested milestone schedule (2026–2027)

| Date | Milestone |
|------|-----------|
| **21 Jul 2026** | **Capture event:** on-site images + video at coFood garden; raw media backed up same day |
| **Late Jul – Aug 2026** | First splat processed and in staging/public viewer; first-run UX; starter orientation hotspots |
| **Aug – Sep 2026** | Public MVP hardening: mid-range mobile pass; 10+ text/image hotspots; compost zone content started |
| **Oct 2026** | Second capture (post-rebuild) if compost work warrants; capture switcher; audio hotspots |
| **Jan 2027** | Contribution form + moderation; steward archive |
| **Spring 2027** | Timeline, 20+ oral histories, guided tour |
| **Summer 2027** | Public launch, replication docs, exhibition kit |

---

## Near-term EML student tasks (examples under 30 hours)

Suitable slices pulled from Phase 1 / early Phase 2 (detail in [`docs/cofood-scope.md`](./docs/cofood-scope.md)):

- Pre–21 July shot-list / coverage checklist for the capture event
- On-site assist or same-day asset catalog (if available; counts toward the 30-hour cap)
- Post-capture viewer QA of the published splat
- First-run viewer help / orientation copy
- Responsive CSS pass on viewer chrome and hotspot panel
- Content template + 5–8 orientation markers using July stills
- Mobile QA checklist and defect log for core flow
- Feedback iteration log and prioritized backlog grooming

---

*Document version: 0.1 — extracted from technical scope; aligned with near-term EML capacity*
