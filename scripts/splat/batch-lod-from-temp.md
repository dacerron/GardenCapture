# `batch-lod-from-temp.ps1` — usage & prerequisites

Batch-converts every splat in repo [`temp/`](../../temp/) to **PlayCanvas streamed LOD** (`lod-meta.json` + chunk folders) and **ground collision voxels** (`collision.voxel.json` + `collision.voxel.bin`) using [`@playcanvas/splat-transform`](https://github.com/playcanvas/splat-transform).

**Script:** [`batch-lod-from-temp.ps1`](batch-lod-from-temp.ps1)  
**Broader conversion guide:** [`README.md`](README.md) (manual steps, single `.sog`, S3 upload)

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Windows PowerShell 5.1+** | Script is PowerShell; run from repo root. |
| **`@playcanvas/splat-transform`** | Global CLI on `PATH`. **v2.4+** required for voxel collision (`collision.voxel.json`). |
| **Disk space** | Roughly **3–5×** the size of each source file under `work/` (PLY intermediates + LOD output). |
| **GPU (optional)** | Speeds SOG/LOD compression; CPU-only works. List adapters: `splat-transform --list-gpus`. |
| **Source files in `temp/`** | Extensions: `.ksplat`, `.splat`, or `.ply`. |

### Install splat-transform

```powershell
npm install -g @playcanvas/splat-transform
splat-transform --version
```

### Get source splats into `temp/`

Download from S3 or copy local files. **Basename** of the file becomes the output folder name (e.g. `UBC_Farm_Agricultural.splat` → `work/out/UBC_Farm_Agricultural/`).

```powershell
aws s3 cp `
  s3://YOUR_ASSETS_BUCKET/splats/UBC_Farm_Agricultural.splat `
  temp/UBC_Farm_Agricultural.splat `
  --region ca-central-1
```

To process **one scene only**, put **only that file** in `temp/` (move or temporarily remove others).

---

## Expected usage

From **repo root**:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/splat/batch-lod-from-temp.ps1
```

**Check progress** (runtime, CPU, log tail, output folders):

```bash
bash scripts/splat/check-batch-progress.sh
bash scripts/splat/check-batch-progress.sh --watch      # refresh every 5s
bash scripts/splat/check-batch-progress.sh --watch 15   # refresh every 15s
```

### What the script does (per file)

1. **Import + PlayCanvas cleanup** → `work/lod/{basename}/lod0.ply`
   - `-r 180,0,0` by default (matches legacy `/viewer/` mkkellogg flip)
   - Strips invalid `-Infinity` log-scales (`scale_*_raw,gt,-100`)
   - If scene extent **> 200 m**, crops to a **±150 m** box (distant sky / outlier shell)
2. **Decimate** 50% per step until coarsest level ≤ ~**1.05M** Gaussians (max **3** steps) → `lod1.ply`, `lod2.ply`, …
3. **Bundle streamed LOD** → `work/out/{basename}/lod-meta.json` (+ `0_0/`, `1_0/`, … chunk folders)
4. **Collision prep** → `work/lod/{basename}/collision-src.ply`
   - Culls distant splats before voxelization (LOD crop stays wide at ±150 m)
   - Default filters: **cluster** at seed + **60 m sphere** at `SPLAT_COLLISION_SEED_POS`
5. **Voxel ground collision** (from `collision-src.ply`) → `collision.voxel.json` + `.voxel.bin`
   - Skipped when **post-prep** span exceeds **`SPLAT_COLLISION_MAX_EXTENT_M`** (default **120 m**)
   - Per-scene **timeout** via **`SPLAT_COLLISION_TIMEOUT_MIN`** (default **90 min**)
   - Auto-coarsens voxel size on medium scenes unless you set `SPLAT_VOXEL_PARAMS` explicitly
   - Used by the PlayCanvas viewer for camera ground clamp ([`packages/playcanvas-viewer`](../../packages/playcanvas-viewer/))

### Output layout

```text
work/
  batch-lod.log                          # run log (append)
  lod/{basename}/lod0.ply, lod1.ply, …   # intermediates (gitignored)
  lod/{basename}/collision-src.ply       # collision-only cull (gitignored)
  out/{basename}/lod-meta.json           # upload this folder
  out/{basename}/collision.voxel.json    # ground collider header
  out/{basename}/collision.voxel.bin     # ground collider octree data
  out/{basename}/0_0/, 1_0/, …
```

`temp/` and `work/` are in [`.gitignore`](../../.gitignore) — do not commit splat data.

---

## Environment overrides

Set before running (optional):

| Variable | Default | Purpose |
|----------|---------|---------|
| `SPLAT_ROTATION` | `180,0,0` | Euler degrees for `-r` (legacy viewer alignment). Use `none` to skip. |
| `SPLAT_POSITION_OUTLIER_M` | `200` | If any \|x/y/z\| exceeds this (meters), run position box crop. |
| `SPLAT_POSITION_BOX_HALF_M` | `150` | Half-size of symmetric crop box (meters). |
| `SPLAT_COLLISION` | *(on)* | Set to `skip` / `none` / `0` to skip `collision.voxel.json` generation. |
| `SPLAT_VOXEL_PARAMS` | `0.1,0.12` | Voxel size (m) and opacity threshold. **Smaller = slower** (avoid `0.05` on large scenes). |
| `SPLAT_VOXEL_FLOOR_FILL` | `1.6` | Floor-fill patch size (m) for exterior scenes. Use `none` to skip floor-fill. |
| `SPLAT_COLLISION_SEED_POS` | `0,0,0` | `--seed-pos` for voxel floor-fill (walkable point inside the scene). |
| `SPLAT_COLLISION_SOURCE` | `coarse` | `coarse` = coarsest decimated PLY (faster); `lod0` / `fine` = full resolution. |
| `SPLAT_COLLISION_MESH` | *(off)* | Set to `faces` or `smooth` to also write `collision.collision.glb`. |
| `SPLAT_COLLISION_STRICT` | *(off)* | Set to `1` to abort the batch if collision generation fails. |
| `SPLAT_COLLISION_MAX_EXTENT_M` | `120` | Skip voxel when **post-prep** largest-axis span (m) exceeds this. |
| `SPLAT_COLLISION_TIMEOUT_MIN` | `90` | Kill collision step after this many minutes per scene (`0` = no limit). |
| `SPLAT_COLLISION_FILTER_CLUSTER` | *(on)* | `--filter-cluster` at seed before voxel (GPU). Set `0` / `skip` to disable. |
| `SPLAT_COLLISION_SPHERE_M` | `60` | Radial cull at seed (`-S x,y,z,r`). `0` / `none` = skip sphere filter. |
| `SPLAT_COLLISION_BOX_HALF_M` | *(off)* | Optional axis-aligned box half-size centered on seed (`-B`). `0` / `none` = skip. |
| `SPLAT_COLLISION_BOX_Y_MIN` | *(auto)* | Optional absolute min Y for collision box (default: seed Y − box half). |
| `SPLAT_COLLISION_BOX_Y_MAX` | *(auto)* | Optional absolute max Y for collision box (default: seed Y + box half). |
| `SPLAT_COLLISION_FILTER_FLOATERS` | *(off)* | Set to `1` for GPU `--filter-floaters` before voxel. |
| `SPLAT_HEIGHTMAP` | *(on)* | Set to `skip` to skip heightmap extract after voxels. |
| `SPLAT_HEIGHTMAP_CELL` | *(auto)* | Height grid cell size (m) for `extract-heightmap.mjs`. |
| `SPLAT_HEIGHTMAP_WALKABLE_BAND_MIN` | `6` | Min band height (m) above grid floor. |
| `SPLAT_HEIGHTMAP_WALKABLE_BAND_MAX` | `30` | Cap on band height (m). Lower to ignore mid-air haze. |
| `SPLAT_HEIGHTMAP_WALKABLE_BAND_FRACTION` | `0.85` | Fraction of grid Y span used for the band. |
| `SPLAT_HEIGHTMAP_WALKABLE_MAX_Y` | *(off)* | Absolute Y ceiling; overrides the band formula. |

**Per-scene helper:** faint floaters on UM_05 — [`generate-um05-voxels.ps1`](generate-um05-voxels.ps1) (`-Force`, `-Opacity 0.3`, `-HeightmapOnly`, `-WalkableBandMaxM 12`).

Example — re-run UBC Farm with defaults:

```powershell
$env:SPLAT_ROTATION = "180,0,0"
powershell -ExecutionPolicy Bypass -File scripts/splat/batch-lod-from-temp.ps1
```

Example — LOD only (recommended for large cropped scenes):

```powershell
$env:SPLAT_COLLISION = "skip"
powershell -ExecutionPolicy Bypass -File scripts/splat/batch-lod-from-temp.ps1
```

Example — collision with defaults (60 m sphere + cluster at origin):

```powershell
# Defaults: coarsest LOD -> prep (cluster + 60m sphere) -> voxel
powershell -ExecutionPolicy Bypass -File scripts/splat/batch-lod-from-temp.ps1
```

Example — tighter walkable area around a known start point:

```powershell
$env:SPLAT_COLLISION_SEED_POS = "12.5,1.2,-8.0"
$env:SPLAT_COLLISION_SPHERE_M = "45"
$env:SPLAT_COLLISION_BOX_HALF_M = "40"
powershell -ExecutionPolicy Bypass -File scripts/splat/batch-lod-from-temp.ps1
```

Example — attempt collision on very large prep result (slow; use coarse voxels + high extent cap):

```powershell
$env:SPLAT_COLLISION_MAX_EXTENT_M = "200"
$env:SPLAT_VOXEL_PARAMS = "0.25,0.2"
$env:SPLAT_COLLISION_TIMEOUT_MIN = "120"
powershell -ExecutionPolicy Bypass -File scripts/splat/batch-lod-from-temp.ps1
```

Example — coarser voxels (faster / smaller collision files):

```powershell
$env:SPLAT_VOXEL_PARAMS = "0.1,0.15"
powershell -ExecutionPolicy Bypass -File scripts/splat/batch-lod-from-temp.ps1
```

---

## After conversion

### 1. Local smoke test (dev server)

```powershell
npm run dev:viewer
```

Open:

```text
http://localhost:5173/viewer/?url=/work-out/{basename}/lod-meta.json
```

The viewer auto-loads collision from the same folder:

```text
/work-out/{basename}/collision.voxel.json
```

### Collision debug overlay (viewer)

Append `collisionDebug=1` to the viewer URL to draw:

- **Green translucent mesh** — collision surface (`collision.collision.glb` if present, otherwise a runtime mesh built from the voxel octree)
- **Cyan line** — 50 cm world-down probe from the camera
- **Orange line** — center-screen probe (`nearClip + 20 cm`)

```text
http://localhost:5173/viewer/?url=/work-out/{basename}/lod-meta.json&collisionDebug=1
```

Generate the optional GLB mesh during batch (matches splat-transform exactly):

```powershell
$env:SPLAT_COLLISION_MESH = "faces"
.\scripts\splat\batch-lod-from-temp.ps1
```

Output: `work/out/{basename}/collision.collision.glb` (uploaded with the LOD bundle).

### What is `--voxel-carve`?

After voxelization (and usually `--voxel-floor-fill` for outdoor scenes), **carve** flood-fills navigable space from `--seed-pos` using a capsule (default height 1.6 m, radius 0.2 m). Voxels the capsule cannot reach are removed. That trims stray shells and floaters so runtime collision matches walkable space more closely. PlayCanvas recommends carve for smoother collisions; this batch script does **not** enable it by default yet — add `--voxel-carve` to the voxel step when regenerating if you want to experiment.

Compare with legacy:

```text
http://localhost:5173/viewer/?m={FieldID}
```

(`FieldID` in DynamoDB may differ from file basename, e.g. `AW2` vs `UBC_Farm_Agricultural`.)

### 2. Upload to assets CDN

```powershell
bash scripts/splat/sync-lod-to-s3.sh {basename} YOUR_ASSETS_BUCKET ca-central-1
```

`sync-lod-to-s3.sh` uploads the **entire** `work/out/{basename}/` folder, including `collision.voxel.json` and `collision.voxel.bin` when present.

Set DynamoDB **`FilePlayCanvas`** to:

```text
https://{assets_cdn}/splats/lod/{basename}/lod-meta.json
```

Set **`FileFormat`** to `streamed-lod`.

**URL stability:** Do not overwrite existing **`File`** (legacy `.ksplat`) URLs. LOD lives under `splats/lod/…`. See [`docs/PLAYCANVAS-MIGRATION-PLAN.md`](../../docs/PLAYCANVAS-MIGRATION-PLAN.md#url-stability-external-integrations).

After upload, invalidate CloudFront for `/splats/lod/{basename}/*` if objects use immutable cache headers.

---

## Runtime & expectations

| Scope | Typical time |
|-------|----------------|
| One ~2–4M scene | ~15–60 minutes (collision dominates) |
| All 7 production scenes | ~2–6+ hours |

Decimation and LOD bundling are relatively fast. **Steps 4a–4b (collision prep + voxel)** are the slow steps — voxelization can look hung because older script versions buffered all `splat-transform` output until completion. The updated script streams progress lines during step 4b.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `No .ksplat/.splat/.ply files in temp/` | Empty or wrong folder | Add sources to `temp/` |
| `splat-transform failed` with short command line | Old script bug (fixed) | Pull latest script; ensure array args use `(...)` |
| `Cannot find an overload for "Max"` | PowerShell `[math]::Max` arity | Pull latest script |
| PlayCanvas scene upside-down | LOD exported without rotation | Re-run with default `SPLAT_ROTATION=180,0,0` or use `?orientation=180` on old CDN assets |
| PlayCanvas freeze / smeared view | Bad scales or distant sky shell | Script auto-filters; check `work/batch-lod.log` for crop notes |
| Step 4 appears hung / no output | Voxelization is CPU-heavy; old script buffered stderr | Kill stale `node`/`splat-transform` processes; pull latest script (prep cull + timeout); use `check-batch-progress.sh` |
| Collision runs for days | Voxelizing full cropped LOD without prep | Stop run; pull latest script (default 60 m sphere prep); or `SPLAT_COLLISION=skip` |
| Collision skipped (extent) | Post-prep span > `SPLAT_COLLISION_MAX_EXTENT_M` (default 120 m) | Tighten `SPLAT_COLLISION_SPHERE_M` / box, or raise cap with coarse `SPLAT_VOXEL_PARAMS` |
| Collision skipped (0 gaussians) | Seed outside scene or filters too aggressive | Fix `SPLAT_COLLISION_SEED_POS`; widen sphere or disable cluster (`SPLAT_COLLISION_FILTER_CLUSTER=0`) |
| Collision voxel failed: `%1 is not a valid Win32 application` | `Start-Process` cannot run npm's bare `splat-transform` shim on Windows | Pull latest script (uses `splat-transform.cmd`); or set `SPLAT_COLLISION_TIMEOUT_MIN=0` as a workaround |
| Collision step failed / timed out | Prep result still too large or slow machine | Tighten prep filters, increase `SPLAT_VOXEL_PARAMS` coarseness, lower `SPLAT_COLLISION_TIMEOUT_MIN`, or `SPLAT_COLLISION=skip` |
| Collision files missing after run | Non-fatal warning (default) | Check `work/batch-lod.log`; set `SPLAT_COLLISION_STRICT=1` to fail fast |
| Legacy `/viewer/` broken | Should be unrelated | Script does not change `File` / `.ksplat` on CDN |

Inspect **`work/batch-lod.log`** for per-scene Gaussian counts, crop decisions, and warnings.

Manual single-file conversion (without batch): [`README.md`](README.md).

---

## Not covered by this script

- **Single `.sog` files** — use `splat-transform input.splat output.sog` (see [`README.md`](README.md)).
- **Standalone collision without LOD** — run `splat-transform` manually on a PLY (see [PlayCanvas collision guide](https://developer.playcanvas.com/user-manual/splat-transform/collision/)).
- **Lambda / DynamoDB updates** — manual or separate deploy step.
- **Production viewer cutover** — `/viewer/` uses PlayCanvas (`FilePlayCanvas`); add `?renderer=legacy` for legacy `File` (`.ksplat`).
