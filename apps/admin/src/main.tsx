import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Routes, Route, useSearchParams } from "react-router-dom";
import "./auth";
import Admin from "./Admin";
import RequireAuth from "./RequireAuth";

const PlayCanvasEditor = lazy(() => import("./PlayCanvasEditor"));
const EditorLegacy = lazy(() => import("./EditorLegacy"));

function EditorRouteFallback({ label }: { label: string }) {
  return (
    <main className="viewerStatusShell">
      <section className="viewerStatusCard">
        <h1>Loading editor…</h1>
        <p>{label}</p>
      </section>
    </main>
  );
}

function EditorRoute() {
  const [searchParams] = useSearchParams();
  // PlayCanvas is default (Phase 6.8). Legacy Three.js: ?renderer=legacy
  const isLegacy = searchParams.get("renderer") === "legacy";

  if (isLegacy) {
    return (
      <Suspense fallback={<EditorRouteFallback label="Preparing legacy editor." />}>
        <EditorLegacy />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<EditorRouteFallback label="Preparing PlayCanvas editor." />}>
      <PlayCanvasEditor />
    </Suspense>
  );
}

function EditorPage() {
  return (
    <RequireAuth>
      <EditorRoute />
    </RequireAuth>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Admin />} />
      <Route path="/admin" element={<Navigate to="/" replace />} />
      <Route path="/editor" element={<EditorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);
