#!/usr/bin/env bash
# Generate heightmap.json + heightmap.bin for every LOD bundle under work/out/
# that has collision voxel files (collision.voxel.json + .voxel.bin).
#
# Usage:
#   ./scripts/splat/generate-all-heightmaps.sh
#   ./scripts/splat/generate-all-heightmaps.sh --force
#   SPLAT_HEIGHTMAP_CELL=0.25 ./scripts/splat/generate-all-heightmaps.sh
#
# Example (single bundle via the underlying script):
#   node scripts/splat/extract-heightmap.mjs --voxel work/out/Scene/collision.voxel.json

set -euo pipefail

FORCE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force|-f)
      FORCE=1
      shift
      ;;
    --help|-h)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      echo "Usage: $0 [--force]" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$REPO_ROOT/work/out"
EXTRACT="$REPO_ROOT/scripts/splat/extract-heightmap.mjs"

if [[ ! -f "$EXTRACT" ]]; then
  echo "error: missing $EXTRACT" >&2
  exit 1
fi

if [[ ! -d "$OUT_DIR" ]]; then
  echo "error: work/out not found: $OUT_DIR" >&2
  echo "Run batch-lod-from-temp.ps1 first (collision voxels required)." >&2
  exit 1
fi

CELL_ARGS=()
if [[ -n "${SPLAT_HEIGHTMAP_CELL:-}" ]]; then
  CELL_ARGS=(--cell "$SPLAT_HEIGHTMAP_CELL")
fi

shopt -s nullglob
bundles=()
skipped_no_voxel=()
skipped_exists=()

for dir in "$OUT_DIR"/*/; do
  [[ -d "$dir" ]] || continue
  basename="$(basename "$dir")"
  voxel_json="$dir/collision.voxel.json"
  voxel_bin="$dir/collision.voxel.bin"
  heightmap_json="$dir/heightmap.json"

  if [[ ! -f "$dir/lod-meta.json" ]]; then
    echo "skip $basename (no lod-meta.json)" >&2
    continue
  fi

  if [[ ! -f "$voxel_json" || ! -f "$voxel_bin" ]]; then
    skipped_no_voxel+=("$basename")
    continue
  fi

  if [[ -f "$heightmap_json" && "$FORCE" -eq 0 ]]; then
    skipped_exists+=("$basename")
    continue
  fi

  bundles+=("$basename")
done

if [[ ${#bundles[@]} -eq 0 && ${#skipped_no_voxel[@]} -eq 0 && ${#skipped_exists[@]} -eq 0 ]]; then
  echo "error: no LOD bundles under $OUT_DIR" >&2
  exit 1
fi

echo "Heightmap generation under: $OUT_DIR"
if [[ ${#CELL_ARGS[@]} -gt 0 ]]; then
  echo "cell size: ${SPLAT_HEIGHTMAP_CELL}m"
fi
if [[ "$FORCE" -eq 1 ]]; then
  echo "mode: force (overwrite existing heightmaps)"
fi
echo ""

if [[ ${#skipped_exists[@]} -gt 0 ]]; then
  echo "Skipping ${#skipped_exists[@]} bundle(s) with existing heightmap (use --force to overwrite):"
  for name in "${skipped_exists[@]}"; do
    echo "  - $name"
  done
  echo ""
fi

if [[ ${#skipped_no_voxel[@]} -gt 0 ]]; then
  echo "Skipping ${#skipped_no_voxel[@]} bundle(s) without collision voxels:"
  for name in "${skipped_no_voxel[@]}"; do
    echo "  - $name"
  done
  echo ""
fi

if [[ ${#bundles[@]} -eq 0 ]]; then
  echo "Nothing to generate."
  if [[ ${#skipped_no_voxel[@]} -gt 0 ]]; then
    echo "Run batch-lod-from-temp.ps1 (with collision enabled) to create collision.voxel.json files." >&2
    exit 1
  fi
  exit 0
fi

echo "Generating heightmaps for ${#bundles[@]} bundle(s)..."
echo ""

failed=()
ok=0
for basename in "${bundles[@]}"; do
  voxel_json="$OUT_DIR/$basename/collision.voxel.json"
  heightmap_json="$OUT_DIR/$basename/heightmap.json"

  echo "========================================"
  echo " $basename"
  echo "========================================"
  if node "$EXTRACT" --voxel "$voxel_json" --out "$heightmap_json" "${CELL_ARGS[@]}"; then
    ok=$((ok + 1))
  else
    failed+=("$basename")
    echo "WARNING: heightmap failed for $basename" >&2
  fi
  echo ""
done

echo "========================================"
echo "Complete: $ok / ${#bundles[@]} generated"
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "Failed: ${failed[*]}" >&2
  exit 1
fi

echo "Output: work/out/<basename>/heightmap.json + heightmap.bin"
echo "Upload with sync-lod-to-s3.sh (entire bundle folder)."
