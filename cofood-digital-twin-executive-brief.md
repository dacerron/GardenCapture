# coFood Garden Digital Twin — Executive Brief

**Prepared for:** Sponsors, partners, and leadership  
**Site:** coFood Collaborative Garden, 265 East 4th Ave, Vancouver  
**Status:** Draft  

**Implementation plan:** [`cofood-digital-twin-implementation-plan.md`](./cofood-digital-twin-implementation-plan.md) (Phases 1–4 detail)  
**Near-term student window:** [`docs/cofood-scope.md`](./docs/cofood-scope.md)

---

## The opportunity

The coFood Collaborative Garden is a community stewardship site with deep ecological, cultural, and relational value — and an uncertain future. **2026 is the last guaranteed growing season** before likely redevelopment.

This project creates a **living digital twin**: an immersive, web-based walkthrough of the garden where visitors click on places to hear stories, learn compost practices, and access community memory. It preserves not just how the garden looks, but **what it means** — the warm data of stewardship, experimentation, and care.

---

## What we will deliver

| Phase | Focus | Key outputs |
|-------|--------|-------------|
| **1 — Capture** | Preserve the site in 3D | High-quality spatial scan; web viewer anyone can open in a browser |
| **2 — Interactive layer** | Make it educational | Clickable hotspots with photos, audio, and compost documentation |
| **3 — Living archive** | Gather community memory | Oral histories, steward archive, moderated public contributions |
| **4 — Share & replicate** | Extend impact beyond coFood | Public launch, educational exports, playbook for other gardens |

**Near-term priority (2026):** Complete Phase 1 and a usable Phase 2 in time to document the **compost infrastructure transformation** already underway — not only the finished site, but the process of change.

**First capture event:** **21 July 2026** — on-site images and video at the garden (detail in [`docs/cofood-scope.md`](./docs/cofood-scope.md)).

---

## Why this approach is efficient

We are **building on this coFood codebase** — a forked monorepo that already supports 3D garden/site viewing, clickable location markers, and steward editing tools. Roughly half the core viewer infrastructure exists.

**New investment** goes toward garden-specific branding, multimedia storytelling, community submissions, and seasonal re-captures — not reinventing 3D web technology. New AWS hosting, buckets, and CDN URLs must be provisioned for this project (nothing from the previous fork’s production assets is wired in).

---

## Who it serves

- **Garden stewards and volunteers** — a semi-private archive of stories, lessons, and media  
- **Public audiences** — an accessible showcase of collaborative food systems and compost education  
- **Educators and partners** — replicable documentation for community composting across the region  
- **People who cannot visit** — remote, asynchronous access to a site with physical mobility constraints  

---

## Work required (summary)

### Capture & platform (Phase 1)
- On-site photography and video (**21 July 2026** event) and 3D processing of the garden  
- Cloud hosting and a public web experience  
- First navigable digital twin online  

### Content & interactivity (Phase 2)
- Place stories and educational material at specific locations in the 3D scene  
- Multimedia support (images, audio, video)  
- Compost system documentation aligned with the 2026 rebuild  
- Second capture after compost work completes  

### Community archive (Phase 3)
- Collect and curate oral histories and volunteer submissions  
- Steward review workflow before public publication  
- Timeline of seasonal and project milestones  

### Launch & replication (Phase 4)
- Public showcase and outreach materials  
- Documentation so other community gardens can adopt the model  

---

## Resources & timeline

| | Estimate |
|---|----------|
| **Total effort** | ~770–1,130 hours (technical + content + capture) |
| **Duration** | ~12–18 months for full scope; **public MVP target: fall 2026** |
| **Team** | Part-time technical lead, EML students (**≤30 hours each**), steward/content leads |
| **Hosting** | ~$50–200/month initially (scales with traffic and media) |

Phases 1–2 (~460–660 hours) deliver the highest-value preservation and education outcomes and should be prioritized if budget is constrained.

---

## What sponsorship enables

- **Timely capture** before the site changes or closes  
- **Steward capacity** to gather warm data while memories are fresh  
- **Stable hosting** so the archive outlasts any single volunteer or grant cycle  
- **A replicable model** for preserving grassroots resilience infrastructure elsewhere  

---

## Risks

| Risk | Mitigation |
|------|------------|
| Site lost before capture | Prioritize Phase 1 capture in summer 2026 |
| Project too ambitious for one season | Launch incrementally; full archive can grow over time |
| Sensitive community stories | Consent process and steward moderation before publication |
| Platform dependency on one technologist | Documentation and open components in Phase 4 |

---

## Decisions needed from leadership

1. **Budget and timeline** — full four phases vs. Phase 1–2 MVP for 2026  
2. **Hosting ownership** — LSN, sponsor, or partner institution  
3. **Public vs. steward-only content** — policy for what appears in the open archive  
4. **Capture cadence** — single hero scan vs. seasonal updates through 2026–2027  

---

## Success looks like

1. A navigable record of the 2026 garden survives beyond the physical site  
2. Compost education content helps other communities replicate the model  
3. Stories are discoverable **in place** — tied to the bed, pile, or path they describe  
4. Stewards can grow the archive without ongoing developer support  

---

*For technical detail, see [cofood-digital-twin-technical-scope.md](./cofood-digital-twin-technical-scope.md).*
