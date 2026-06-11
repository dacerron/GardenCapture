# PlayCanvas migration — phased plan

Phased transition from **`@mkkellogg/gaussian-splats-3d` + Three.js** to **PlayCanvas** for Virtual Soils splat rendering, with mobile performance and annotation UX as primary drivers.

**Prerequisites reading**

- [`PLAYCANVAS-SPLAT-EVALUATION.md`](./PLAYCANVAS-SPLAT-EVALUATION.md) — tradeoffs and scope
- [`PLAYCANVAS-PHASE-0-1-TODOS.md`](./PLAYCANVAS-PHASE-0-1-TODOS.md) — actionable checklist for Phase 0 & 1
- [`DECOUPLED-APPS.md`](./DECOUPLED-APPS.md) — viewer/admin split
- [`DEPLOY-S3-CLOUDFRONT.md`](./DEPLOY-S3-CLOUDFRONT.md) — deploy and assets CDN
- [`SPLAT-CACHING.md`](./SPLAT-CACHING.md) — cache headers on splat objects

**Target end state**

- Public **viewer** and admin **editor** render splats via **PlayCanvas Engine** (WebGPU with WebGL2 fallback).
- Runtime assets are **SOG** or **streamed LOD** on the assets CDN (`.ksplat` retired after cutover).
- **DynamoDB remains source of truth** for fields and markers; viewer consumes generated Experience Settings (or engine scripts) at runtime.
- `@mkkellogg/gaussian-splats-3d` and Three.js splat code removed from `packages/shared`.

---

## Overview

```text
Phase 0  Validate (benchmark + architecture choice)
   ↓
Phase 1  Asset pipeline (SOG / streamed LOD on CDN)
   ↓
Phase 2  Viewer POC (parallel route, embed or thin engine)
   ↓
Phase 3  Marker bridge (DynamoDB → annotations / hotspots)
   ↓
Phase 4  PlayCanvas Engine core (replace GaussianViewer + ThreeApp renderer)
   ↓
Phase 5  Viewer cutover (map inline, mobile UI, default route)
   ↓
Phase 6  Editor on PlayCanvas (admin marker authoring)
   ↓
Phase 7  Decommission Three.js splat stack
```

Phases 1–3 can overlap slightly. Phases 4–6 are sequential. **Do not skip Phase 0** — it gates spend on Phases 4–6.

---

## URL stability (external integrations)

**Do not change viewer or asset URLs/domains casually.** External systems (e.g. a class site) embed stable links:

| Link type | Stable form | Notes |
|-----------|-------------|--------|
| Viewer per field | `https://{viewer_domain}/viewer/?m={FieldID}` | `FieldID` must not change; `/?m=` redirects to `/viewer/?m=` |
| Legacy splat asset | DynamoDB `File` → assets CDN URL | Keep path and hostname until Phase 7 cutover |
| PlayCanvas LOD (new) | DynamoDB `FilePlayCanvas` → `splats/lod/{basename}/lod-meta.json` | Additive; must not break `File` |

**Rules for migration work**

1. **Never** overwrite or delete production `.ksplat` / `.splat` at existing `File` URLs when uploading LOD bundles.
2. **Never** change viewer CloudFront domain or `/viewer/?m=` route shape without notifying embed partners.
3. **`FilePlayCanvas` is additive** until Phase 5+ default viewer cutover; legacy `/viewer/` keeps using `File`.
4. Phase 7 (`File` → PlayCanvas URL) requires **explicit coordination** with anyone embedding viewer or direct asset URLs.

---

| Phase | Duration (estimate) | Primary owner |
|-------|---------------------|---------------|
| 0 — Validate | 3–5 days | Dev + stakeholder |
| 1 — Asset pipeline | 1–2 weeks | Dev + content ops |
| 2 — Viewer POC | 1–2 weeks | Dev |
| 3 — Marker bridge | 1 week | Dev |
| 4 — Engine core | 2–3 weeks | Dev |
| 5 — Viewer cutover | 1–2 weeks | Dev + QA |
| 6 — Editor migration | 2–3 weeks | Dev |
| 7 — Cleanup | 3–5 days | Dev |

**Total:** roughly **10–14 weeks** with one experienced developer, assuming Phase 0 passes. Add buffer for mobile QA and content re-export.

