#!/usr/bin/env bash
# Sync every streamed LOD bundle under work/out/ to the assets S3 bucket.
#
# Usage:
#   ./scripts/splat/sync-all-lod-to-s3.sh <s3-bucket> [aws-region]
#
# Example:
#   ./scripts/splat/sync-all-lod-to-s3.sh "$ASSETS_BUCKET"
#
# Uploads each:
#   work/out/<basename>/  ->  s3://<bucket>/splats/lod/<basename>/
#
# Skips subfolders that lack lod-meta.json. After upload, invalidate CloudFront
# for /splats/lod/* if objects use immutable cache headers.

set -euo pipefail

usage() {
  echo "Usage: $0 [s3-bucket] [aws-region]" >&2
  echo "  s3-bucket  Assets bucket name without s3:// prefix (or set ASSETS_BUCKET)" >&2
  echo "  aws-region Optional. Default: ca-central-1" >&2
  exit 1
}

if [[ $# -gt 2 ]]; then
  usage
fi

BUCKET="${1:-${ASSETS_BUCKET:-}}"
REGION="${2:-ca-central-1}"

if [[ -z "$BUCKET" ]]; then
  echo "error: missing assets S3 bucket name" >&2
  echo "Pass <s3-bucket> as the first argument, or export ASSETS_BUCKET." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$REPO_ROOT/work/out"
SYNC_ONE="$SCRIPT_DIR/sync-lod-to-s3.sh"

if [[ ! -x "$SYNC_ONE" && ! -f "$SYNC_ONE" ]]; then
  echo "error: missing $SYNC_ONE" >&2
  exit 1
fi

if [[ ! -d "$OUT_DIR" ]]; then
  echo "error: work/out not found: $OUT_DIR" >&2
  echo "Run batch-lod-from-temp.ps1 or splat-transform first." >&2
  exit 1
fi

shopt -s nullglob
bundles=()
for dir in "$OUT_DIR"/*/; do
  [[ -d "$dir" ]] || continue
  if [[ -f "$dir/lod-meta.json" ]]; then
    bundles+=("$(basename "$dir")")
  else
    echo "skip $(basename "$dir") (no lod-meta.json)" >&2
  fi
done

if [[ ${#bundles[@]} -eq 0 ]]; then
  echo "error: no LOD bundles with lod-meta.json under $OUT_DIR" >&2
  exit 1
fi

echo "Syncing ${#bundles[@]} LOD bundle(s) to s3://$BUCKET/splats/lod/"
echo "region: $REGION"
echo ""

failed=()
for basename in "${bundles[@]}"; do
  echo "========================================"
  if bash "$SYNC_ONE" "$basename" "$BUCKET" "$REGION"; then
    echo ""
  else
    failed+=("$basename")
    echo ""
  fi
done

echo "========================================"
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "Failed (${#failed[@]}/${#bundles[@]}): ${failed[*]}" >&2
  exit 1
fi

echo "Done. Synced ${#bundles[@]} bundle(s)."
echo "Invalidate CloudFront: /splats/lod/*"
