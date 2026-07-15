# coFood Scope Document — Near-term delivery window

## Project context

**Project:** coFood Collaborative Garden digital twin (web-based 3D garden / landscape explorer)

This document scopes the **near-term delivery window** (~next 4 months) for EML students and available lead time. It is **not** the full product roadmap.

| Doc | Role |
|-----|------|
| [`../cofood-digital-twin-implementation-plan.md`](../cofood-digital-twin-implementation-plan.md) | Authoritative product phases (1 Capture → 2 Interactive → 3 Archive → 4 Share), effort, milestones |
| [`../cofood-digital-twin-technical-scope.md`](../cofood-digital-twin-technical-scope.md) | Architecture, data model, infra |
| [`../cofood-digital-twin-executive-brief.md`](../cofood-digital-twin-executive-brief.md) | Sponsor summary |

The current product foundation (viewer, editor, admin) is in place. This window focuses on **garden spatial capture**, **core user experience**, **foundational content**, and **mobile usability** inside **implementation Phase 1** and **early Phase 2**.

---

## Fixed milestone: capture event — 21 July 2026

**On-site image and video capture** at the coFood Collaborative Garden is planned for **Tuesday, 21 July 2026**.

| Item | Detail |
|------|--------|
| **Date** | 21 July 2026 |
| **Goal** | Collect ground imagery and video sufficient to produce the first web-ready Gaussian splat (and supporting B-roll / stills for hotspots) |
| **Primary owner** | Capture lead / project lead (not charged entirely to the student 30-hour cap) |
| **Student role (optional slices ≤30 h total)** | Shot-list prep, coverage checklist, on-site assist if available, asset ingest/catalog, QA of processed output in the viewer |

W1 of this window must prioritize **prep for 21 July**. Processing the splat and getting it into the public viewer continues immediately after the event (lead + process pipeline).

### Pre-event checklist (before 21 July)

- [ ] Shot list: paths, beds, compost zones, structures, gathering areas; overlap for photogrammetry / splat
- [ ] Video plan: slow walkthroughs + any orbit / elevation where safe
- [ ] Permissions: garden access, drone (if any) insurance/rules — confirm before the day
- [ ] Weather / backup date rule agreed with stewards
- [ ] Storage: naming convention + offline backup for raw media
- [ ] Capture metadata template (date, weather, season notes, compost rebuild status)

### Post-event checklist (after 21 July)

- [ ] Raw media backed up in steward / project custody
- [ ] Splat train/export + quality vs. size iteration
- [ ] Register capture in admin / DynamoDB; publish to staging then public viewer
- [ ] Capture date/label visible in UI; first-run viewer help for new visitors
- [ ] Pull stills/clips from the day for orientation hotspots (early Phase 2 content)

---

## Team capacity and planning assumptions

- **EML student contribution (per student):** **30 hours total** for the full project — not a weekly allotment. Scope work for each student accordingly; do not plan multi-week full-time student effort.
- **Project lead / capture lead:** owns capture day ops, splat processing, and infra beyond the student 30-hour cap
- **Calendar window:** ~4 months (~16 weeks), with student work paced within each individual's 30-hour limit

Hour ranges in the implementation plan (hundreds of hours per product phase) are **team/total** effort. They must not be read as per-student budgets. Features that would require more than ~30 hours of student time must be owned by project lead / other capacity, or deferred.

---

## Mapping to the implementation plan

| Product phase ([implementation plan](../cofood-digital-twin-implementation-plan.md)) | What this near-term window advances |
|-------------------------------------------------------------------------------------|-------------------------------------|
| **Phase 1 — Spatial capture** | **21 July capture event**, splat processing, first public/staging viewer with that capture, UX / first-run help, About/context, mobile smoke |
| **Phase 2 — Interactive layer (early only)** | Starter marker content packs (using July stills/clips), content template, responsive panels/controls, feedback loops |
| **Phase 3–4** | **Out of this window** (contribution portal, oral-history platform, replication packaging) |

---

## Scope goals (this window)

1. **Complete first garden spatial capture**
   - Execute the **21 July 2026** image/video capture event.
   - Process a web-optimized splat and load it in the coFood viewer (staging → public when ready).

2. **Strengthen the core user flow**
   - Improve the path from discovery → opening a 3D scene → understanding what to do next.
   - Reduce friction in navigation and orientation (especially for first-time users).

3. **Create foundational project content**
   - Produce an initial curated content pack (site descriptions, marker narratives, supporting text/media from capture day).
   - Define a repeatable content template so additional hotspots can be authored consistently.

4. **Use content work to drive feedback and iteration**
   - Treat each content release as a usability test opportunity.
   - Collect feedback on clarity, flow, and learning value; iterate quickly on both content and UI.

5. **Implement responsive styling for mobile use**
   - Ensure key flows work on phones and tablets (scene launch, in-viewer controls, basic reading/navigation).
   - Improve touch targets, layout behavior, and readability at small breakpoints.

---

## In scope

- On-site **image and video** capture event (**21 July 2026**) and follow-on splat processing / viewer publish.
- UX refinement of current app surfaces (viewer flow, content presentation, first-run help).
- Initial content pack creation (text, markers, scene-level context) for the July capture.
- Lightweight feedback loop process (scheduled review rounds and issue tracking from user testing).
- Responsive CSS/layout improvements across key pages and controls.
- Cross-device QA for modern mobile browsers.

