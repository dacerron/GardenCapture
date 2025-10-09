// src/App.tsx

import "./index.css";
import UBCMap from "./UBCMap";

export default function App() {
  const openViewer = () => {
    const url = new URL("/viewer", window.location.href).href;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="app" style={{ minHeight: "100dvh" }}>
      <section style={{ display: "grid", placeItems: "center", padding: "3rem 1rem" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ marginBottom: "1rem" }}>Virtual Soils</h1>
          <button
            onClick={openViewer}
            style={{
              padding: "0.8rem 1.2rem",
              borderRadius: 12,
              border: "none",
              fontSize: "1rem",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          >
            Open 3D Viewer
          </button>
        </div>
      </section>

      {/* The simple interactive map at UBC */}
      <section style={{ padding: "0 1rem 2rem" }}>
        <UBCMap />
      </section>
    </div>
  );
}
