import { urlLooksLikePly } from "./plyHeader";

export type ResolveFullSplatResult =
  | { ok: true; url: string; source: string }
  | { ok: false; message: string };

const LEGACY_EXT = /\.(ksplat|splat)(\?|$)/i;

/** Formats PlayCanvas GSplatHandler loads directly (not legacy `.ksplat`/`.splat`). */
export function isPlayCanvasNativeSplatUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/\/lod-meta\.json(\?|$)/i.test(trimmed)) return true;
  return /\.(ply|sog|json)(\?|$)/i.test(trimmed);
}

/** Same path as legacy URL with `.ply` extension (query string preserved). */
export function getPlySiblingUrl(legacyUrl: string): string {
  const trimmed = legacyUrl.trim();
  const qIndex = trimmed.indexOf("?");
  const pathPart = qIndex >= 0 ? trimmed.slice(0, qIndex) : trimmed;
  const query = qIndex >= 0 ? trimmed.slice(qIndex) : "";
  const plyPath = pathPart.replace(/\.(ksplat|splat)$/i, ".ply");
  return plyPath + query;
}

/** Dev-server proxy that converts legacy splats to PLY on first request. */
export function getDevFullSplatProxyUrl(absoluteLegacyUrl: string): string {
  return `/dev/full-splat.ply?src=${encodeURIComponent(absoluteLegacyUrl)}`;
}

function isDevHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === "undefined") return url;
  return `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
}

/**
 * Resolve a legacy `.ksplat`/`.splat` URL to something PlayCanvas can load.
 *
 * 1. Already native (`.ply`, `.sog`, `lod-meta.json`) → use as-is
 * 2. `.ply` sibling on CDN with valid PLY header → use sibling
 * 3. Local dev → `/dev/full-splat.ply?src=…` (splat-transform on demand)
 */
export async function resolveFullSplatPlayCanvasUrl(
  legacyUrl: string,
): Promise<ResolveFullSplatResult> {
  const url = legacyUrl.trim();
  if (!url) {
    return { ok: false, message: "Empty splat URL." };
  }

  if (isPlayCanvasNativeSplatUrl(url)) {
    if (/\.ply(\?|$)/i.test(url)) {
      const absolute = toAbsoluteUrl(url);
      if (!(await urlLooksLikePly(absolute))) {
        return {
          ok: false,
          message: `URL ends in .ply but response is not a valid PLY header: ${url}`,
        };
      }
    }
    return { ok: true, url, source: "native" };
  }

  if (!LEGACY_EXT.test(url)) {
    return {
      ok: false,
      message: `Unsupported splat URL for full-splat test: ${url}`,
    };
  }

  const plySibling = getPlySiblingUrl(url);
  if (await urlLooksLikePly(toAbsoluteUrl(plySibling))) {
    return { ok: true, url: plySibling, source: "ply sibling" };
  }

  if (isDevHost()) {
    return {
      ok: true,
      url: getDevFullSplatProxyUrl(toAbsoluteUrl(url)),
      source: "dev proxy (ksplat→ply)",
    };
  }

  return {
    ok: false,
    message:
      `No .ply sibling found for ${url}. ` +
      "Host a .ply alongside the legacy file, or run the dev server with fullSplat=1.",
  };
}