---

## Phase 0 — Validate and choose integration depth

**Goal:** Confirm mobile performance gain on **your** scenes and pick **embed vs engine** before rewriting `ThreeApp`.

### Tasks

1. Select **2–3 representative fields** (small, medium, large splat counts) from production DynamoDB.
2. Install [`@playcanvas/splat-transform`](https://github.com/playcanvas/splat-transform):
   ```bash
   npm install -g @playcanvas/splat-transform
   ```
3. Convert each test asset:
   ```bash
   splat-transform input.ksplat output.sog
   # For large scenes, also export streamed LOD (folder + lod-meta.json)
   ```
4. Host converted files on **assets CDN** (dev prefix, e.g. `/splats-pc/…`).
5. Side-by-side test on **target devices** (iPhone + mid-range Android + desktop):
   - Current: `/viewer/?m={FieldID}` (`.ksplat`)
   - POC: static SuperSplat viewer page or minimal `@playcanvas/supersplat-viewer` embed pointing at SOG/streamed URL
6. Record: time-to-interactive, FPS (or subjective smoothness), memory, network bytes.

### Exit criteria (go / no-go)

| Criterion | Go |
|-----------|-----|
| Mobile FPS or time-to-interactive | **≥30% improvement** on at least 2/3 test scenes, or stakeholder accepts smaller gain |
| Visual quality | No unacceptable loss vs `.ksplat` after SOG conversion |
| WebGPU fallback | Acceptable experience on WebGL2-only device in your audience |

### Decision output

Choose one path for Phases 2–6:

| Path | When to choose |
|------|----------------|
| **A — Engine-first** (recommended if Editor stays in-house) | Need admin Editor, custom icons, Leaflet inline viewer, full UI control |
| **B — Embed-first, engine later** | Fastest public viewer win; defer Editor; accept temporary dual stack |

Document choice in a short ADR or ticket. Default recommendation for Virtual Soils: **Path A (Engine-first)** after a **2-day SuperSplat embed spike** in Phase 2 to validate assets only.

### Deliverables

- Benchmark spreadsheet (device × scene × stack)
- Go/no-go note
- Path A or B decision

---

## Phase 1 — Asset pipeline and data model

**Goal:** Produce and serve PlayCanvas-ready assets without breaking the current viewer.

### 1.1 Conversion workflow

- Add a documented conversion script (repo `scripts/splat/` or lab repo job):
  - Input: `.ksplat` (or source `.ply` if available)
  - Output: `.sog` for small scenes; **streamed LOD bundle** (`lod-meta.json` + chunks) for scenes above a splat threshold (e.g. 2M+)
- Run batch conversion for all production `File` URLs; store under a **new CDN prefix** (keep existing `.ksplat` until Phase 7):
  ```text
  /splats/legacy/…ksplat     ← current
  /splats/sog/…sog           ← new
  /splats/lod/{fieldId}/     ← streamed LOD manifest + chunks
  ```

### 1.2 DynamoDB / API schema extension

Extend field records (non-breaking):

| Field | Purpose |
|-------|---------|
| `File` | Keep existing `.ksplat` URL until cutover |
| `FilePlayCanvas` | SOG or streamed LOD manifest URL |
| `FileFormat` | `ksplat` \| `sog` \| `streamed-lod` |

Alternatively, derive `FilePlayCanvas` at API layer from `FieldID` convention if URLs are deterministic.

Lambda: public `/pins` and `/fields` should expose the PlayCanvas URL (or both URLs during transition).

### 1.3 CDN and caching

- Apply same `Cache-Control: public, max-age=31536000, immutable` to SOG and LOD chunks (see [`SPLAT-CACHING.md`](./SPLAT-CACHING.md)).
- Confirm CORS on assets CloudFront still allows viewer + admin origins.
- Streamed LOD: many small chunk files — verify CloudFront hit ratio and invalidation strategy when a scene is re-exported.

### 1.4 Upload process (admin / content ops)

Define how **new** sites get PlayCanvas assets:

1. Upload source (`.ply` or `.ksplat`) to staging prefix.
2. CI or local script runs `splat-transform` → SOG or streamed LOD.
3. Write final URLs to DynamoDB `FilePlayCanvas`.
4. (Optional) SuperSplat Studio pass for manual annotation polish — **not** required if Editor remains source of truth.

### Exit criteria

- All production fields have `FilePlayCanvas` populated and load in SuperSplat viewer POC.
- Conversion script is repeatable and documented.
- No regression to current `.ksplat` viewer.

### Deliverables

- `scripts/splat/README.md` (or lab repo equivalent)
- DynamoDB/API fields deployed
- CDN objects for all scenes

---

## Phase 2 — Viewer proof of concept (parallel route)

**Goal:** PlayCanvas viewing in the app **without** removing Three.js yet.

### Tasks

1. Add dependency: `@playcanvas/supersplat-viewer` **or** `@playcanvas/engine` (per Phase 0 decision).
2. New viewer route, feature-flagged:
   ```text
   /viewer-pc/?m={FieldID}
   ```
   or query flag: `/viewer/?m={FieldID}&renderer=playcanvas`
3. Load field from public API → resolve `FilePlayCanvas` → pass to viewer (`content` + generated `settings.json`).
4. Minimal chrome: back to map, loading poster, error state.
5. Internal QA on mobile + desktop.

### Path B (embed) specifics

- Host or bundle `@playcanvas/supersplat-viewer` static assets with viewer deploy.
- Generate per-field `settings.json` (cameras, background) — annotations empty until Phase 3.
- Iframe or full-page embed inside React route.

### Path A (engine spike) specifics

- New module `packages/playcanvas-viewer/` (or `packages/shared/src/playcanvas/`):
  - Initialize PlayCanvas `Application`, load GSplat asset from URL.
  - Orbit camera only; no markers yet.
- Proves engine fits Vite + React mount/unmount lifecycle.

### Exit criteria

- `/viewer-pc` loads all benchmark scenes from Phase 0.
- Performance matches or beats Phase 0 standalone tests.
- No impact on default `/viewer` route.

### Deliverables

- Feature-flagged POC route
- Short demo for stakeholders

---

## Phase 3 — Marker bridge (annotations)

**Goal:** Reproduce **viewer-side** marker behavior using PlayCanvas annotations or engine hotspots, sourced from DynamoDB.

### 3.1 Mapping schema

Virtual Soils marker (DynamoDB) → PlayCanvas Experience Settings `annotations[]`:

| DynamoDB / Editor | PlayCanvas annotation |
|-------------------|----------------------|
| `position` [x,y,z] | `position` |
| `label` / description | `title`, `text` |
| `viewPosition` + implied target | `camera` (position + target or quaternion) |
| `icon` | **Gap** — use default hotspot unless custom engine script |

Implement pure function:

```text
packages/shared/src/markers/toPlayCanvasAnnotations.ts
markersToExperienceSettings(field, markers, cameraDefaults) → SettingsV2
```

Generate at **runtime** (fetch field → build settings) or **build time** (static JSON per field in CDN) — runtime is easier for admin edits without republish.

### 3.2 Viewer UX parity

| Current (Three.js) | Target (PlayCanvas) |
|--------------------|---------------------|
| Click marker → fly camera | Annotation select → camera animation |
| Label overlay | Annotation title/body panel |
| Custom icon sprites | Default hotspot **or** engine `annotation.mjs` with icon URLs in `extras` |
| Multiple markers | Prev/Next tour (PlayCanvas built-in) — **product decision** |

Stakeholder choice: enable guided **prev/next** tour (PlayCanvas native) vs keep click-only UX.

### 3.3 API

Ensure `/fields/{id}` and `/pins` return marker arrays unchanged; viewer PlayCanvas path consumes same API.

### Exit criteria

- POC viewer shows markers for at least one field with correct positions and camera fly-to.
- Editing markers in admin + refresh viewer reflects changes (runtime generation).

### Deliverables

- `toPlayCanvasAnnotations` (or equivalent) + tests
- Markers working on `/viewer-pc`

---

## Phase 4 — PlayCanvas Engine core (replace renderer)

**Goal:** Replace `GaussianViewer` + Three.js splat rendering with PlayCanvas Engine while preserving app structure.

### 4.1 Package structure

```text
packages/
  shared/              types, utils, map helpers (Three.js removed from splat path)
  playcanvas-viewer/   NEW — PlayCanvasApp, camera, markers, loading UI port
```

Move or reimplement from `ThreeApp.ts`:

| Component | Action |
|-----------|--------|
| `GaussianViewer.ts` | **Remove** — use PlayCanvas GSplat |
| `ThreeApp.ts` | **Replace** with `PlayCanvasApp.ts` |
| `WorldMarkers.ts` | Port to engine `annotation.mjs` pattern or DOM overlay + `worldToScreen` |
| `ScreenSpace.ts` | **Keep DOM** — rewire callbacks to PlayCanvas camera |
| `FlyControls` / OrbitControls | PlayCanvas camera scripts or custom |
| `Skybox.ts`, `LoadingOverlay.ts` | Port or use engine skybox / UI |
| `Interaction.ts` | Reimplement picking against PlayCanvas camera |

### 4.2 Streamed LOD integration

- For `FileFormat: streamed-lod`, use engine streamed GSplat + global splat budget:
  - Mobile: ~1M splats
  - Desktop: ~3M+ splats
- Wire budget to existing Low/Medium/High perf presets in UI.

### 4.3 React integration

- `Viewer.tsx` and map inline viewer: instantiate `PlayCanvasApp` in `useEffect`, dispose on unmount.
- Guard against double-init on React Strict Mode.

### Exit criteria

- `/viewer-pc` uses `PlayCanvasApp` (not embed iframe).
- Feature parity with Phase 3 markers + orbit + mobile toolbar.
- Desktop and mobile QA pass on 3 scenes.

### Deliverables

- `packages/playcanvas-viewer` (or equivalent)
- `PlayCanvasApp` API mirroring key `ThreeApp` methods: `loadScene(url)`, `setWorldMarkers(...)`, `dispose()`

---

## Phase 5 — Viewer cutover

**Goal:** Make PlayCanvas the **default** public viewer; retire Three.js on viewer routes.

### Tasks

1. Switch default `/viewer/?m=` to PlayCanvas implementation.
2. Re-integrate **inline map viewer** on home `/` (Leaflet overlay) with `PlayCanvasApp`.
3. Remove feature flag; optional `?renderer=legacy` fallback for one release cycle.
4. Update [`DEPLOY-S3-CLOUDFRONT.md`](./DEPLOY-S3-CLOUDFRONT.md) smoke tests.
5. Mobile regression pass (toolbar, back button, place info card).
6. Monitor assets CDN: chunk load errors, 404 on LOD manifests.

### Exit criteria

- Production viewer CloudFront serves PlayCanvas-only viewer.
- Stakeholder sign-off on mobile experience.
- Legacy route deprecated (not removed until Phase 7).

### Deliverables

- Viewer deploy with PlayCanvas default
- Updated user-facing docs if any

---

## Phase 6 — Editor migration (admin app)

**Goal:** Admin `/editor` uses the same PlayCanvas stack as the viewer so marker placement matches rendered space.

### Tasks

1. Replace `Editor.tsx` use of `ThreeApp` with `PlayCanvasApp`.
2. Reimplement:
   - Scene picker (unchanged — API driven)
   - Place / edit / delete markers (raycast → world position)
   - Icon picker (4 PNG icons) via custom hotspots or DOM overlay
   - Save to DynamoDB via existing `updateField` / markers payload
3. Capture **view position** when placing marker (camera pose) — same as today.
4. QA: place marker in editor → verify in viewer without manual coordinate drift.

### Risk: coordinate systems

- Validate splat orientation (current code flips quaternion `[1,0,0,0]` for mkkellogg). Re-verify after SOG export; add unit test with known marker position.

### Exit criteria

- Full admin workflow on PlayCanvas: login → edit field → open editor → place markers → save → view on public viewer.
- No dependency on Three.js in admin build.

### Deliverables

- Migrated `Editor.tsx`
- Editor QA checklist completed

---

## Phase 7 — Decommission and cleanup

**Goal:** Remove legacy stack and dual asset URLs.

### Tasks

1. Remove `@mkkellogg/gaussian-splats-3d`, Three.js splat modules, `gaussian-splats-3d.d.ts`.
2. Remove `GaussianViewer.ts`, legacy `ThreeApp.ts`, unused Three examples imports.
3. Drop `?renderer=legacy` and `/viewer-pc` alias routes.
4. DynamoDB: migrate `File` to PlayCanvas URL; remove `FilePlayCanvas` / `FileFormat` or collapse to single `File`.
5. Archive or delete `.ksplat` objects on S3 (after backup); update [`SPLAT-CACHING.md`](./SPLAT-CACHING.md).
6. Update README, [`PROJECT.md`](./PROJECT.md), [`PLAYCANVAS-SPLAT-EVALUATION.md`](./PLAYCANVAS-SPLAT-EVALUATION.md) status.
7. Trim `three` dependency if only used for splats (keep if still needed elsewhere).

### Exit criteria

- No mkkellogg / Three.js splat code in repo.
- Single asset format on CDN.
- CI green; production smoke test pass.

---

## Parallel operation and rollback

During Phases 2–5, run **dual renderer** briefly:

| Layer | Legacy | New |
|-------|--------|-----|
| Assets | `.ksplat` | SOG / streamed LOD |
| Viewer route | Three.js default | PlayCanvas via flag |
| Editor | Three.js until Phase 6 | — |

**Rollback:** Revert viewer deploy to previous build; DynamoDB still has `.ksplat` URLs until Phase 7. Do not delete `.ksplat` until Phase 5 is stable for **≥2 weeks**.

---

## Testing matrix (recurring)

| Area | Desktop Chrome | iPhone Safari | Android Chrome |
|------|----------------|---------------|----------------|
| Load scene (SOG) | ✓ | ✓ | ✓ |
| Load scene (streamed LOD) | ✓ | ✓ | ✓ |
| Orbit / pan / zoom | ✓ | ✓ | ✓ |
| Marker click + camera fly | ✓ | ✓ | ✓ |
| Map inline viewer | ✓ | ✓ | ✓ |
| Editor place/save marker | ✓ | optional | optional |
| Offline / slow 3G | — | ✓ | ✓ |

---

## Infrastructure touchpoints

| System | Phase | Change |
|--------|-------|--------|
| Assets S3 / CloudFront | 1, 7 | New prefixes; optional larger cache footprint for LOD chunks |
| DynamoDB / Lambda | 1, 7 | New URL fields; pins payload |
| Viewer/admin deploy | 2, 5, 6 | Bundle size change (PlayCanvas engine) |
| Terraform | 1 | Usually none; same assets bucket |
| CI | 1 | Optional job: `splat-transform` on upload |

No Cognito or API Gateway changes required for the renderer swap.

---

## Open product decisions (resolve before Phase 3)

1. **Guided tour UI** — Enable PlayCanvas prev/next annotation navigator or keep click-only markers?
2. **Custom marker icons** — Invest in engine hotspot icons vs standard annotation dots?
3. **SuperSplat Studio** — Use for optional content polish, or stay 100% in admin Editor?
4. **Fly mode** — Keep on desktop (currently disabled on mobile) or standardize on orbit only?
5. **Skybox** — Port HDR skybox or use PlayCanvas defaults / none?

---

## Success metrics

| Metric | Target (post Phase 5) |
|--------|------------------------|
| Mobile FPS (representative scene) | ≥1.3× vs baseline, or stable 30+ fps |
| Time to first interactive frame | ≥25% reduction on 4G |
| Marker authoring regression | Zero coordinate mismatches editor → viewer |
| Bundle size | Document delta; accept temporary increase if mobile UX wins |
| Content ops | New site publish includes SOG/LOD in &lt;30 min manual/scripted |

---

## Related links

- [PlayCanvas — Performance](https://developer.playcanvas.com/user-manual/gaussian-splatting/building/performance/)
- [PlayCanvas — LOD streaming](https://developer.playcanvas.com/user-manual/gaussian-splatting/building/unified-rendering/lod-streaming/)
- [PlayCanvas — Embedding SuperSplat Viewer](https://developer.playcanvas.com/user-manual/supersplat/viewer/embedding/)
- [PlayCanvas — Annotations](https://developer.playcanvas.com/user-manual/supersplat/studio/annotations/)
- [splat-transform](https://github.com/playcanvas/splat-transform)
