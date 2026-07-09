#!/usr/bin/env node
/**
 * Verify heightmap.json + heightmap.bin exist beside each field's FilePlayCanvas URL.
 *
 * Usage (from repo root):
 *   VITE_PUBLIC_API_URL=https://api.example.com node scripts/splat/verify-heightmaps.mjs
 *   node scripts/splat/verify-heightmaps.mjs --local work/out
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

function loadDotEnv() {
  const envPath = resolve(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function resolveHeightmapUrl(splatUrl) {
  const trimmed = splatUrl.trim();
  if (!trimmed) return null;
  const pathOnly = trimmed.split("?")[0] ?? trimmed;
  if (/heightmap\.json$/i.test(pathOnly)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (/lod-meta\.json$/i.test(url.pathname)) {
        url.pathname = url.pathname.replace(/lod-meta\.json$/i, "heightmap.json");
        return url.href;
      }
    } catch {
      /* fall through */
    }
  }
  if (/lod-meta\.json/i.test(pathOnly)) {
    const [pathPart, ...queryParts] = trimmed.split("?");
    const next = pathPart.replace(/lod-meta\.json$/i, "heightmap.json");
    return queryParts.length ? `${next}?${queryParts.join("?")}` : next;
  }
  return null;
}

function resolveBinaryUrl(jsonUrl, heightsFile) {
  if (/^https?:\/\//i.test(jsonUrl)) {
    const url = new URL(jsonUrl);
    url.pathname = url.pathname.replace(/[^/]+$/, heightsFile);
    return url.href;
  }
  const dir = jsonUrl.replace(/[^/]+$/, "");
  return `${dir}${heightsFile}`;
}

async function headOrGet(url) {
  let res = await fetch(url, { method: "HEAD" });
  if (res.status === 405 || res.status === 403) {
    res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } });
  }
  return res;
}

async function verifyRemote(fieldId, splatUrl, heightmapUrl) {
  const jsonRes = await headOrGet(heightmapUrl);
  if (!jsonRes.ok) {
    return { fieldId, splatUrl, heightmapUrl, status: "MISSING_JSON", detail: `${jsonRes.status}` };
  }

  let meta;
  try {
    const metaRes = await fetch(heightmapUrl);
    meta = await metaRes.json();
  } catch (err) {
    return { fieldId, splatUrl, heightmapUrl, status: "BAD_JSON", detail: String(err) };
  }

  const binUrl = resolveBinaryUrl(heightmapUrl, meta.heights ?? "heightmap.bin");
  const binRes = await headOrGet(binUrl);
  if (!binRes.ok) {
    return { fieldId, splatUrl, heightmapUrl, status: "MISSING_BIN", detail: `${binRes.status} ${binUrl}` };
  }

  const space = meta.coordinateSpace ?? "voxel-grid";
  if (space === "splat-local") {
    return {
      fieldId,
      splatUrl,
      heightmapUrl,
      status: "DEPRECATED_SPACE",
      detail: "coordinateSpace=splat-local — regenerate with extract-heightmap.mjs",
    };
  }

  return { fieldId, splatUrl, heightmapUrl, status: "OK", detail: space };
}

function verifyLocal(fieldId, splatUrl, localRoot, basename) {
  const heightmapJson = join(localRoot, basename, "heightmap.json");
  const heightmapBin = join(localRoot, basename, "heightmap.bin");
  if (!existsSync(heightmapJson) || !existsSync(heightmapBin)) {
    return { fieldId, splatUrl, status: "MISSING_LOCAL", detail: heightmapJson };
  }
  const meta = JSON.parse(readFileSync(heightmapJson, "utf8"));
  const space = meta.coordinateSpace ?? "voxel-grid";
  if (space === "splat-local") {
    return { fieldId, splatUrl, status: "DEPRECATED_SPACE", detail: heightmapJson };
  }
  return { fieldId, splatUrl, status: "OK", detail: space };
}

async function main() {
  loadDotEnv();
  const localRootArg = process.argv.includes("--local")
    ? process.argv[process.argv.indexOf("--local") + 1]
    : null;
  const localRoot = localRootArg ? resolve(localRootArg) : null;

  let fields = [];
  if (localRoot) {
    if (!existsSync(localRoot)) {
      console.error(`Local root not found: ${localRoot}`);
      process.exit(1);
    }
    const { readdirSync, statSync } = await import("node:fs");
    fields = readdirSync(localRoot)
      .filter((name) => statSync(join(localRoot, name)).isDirectory())
      .filter((name) => existsSync(join(localRoot, name, "lod-meta.json")))
      .map((name) => ({
        FieldID: name,
        FilePlayCanvas: `/work-out/${name}/lod-meta.json`,
      }));
  } else {
    const base = process.env.VITE_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!base) {
      console.error("Set VITE_PUBLIC_API_URL or pass --local work/out");
      process.exit(1);
    }
    const res = await fetch(`${base}/fields`);
    if (!res.ok) {
      console.error(`GET /fields failed: ${res.status}`);
      process.exit(1);
    }
    const raw = await res.json();
    fields = Array.isArray(raw) ? raw : raw.items ?? [];
  }

  const rows = [];
  for (const field of fields) {
    const fieldId = String(field.FieldID ?? "(unknown)");
    const splatUrl = typeof field.FilePlayCanvas === "string" ? field.FilePlayCanvas.trim() : "";
    if (!splatUrl) {
      rows.push({ fieldId, splatUrl: "", status: "NO_FILEPLAYCANVAS", detail: "" });
      continue;
    }

    if (localRoot) {
      const lodMatch = splatUrl.match(/([^/?#]+)\/lod-meta\.json/i);
      const basename = lodMatch?.[1] ?? fieldId;
      rows.push(verifyLocal(fieldId, splatUrl, localRoot, basename));
      continue;
    }

    const heightmapUrl = resolveHeightmapUrl(splatUrl);
    if (!heightmapUrl) {
      rows.push({ fieldId, splatUrl, status: "NO_HEIGHTMAP_URL", detail: splatUrl });
      continue;
    }
    rows.push(await verifyRemote(fieldId, splatUrl, heightmapUrl));
  }

  for (const row of rows) {
    console.log(`${row.status.padEnd(18)} ${row.fieldId}${row.detail ? ` — ${row.detail}` : ""}`);
  }

  const bad = rows.filter((r) => r.status !== "OK");
  console.log("");
  console.log(`OK: ${rows.length - bad.length}/${rows.length}`);
  if (bad.length > 0) {
    console.error("\nFix: ./scripts/splat/generate-all-heightmaps.sh --force && sync-all-lod-to-s3.sh");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
