import path from "node:path";
import { createReadStream, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import glsl from "vite-plugin-glsl";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const workOutDir = path.resolve(repoRoot, "work/out");

const WORK_OUT_MIME: Record<string, string> = {
  ".json": "application/json",
  ".webp": "image/webp",
  ".sog": "application/octet-stream",
};

/** Dev/preview static route: /work-out/{basename}/… → repo work/out/ */
function serveWorkOutMiddleware(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  next: (err?: unknown) => void,
) {
  const urlPath = req.url?.split("?")[0] ?? "";
  if (!urlPath || urlPath === "/") return next();

  // URL paths are POSIX; join under workOutDir without path.normalize (Windows-safe).
  const segments = decodeURIComponent(urlPath)
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment && segment !== ".");
  if (segments.some((segment) => segment === "..")) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  const filePath = path.join(workOutDir, ...segments);
  const relToRoot = path.relative(workOutDir, filePath);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  if (!existsSync(filePath)) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const stat = statSync(filePath);
  if (stat.isDirectory()) return next();

  const ext = path.extname(filePath).toLowerCase();
  if (WORK_OUT_MIME[ext]) res.setHeader("Content-Type", WORK_OUT_MIME[ext]);
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

  const stream = createReadStream(filePath);
  stream.on("error", (err) => {
    if (!res.headersSent) res.statusCode = 500;
    res.end(String(err));
  });
  stream.pipe(res);
}

function serveWorkOutPlugin(): Plugin {
  return {
    name: "serve-work-out",
    configureServer(server) {
      server.middlewares.use("/work-out", serveWorkOutMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/work-out", serveWorkOutMiddleware);
    },
  };
}

export default defineConfig({
  root: __dirname,
  envDir: repoRoot,
  publicDir: path.resolve(repoRoot, "public"),
  plugins: [
    react(),
    glsl({
      include: ["**/*.glsl", "**/*.vert", "**/*.frag", "**/*.wgsl"],
      warnDuplicatedImports: true,
      defaultExtension: "glsl",
      minify: false,
    }),
    serveWorkOutPlugin(),
  ],
  assetsInclude: ["**/*.ksplat"],
  resolve: {
    alias: {
      "@soil/shared": path.resolve(repoRoot, "packages/shared/src"),
    },
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
