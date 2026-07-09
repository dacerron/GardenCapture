import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const CACHE_DIR_NAME = "full-splat-cache";

function looksLikePlyFile(filePath: string): boolean {
  try {
    const head = readFileSync(filePath, { encoding: "utf-8", flag: "r" }).slice(0, 64);
    return head.startsWith("ply\n") || head.startsWith("ply\r\n");
  } catch {
    return false;
  }
}

function runSplatTransform(inputPath: string, outPath: string) {
  return spawnSync("splat-transform", [inputPath, "-w", outPath], {
    encoding: "utf-8",
    // Required on Windows: .cmd shims fail with status=null when shell is false.
    shell: process.platform === "win32",
    timeout: 60 * 60 * 1000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Dev-only middleware: GET /dev/full-splat.ply?src={absolute legacy URL}
 * converts `.ksplat`/`.splat` (or remote http URL) to PLY via splat-transform.
 * Cached under work/out/full-splat-cache/.
 */
export function createDevFullSplatMiddleware(workOutDir: string) {
  const cacheDir = path.join(workOutDir, CACHE_DIR_NAME);
  mkdirSync(cacheDir, { recursive: true });

  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ) => {
    const urlPath = req.url?.split("?")[0] ?? "";
    if (urlPath !== "/dev/full-splat.ply") return next();

    const parsed = new URL(req.url ?? "", "http://localhost");
    const src = parsed.searchParams.get("src")?.trim();
    if (!src) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Missing src query param");
      return;
    }

    if (!/^https?:\/\//i.test(src) && !src.startsWith("/work-out/")) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("src must be an absolute http(s) URL or /work-out/ path");
      return;
    }

    let inputPath = src;
    if (src.startsWith("/work-out/")) {
      const rel = src.replace(/^\/work-out\//, "").split("/").filter(Boolean);
      if (rel.some((segment) => segment === "..")) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
      inputPath = path.join(workOutDir, ...rel);
      if (!existsSync(inputPath)) {
        res.statusCode = 404;
        res.end("Source not found");
        return;
      }
    }

    const hash = createHash("sha256").update(src).digest("hex").slice(0, 16);
    const outPath = path.join(cacheDir, `${hash}.ply`);

    const needsConvert = !existsSync(outPath) || !looksLikePlyFile(outPath);
    if (needsConvert) {
      if (existsSync(outPath)) {
        try {
          unlinkSync(outPath);
        } catch {
          /* ignore */
        }
      }

      mkdirSync(cacheDir, { recursive: true });
      const result = runSplatTransform(inputPath, outPath);

      if (result.status !== 0 || !existsSync(outPath) || !looksLikePlyFile(outPath)) {
        if (existsSync(outPath)) {
          try {
            unlinkSync(outPath);
          } catch {
            /* ignore */
          }
        }
        const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(
          `splat-transform failed (exit ${result.status ?? "?"}):\n` +
            `${detail || "no output — is splat-transform on PATH?"}\n` +
            `input: ${inputPath}`,
        );
        return;
      }
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");

    if (req.method === "HEAD") {
      res.statusCode = 200;
      res.end();
      return;
    }
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.end("Method not allowed");
      return;
    }

    createReadStream(outPath).pipe(res);
  };
}
