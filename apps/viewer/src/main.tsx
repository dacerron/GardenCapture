import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import App from "./App";

const PlayCanvasViewer = lazy(() => import("./PlayCanvasViewer"));
const PlayCanvasSmoke = lazy(() => import("./PlayCanvasSmoke"));
const Viewer = lazy(() => import("./Viewer"));

function RedirectToViewer() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/viewer/", search, hash }} replace />;
}

function PlayCanvasRouteFallback({ label }: { label: string }) {
  return (
    <div className="viewerStatusShell">
      <div className="viewerStatusCard">
        <h1>Loading viewer…</h1>
        <p>{label}</p>
      </div>
    </div>
  );
}

function PlayCanvasViewerRoute() {
  return (
    <Suspense fallback={<PlayCanvasRouteFallback label="Preparing PlayCanvas viewer." />}>
      <PlayCanvasViewer />
    </Suspense>
  );
}

function PlayCanvasSmokeRoute() {
  return (
    <Suspense fallback={<PlayCanvasRouteFallback label="Preparing dev harness." />}>
      <PlayCanvasSmoke />
    </Suspense>
  );
}

function ViewerRoute() {
  const [searchParams] = useSearchParams();
  const isLegacy = searchParams.get("renderer") === "legacy";

  if (isLegacy) {
    return (
      <Suspense fallback={<PlayCanvasRouteFallback label="Preparing legacy viewer." />}>
        <Viewer />
      </Suspense>
    );
  }

  return <PlayCanvasViewerRoute />;
}

function RedirectViewerPcToViewer() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/viewer/", search, hash }} replace />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/viewer-pc" element={<RedirectViewerPcToViewer />} />
      <Route path="/viewer-pc/*" element={<RedirectViewerPcToViewer />} />
      <Route path="/viewer-pc-dev" element={<PlayCanvasSmokeRoute />} />
      <Route path="/viewer-pc-dev/*" element={<PlayCanvasSmokeRoute />} />
      <Route path="/viewer" element={<ViewerRoute />} />
      <Route path="/viewer/*" element={<ViewerRoute />} />
      <Route path="*" element={<RedirectToViewer />} />
    </Routes>
  </BrowserRouter>
);
