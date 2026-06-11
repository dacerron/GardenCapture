import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import App from "./App";
import Viewer from "./Viewer";

const PlayCanvasSmoke = lazy(() => import("./PlayCanvasSmoke"));

function RedirectToViewer() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/viewer/", search, hash }} replace />;
}

function PlayCanvasSmokeFallback() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "#0a0a0a",
        color: "#eee",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      Loading PlayCanvas harness…
    </div>
  );
}

function PlayCanvasSmokeRoute() {
  return (
    <Suspense fallback={<PlayCanvasSmokeFallback />}>
      <PlayCanvasSmoke />
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/viewer-pc" element={<PlayCanvasSmokeRoute />} />
      <Route path="/viewer-pc/*" element={<PlayCanvasSmokeRoute />} />
      <Route path="/viewer" element={<Viewer />} />
      <Route path="/viewer/*" element={<Viewer />} />
      <Route path="*" element={<RedirectToViewer />} />
    </Routes>
  </BrowserRouter>
);
