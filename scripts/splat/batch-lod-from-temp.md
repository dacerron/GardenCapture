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
4. **Voxel ground collision** (from **coarsest** `lodN.ply` by default) → `work/out/{basename}/collision.voxel.json` + `collision.voxel.bin`
   - `--voxel-params 0.1,0.12` and `--voxel-floor-fill 1.6` by default (outdoor / soil scenes)
   - **Slow:** often **10–45+ minutes** per ~4M-Gaussian scene; progress is streamed to the console during step 4
   - Optional `collision.collision.glb` when `SPLAT_COLLISION_MESH=faces` or `smooth`
   - Used by the PlayCanvas viewer for camera ground clamp ([`packages/playcanvas-viewer`](../../packages/playcanvas-viewer/))

### Output layout

```text
work/
  batch-lod.log                          # run log (append)
  lod/{basename}/lod0.ply, lod1.ply, …   # intermediates (gitignored)
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

Example — re-run UBC Farm with defaults:

```powershell
$env:SPLAT_ROTATION = "180,0,0"
powershell -ExecutionPolicy Bypass -File scripts/splat/batch-lod-from-temp.ps1
```

Example — skip collision (LOD only):

```powershell
$env:SPLAT_COLLISION = "skip"
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

*(Voxel height query is still being implemented; until then the viewer uses an AABB floor fallback even when collision files are present.)*

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

Decimation and LOD bundling are relatively fast. **Step 4 (voxel collision)** is the slow step — it can look hung because older script versions buffered all `splat-transform` output until completion. The updated script streams progress lines during step 4.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `No .ksplat/.splat/.ply files in temp/` | Empty or wrong folder | Add sources to `temp/` |
| `splat-transform failed` with short command line | Old script bug (fixed) | Pull latest script; ensure array args use `(...)` |
| `Cannot find an overload for "Max"` | PowerShell `[math]::Max` arity | Pull latest script |
| PlayCanvas scene upside-down | LOD exported without rotation | Re-run with default `SPLAT_ROTATION=180,0,0` or use `?orientation=180` on old CDN assets |
| PlayCanvas freeze / smeared view | Bad scales or distant sky shell | Script auto-filters; check `work/batch-lod.log` for crop notes |
| Step 4 appears hung / no output | Voxelization is CPU-heavy; old script buffered stderr | Check Task Manager for `node` running `splat-transform` with high CPU; pull latest script for streamed progress; use coarser `SPLAT_VOXEL_PARAMS=0.15,0.15` and `SPLAT_COLLISION_SOURCE=coarse` |
| Collision step failed | Old `splat-transform` or bad seed | Upgrade CLI (`npm i -g @playcanvas/splat-transform@latest`); adjust `SPLAT_COLLISION_SEED_POS`; or `SPLAT_COLLISION=skip` |
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