## Out of scope (this window)

- Large net-new platform features (contribution form, moderation queue, capture switcher at full fidelity, search, exhibition mode).
- Full redesign of backend architecture / data model migration to `Site` + `Capture` + rich `Hotspot` (lead-owned; later Phase 2).
- Second seasonal capture / full pre–post compost switcher (may be planned later in 2026; not required for this window’s exit).
- Implementation Phases 3–4 deliverables.

---

## Delivery approach

### Track D: Garden capture (Phase 1 — priority)

- Prepare shot list, permissions, and backup plan before **21 July 2026**.
- Run the capture event (images + video); ingest and back up raw media the same day.
- Process splat; publish first navigation-ready capture into staging/public viewer.
- Record capture metadata (date, conditions, garden state) for the living archive.

### Track A: Product and UX iteration

- Baseline the current user journey and identify top friction points (especially first load of the new splat).
- Ship small, testable UX updates in short cycles sized for the student hour cap.
- Validate each cycle with quick stakeholder or learner feedback.

### Track B: Content production

- Create a minimum viable content set for the July garden capture (orientation markers first; reuse stills from the event).
- Standardize content structure (title, objective/context, marker narrative, takeaway) — aligns with the compost/hotspot template in the technical scope appendix.
- Pair content QA with product QA so content and interface evolve together.

### Track C: Mobile responsiveness

- Define target breakpoints and mobile interaction expectations.
- Implement responsive layout and control adjustments.
- Run browser/device checks (including loading the new splat) and fix high-impact defects early.

---

## Suggested iteration windows (4 months)

These are **calendar slices for the near-term window**, not product Phases 1–4. Product phase names live only in the [implementation plan](../cofood-digital-twin-implementation-plan.md).

| Window | Weeks / dates | Focus | Implementation-plan target |
|--------|---------------|------|----------------------------|
| **W1: Capture prep + baseline** | Through **21 July 2026** | Shot list, permissions, equipment, weather backup; confirm viewer readiness to host the first splat; content template + acceptance criteria. | Phase 1 capture readiness |
| **W1b: Capture day** | **21 July 2026** | On-site images + video; same-day backup and catalog. | Phase 1 capture production |
| **W2: Process + first public splat** | Weeks after 21 July (~3–6 of window) | Splat process/QA, publish to viewer, highest-priority UX/first-run help, first feedback round with real garden scene. | Phase 1 MVP viewer |
| **W3: Expand content + stabilize** | Mid window | Orientation/compost starter markers from July media; flow improvements; major responsive updates. | Early Phase 2 |
| **W4: Polish and readiness** | Late window | Hardening, mobile QA on the July capture, accessibility/usability polish, documentation, handoff summary. | Phase 1 / early Phase 2 exit |

---

## Feedback and iteration model

- Run recurring feedback checkpoints (for example, biweekly) — start once the July splat is viewable.
- Capture issues in four buckets: **capture quality**, **content clarity**, **flow friction**, **mobile usability**.
- Prioritize fixes by learner impact and implementation effort **within the 30-hour student cap**.
- Keep iteration loops short so each student can ship, test, and learn within their total hours.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Weather or access fails on 21 July | Agree backup date/window with stewards before the event; still complete shot-list + kit prep. |
| Capture coverage gaps block splat quality | Use pre-event shot list with overlap; review coverage on-site before leaving. |
| Splat processing slips past useful feedback | Lead owns processing queue; students can QA in viewer and advance UX/content in parallel. |
| Content creation lags behind engineering work | Timebox content production; treat content as a sprint deliverable. |
| UX feedback is gathered but not actioned | Maintain a simple prioritized backlog with explicit owner. |
| Mobile support becomes a late-stage scramble | Start responsive work in W2, not only W4. |
| Scope expands beyond student hours | Enforce must-have vs stretch; anything > ~30h student time → lead or defer to later product phase. |
| Confusion with product “Phase 1–4” naming | Use **W1–W4** here; reserve **Phase 1–4** for the implementation plan. |

---

## Deliverables checklist

- [ ] **21 July 2026** capture event completed (images + video) with raw media backed up  
- [ ] Web-optimized splat of that capture loaded in staging (then public) viewer  
- [ ] Capture metadata (date, label) visible in the UI  
- [ ] Updated backlog for this window, tagged to implementation Phase 1 / early Phase 2  
- [ ] Initial content pack integrated into the app (orientation set for the July capture)  
- [ ] Documented feedback process and iteration log  
- [ ] Responsive styles implemented for key user flows  
- [ ] Mobile QA pass notes and resolved critical issues  
- [ ] End-of-window summary with next-step recommendations toward remaining Phase 2 work  

---

## Success criteria

- Garden spatial capture from **21 July 2026** exists as a navigable splat in the coFood viewer.
- Users can complete the core discovery → viewer → content journey with less confusion.
- The project has a usable starter content set (drawn from capture-day media where possible).
- Feedback is regularly collected and reflected in visible product/content improvements.
- The app is functionally usable and readable on common mobile screen sizes.
- Each participating EML student stays within the **30-hour** total contribution cap.
