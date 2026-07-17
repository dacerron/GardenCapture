#!/usr/bin/env bash
# Sync a streamed LOD bundle (work/out/{basename}/) to the assets S3 bucket.
#
# Usage:
#   ./scripts/splat/sync-lod-to-s3.sh <basename> <s3-bucket> [aws-region]
#
# Example:
#   ./scripts/splat/sync-lod-to-s3.sh UM_ResearchStation_01_WebHigh ubc-eml-virtual-soils-prod-assets-078d04
#
# Uploads:
#   work/out/<basename>/  ->  s3://<bucket>/splats/lod/<basename>/
#
# DynamoDB FilePlayCanvas (after CloudFront):
#   https://{assets_cdn}/splats/lod/<basename>/lod-meta.json

set -euo pipefail

usage() {
  echo "Usage: $0 <basename> <s3-bucket> [aws-region]" >&2
  echo "  basename   Folder name under work/out/ (e.g. UBC_TotemField)" >&2
  echo "  s3-bucket  Assets bucket name without s3:// prefix" >&2
  echo "  aws-region Optional. Default: ca-central-1" >&2
  exit 1
}

[[ $# -ge 2 && $# -le 3 ]] || usage

BASENAME="$1"
BUCKET="$2"
REGION="${3:-ca-central-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE_DIR="$REPO_ROOT/work/out/$BASENAME"
S3_PREFIX="s3://$BUCKET/splats/lod/$BASENAME/"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "error: local LOD folder not found: $SOURCE_DIR" >&2
  echo "Run batch-lod-from-temp.ps1 or splat-transform first." >&2
  exit 1
fi

if [[ ! -f "$SOURCE_DIR/lod-meta.json" ]]; then
  echo "error: missing lod-meta.json in $SOURCE_DIR" >&2
  exit 1
fi

# Top-level sidecar/manifest files. These keep the same object key when a scene is
# re-exported, so a long "immutable" cache would serve stale data. Upload them with a
# short, revalidatable cache instead. Everything else (the numbered LOD chunk folders)
# is bulky and re-fetched on demand, so it stays immutable.
METADATA_FILES=(
  "lod-meta.json"
  "heightmap.json"
  "heightmap.bin"
  "collision.voxel.json"
  "collision.voxel.bin"
  "collision.collision.glb"
)

IMMUTABLE_CACHE="public, max-age=31536000, immutable"
METADATA_CACHE="public, max-age=60, must-revalidate"

echo "Syncing streamed LOD bundle"
echo "  from: $SOURCE_DIR"
echo "  to:   $S3_PREFIX"
echo "  region: $REGION"
echo ""

# Pass 1: immutable chunks (everything except the top-level metadata files).
immutable_excludes=()
for f in "${METADATA_FILES[@]}"; do
  immutable_excludes+=(--exclude "$f")
done

echo "-> immutable chunks ($IMMUTABLE_CACHE)"
aws s3 sync "$SOURCE_DIR/" "$S3_PREFIX" \
  --cache-control "$IMMUTABLE_CACHE" \
  "${immutable_excludes[@]}" \
  --region "$REGION"

# Pass 2: revalidatable metadata (only the top-level manifest/sidecar files).
metadata_includes=(--exclude "*")
for f in "${METADATA_FILES[@]}"; do
  metadata_includes+=(--include "$f")
done

echo ""
echo "-> revalidatable metadata ($METADATA_CACHE)"
aws s3 sync "$SOURCE_DIR/" "$S3_PREFIX" \
  --cache-control "$METADATA_CACHE" \
  "${metadata_includes[@]}" \
  --region "$REGION"

echo ""
echo "Done."
echo "FilePlayCanvas path: splats/lod/$BASENAME/lod-meta.json"
echo "Full URL: https://{assets_cdn}/splats/lod/$BASENAME/lod-meta.json"
echo ""
echo "Note: 'aws s3 sync' only re-uploads changed files, so unchanged metadata keeps"
echo "its previous cache header. When re-exporting an existing bundle, invalidate the"
echo "immutable chunks (their keys are reused) on the assets CloudFront distribution:"
echo "  aws cloudfront create-invalidation \\"
echo "    --distribution-id E38XHXEPV282TQ \\"
echo "    --paths \"/splats/lod/$BASENAME/*\""
