# `batch-lod-from-temp.ps1` — usage & prerequisites

Batch-converts every splat in repo [`temp/`](../../temp/) to **PlayCanvas streamed LOD** (`lod-meta.json` + chunk folders) using [`@playcanvas/splat-transform`](https://github.com/playcanvas/splat-transform).

**Script:** [`batch-lod-from-temp.ps1`](batch-lod-from-temp.ps1)  
**Broader conversion guide:** [`README.md`](README.md) (manual steps, single `.sog`, S3 upload)

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Windows PowerShell 5.1+** | Script is PowerShell; run from repo root. |
| **`@playcanvas/splat-transform`** | Global CLI on `PATH`. |
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

### What the script does (per file)

1. **Import + PlayCanvas cleanup** → `work/lod/{basename}/lod0.ply`
   - `-r 180,0,0` by default (matches legacy `/viewer/` mkkellogg flip)
   - Strips invalid `-Infinity` log-scales (`scale_*_raw,gt,-100`)
   - If scene extent **> 200 m**, crops to a **±150 m** box (distant sky / outlier shell)
2. **Decimate** 50% per step until coarsest level ≤ ~**1.05M** Gaussians (max **3** steps) → `lod1.ply`, `lod2.ply`, …
3. **Bundle streamed LOD** → `work/out/{basename}/lod-meta.json` (+ `0_0/`, `1_0/`, … chunk folders)

### Output layout

```text
work/
  batch-lod.log                          # run log (append)
  lod/{basename}/lod0.ply, lod1.ply, …   # intermediates (gitignored)
  out/{basename}/lod-meta.json           # upload this folder
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

Example — re-run UBC Farm with defaults:

```powershell
$env:SPLAT_ROTATION = "180,0,0"
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
http://localhost:5173/viewer-pc/?url=/work-out/{basename}/lod-meta.json
```

Compare with legacy:

```text
http://localhost:5173/viewer/?m={FieldID}
```

(`FieldID` in DynamoDB may differ from file basename, e.g. `AW2` vs `UBC_Farm_Agricultural`.)

### 2. Upload to assets CDN

```powershell
bash scripts/splat/sync-lod-to-s3.sh {basename} YOUR_ASSETS_BUCKET ca-central-1
```

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
| One ~2–4M scene | ~5–15 minutes |
| All 7 production scenes | ~1–2+ hours |

Decimation and LOD bundling are the slow steps. Progress appears on stderr from `splat-transform`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `No .ksplat/.splat/.ply files in temp/` | Empty or wrong folder | Add sources to `temp/` |
| `splat-transform failed` with short command line | Old script bug (fixed) | Pull latest script; ensure array args use `(...)` |
| `Cannot find an overload for "Max"` | PowerShell `[math]::Max` arity | Pull latest script |
| PlayCanvas scene upside-down | LOD exported without rotation | Re-run with default `SPLAT_ROTATION=180,0,0` or use `?orientation=180` on old CDN assets |
| PlayCanvas freeze / smeared view | Bad scales or distant sky shell | Script auto-filters; check `work/batch-lod.log` for crop notes |
| Legacy `/viewer/` broken | Should be unrelated | Script does not change `File` / `.ksplat` on CDN |

Inspect **`work/batch-lod.log`** for per-scene Gaussian counts, crop decisions, and warnings.

Manual single-file conversion (without batch): [`README.md`](README.md).

---

## Not covered by this script

- **Single `.sog` files** — use `splat-transform input.splat output.sog` (see [`README.md`](README.md)).
- **Lambda / DynamoDB updates** — manual or separate deploy step.
- **Production viewer cutover** — `/viewer/` still uses legacy `File`; `/viewer-pc/` uses `FilePlayCanvas`.
