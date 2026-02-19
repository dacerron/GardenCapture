import { CSSProperties, FormEvent, Fragment, useEffect, useState } from "react";
import { fetchAuthSession, signInWithRedirect, signOut } from "aws-amplify/auth";
import { createField, listFields } from "./adminApi";

type FieldItem = {
  FieldID: string;
  Name: string;
  Description?: string;
  Latitude?: number;
  Longitude?: number;
  File?: string;
  Thumbnail?: string;
  ThumbnailAlt?: string;
  markers?: unknown;
};

type AuthState = "checking" | "authed";

type MarkerForm = {
  icon: string;
  scale: string;
  posX: string;
  posY: string;
  posZ: string;
  text: string;
};

type MarkerPayload = [string, number, [number, number, number], string];

type FieldForm = {
  FieldID: string;
  Name: string;
  Description: string;
  File: string;
  Latitude: string;
  Longitude: string;
  Thumbnail: string;
  ThumbnailAlt: string;
  markers: MarkerForm[];
};

function createMarker(): MarkerForm {
  return {
    icon: "",
    scale: "",
    posX: "",
    posY: "",
    posZ: "",
    text: "",
  };
}

function createEmptyForm(): FieldForm {
  return {
    FieldID: "",
    Name: "",
    Description: "",
    File: "",
    Latitude: "",
    Longitude: "",
    Thumbnail: "",
    ThumbnailAlt: "",
    markers: [createMarker()],
  };
}

const modalFieldStyle: CSSProperties = {
  background: "#1b1b1b",
  color: "#fff",
  border: "1px solid #444",
  borderRadius: 4,
  padding: 8,
};

const modalTextareaStyle: CSSProperties = {
  ...modalFieldStyle,
  minHeight: 80,
};

const modalButtonStyle: CSSProperties = {
  background: "#333",
  color: "#fff",
  border: "1px solid #555",
  borderRadius: 4,
  padding: "8px 16px",
  cursor: "pointer",
};

export default function Admin() {
  const [authState, setAuthState] = useState<AuthState>("checking");

  const [items, setItems] = useState<FieldItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FieldForm>(() => createEmptyForm());

  // Auth gate: do not render portal until authenticated
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.accessToken?.toString();

        if (!token) {
          await signInWithRedirect();
          return;
        }

        if (!cancelled) setAuthState("authed");
      } catch {
        await signInWithRedirect();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function load() {
    setErr("");
    setBusy(true);
    try {
      const data = await listFields();
      setItems(data.items as FieldItem[]);
    } catch (e: any) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  // Only load data after authenticated
  useEffect(() => {
    if (authState !== "authed") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState]);

  function resetForm() {
    setForm(createEmptyForm());
  }

  function addMarker() {
    setForm((prev) => ({ ...prev, markers: [...prev.markers, createMarker()] }));
  }

  function removeMarker(index: number) {
    setForm((prev) => {
      if (prev.markers.length <= 1) return prev;
      return { ...prev, markers: prev.markers.filter((_, markerIndex) => markerIndex !== index) };
    });
  }

  function updateMarker(index: number, patch: Partial<MarkerForm>) {
    setForm((prev) => ({
      ...prev,
      markers: prev.markers.map((marker, markerIndex) => (markerIndex === index ? { ...marker, ...patch } : marker)),
    }));
  }

  async function onAdd(e?: FormEvent<HTMLFormElement>) {
    if (e) e.preventDefault();
    if (!form.FieldID.trim() || !form.Name.trim()) return;

    const payload: Parameters<typeof createField>[0] = {
      FieldID: form.FieldID.trim(),
      Name: form.Name.trim(),
    };

    if (form.Description.trim()) payload.Description = form.Description.trim();
    if (form.File.trim()) payload.File = form.File.trim();
    if (form.Thumbnail.trim()) payload.Thumbnail = form.Thumbnail.trim();
    if (form.ThumbnailAlt.trim()) payload.ThumbnailAlt = form.ThumbnailAlt.trim();

    const latValue = form.Latitude.trim();
    if (latValue) {
      const lat = Number(latValue);
      if (Number.isNaN(lat)) {
        setErr("Latitude must be a number.");
        return;
      }
      payload.Latitude = lat;
    }

    const lngValue = form.Longitude.trim();
    if (lngValue) {
      const lng = Number(lngValue);
      if (Number.isNaN(lng)) {
        setErr("Longitude must be a number.");
        return;
      }
      payload.Longitude = lng;
    }

    const markersPayload: MarkerPayload[] = [];
    for (let i = 0; i < form.markers.length; i++) {
      const marker = form.markers[i];
      const hasValues =
        marker.icon.trim() ||
        marker.scale.trim() ||
        marker.posX.trim() ||
        marker.posY.trim() ||
        marker.posZ.trim() ||
        marker.text.trim();
      if (!hasValues) continue;

      const markerLabel = `Marker #${i + 1}`;

      const icon = marker.icon.trim();
      if (!icon) {
        setErr(`${markerLabel}: Icon is required.`);
        return;
      }

      const scaleValue = marker.scale.trim();
      if (!scaleValue) {
        setErr(`${markerLabel}: Scale is required.`);
        return;
      }
      const scale = Number(scaleValue);
      if (Number.isNaN(scale)) {
        setErr(`${markerLabel}: Scale must be a number.`);
        return;
      }

      const positionStrings = [marker.posX.trim(), marker.posY.trim(), marker.posZ.trim()];
      if (positionStrings.some((value) => !value)) {
        setErr(`${markerLabel}: Position requires X, Y, and Z values.`);
        return;
      }
      const position = positionStrings.map((value) => Number(value));
      if (position.some((value) => Number.isNaN(value))) {
        setErr(`${markerLabel}: Position values must be numbers.`);
        return;
      }

      const text = marker.text.trim();
      if (!text) {
        setErr(`${markerLabel}: Text is required.`);
        return;
      }

      markersPayload.push([icon, scale, position as [number, number, number], text]);
    }
    if (markersPayload.length) payload.markers = markersPayload;

    setErr("");
    setBusy(true);
    try {
      const out = await createField(payload);
      setItems((prev) => [out.item as FieldItem, ...prev]);
      resetForm();
      setIsModalOpen(false);
    } catch (e: any) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await signOut();
    const domain = "ca-central-1vnlgrfo8k.auth.ca-central-1.amazoncognito.com";
    const clientId = "q7bro5cdr1ucb3g7c00d420q5";
    const logoutUri = "http://localhost:5173/";
    window.location.assign(
      `https://${domain}/logout?client_id=${encodeURIComponent(clientId)}&logout_uri=${encodeURIComponent(logoutUri)}`
    );
  }

  // While checking auth, render nothing (no flash)
  if (authState === "checking") {
    //return null;
    return <div style={{ padding: 24 }}>Redirecting to login…</div>;
  }

  // Authenticated portal
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Admin</h1>
        <button onClick={onLogout}>Log out</button>
      </div>

      <p>Authenticated ✅</p>
      {err && <pre style={{ color: "crimson" }}>{err}</pre>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => {
            resetForm();
            setErr("");
            setIsModalOpen(true);
          }}
        >
          Add Entry
        </button>
        <button onClick={load} disabled={busy}>
          Refresh
        </button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <table style={{ width: "100%", borderCollapse: "collapse", color: "#fff" }}>
        <thead>
          <tr>
            <th style={{ width: 40, borderBottom: "1px solid #333" }} />
            <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>FieldID</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Name</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const isExpanded = expanded.has(it.FieldID);
            const markersArray = Array.isArray(it.markers) ? (it.markers as MarkerPayload[]) : [];
            return (
              <Fragment key={it.FieldID}>
                <tr style={{ background: "#141414" }}>
                  <td style={{ borderBottom: "1px solid #222", padding: 8 }}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(it.FieldID)) next.delete(it.FieldID);
                          else next.add(it.FieldID);
                          return next;
                        })
                      }
                      style={{
                        width: 28,
                        height: 28,
                        border: "none",
                        cursor: "pointer",
                        fontSize: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#000",
                        color: "#fff",
                        padding: 0,
                      }}
                    >
                      {isExpanded ? "−" : "+"}
                    </button>
                  </td>
                  <td style={{ borderBottom: "1px solid #222", padding: 8 }}>{it.FieldID}</td>
                  <td style={{ borderBottom: "1px solid #222", padding: 8 }}>{it.Name}</td>
                </tr>
                {isExpanded && (
                  <tr style={{ background: "#0a0a0a" }}>
                    <td />
                    <td colSpan={2} style={{ borderBottom: "1px solid #333", padding: 16 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                        <div>
                          <strong>Latitude</strong>
                          <p style={{ margin: "4px 0 0" }}>{it.Latitude ?? "—"}</p>
                        </div>
                        <div>
                          <strong>Longitude</strong>
                          <p style={{ margin: "4px 0 0" }}>{it.Longitude ?? "—"}</p>
                        </div>
                        <div>
                          <strong>Description</strong>
                          <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{it.Description ?? "—"}</p>
                        </div>
                        <div>
                          <strong>File</strong>
                          <p style={{ margin: "4px 0 0" }}>{it.File ?? "—"}</p>
                        </div>
                        <div>
                          <strong>Thumbnail</strong>
                          <p style={{ margin: "4px 0 0" }}>{it.Thumbnail ?? "—"}</p>
                        </div>
                        <div>
                          <strong>Thumbnail Alt</strong>
                          <p style={{ margin: "4px 0 0" }}>{it.ThumbnailAlt ?? "—"}</p>
                        </div>
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <strong>Markers</strong>
                        {markersArray.length === 0 ? (
                          <p style={{ margin: "4px 0 0" }}>—</p>
                        ) : (
                          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 4 }}>Icon</th>
                                <th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 4 }}>Scale</th>
                                <th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 4 }}>Pos X</th>
                                <th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 4 }}>Pos Y</th>
                                <th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 4 }}>Pos Z</th>
                                <th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 4 }}>Text</th>
                              </tr>
                            </thead>
                            <tbody>
                              {markersArray.map((marker, idx) => (
                                <tr key={`${it.FieldID}-marker-${idx}`} style={{ background: "#111" }}>
                                  <td style={{ borderBottom: "1px solid #222", padding: 4 }}>
                                    {marker[0] ? (
                                      <img
                                        src={marker[0]}
                                        alt={`marker icon ${idx + 1}`}
                                        style={{ width: 32, height: 32, objectFit: "contain" }}
                                      />
                                    ) : (
                                      ""
                                    )}
                                  </td>
                                  <td style={{ borderBottom: "1px solid #222", padding: 4 }}>{marker[1] ?? ""}</td>
                                  <td style={{ borderBottom: "1px solid #222", padding: 4 }}>{marker[2]?.[0] ?? ""}</td>
                                  <td style={{ borderBottom: "1px solid #222", padding: 4 }}>{marker[2]?.[1] ?? ""}</td>
                                  <td style={{ borderBottom: "1px solid #222", padding: 4 }}>{marker[2]?.[2] ?? ""}</td>
                                  <td style={{ borderBottom: "1px solid #222", padding: 4 }}>{marker[3] ?? ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <div
            style={{
              background: "#050505",
              color: "#fff",
              padding: 24,
              borderRadius: 8,
              width: "min(720px, 95vw)",
              maxHeight: "90vh",
              overflow: "auto",
              border: "1px solid #222",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Add Entry</h2>
            <form onSubmit={onAdd} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input
                placeholder="FieldID (pk)"
                value={form.FieldID}
                style={modalFieldStyle}
                onChange={(e) => setForm((prev) => ({ ...prev, FieldID: e.target.value }))}
              />
              <input
                placeholder="Name"
                value={form.Name}
                style={modalFieldStyle}
                onChange={(e) => setForm((prev) => ({ ...prev, Name: e.target.value }))}
              />
              <input
                placeholder="File"
                value={form.File}
                style={modalFieldStyle}
                onChange={(e) => setForm((prev) => ({ ...prev, File: e.target.value }))}
              />
              <input
                placeholder="Thumbnail"
                value={form.Thumbnail}
                style={modalFieldStyle}
                onChange={(e) => setForm((prev) => ({ ...prev, Thumbnail: e.target.value }))}
              />
              <input
                placeholder="Thumbnail Alt Text"
                value={form.ThumbnailAlt}
                style={modalFieldStyle}
                onChange={(e) => setForm((prev) => ({ ...prev, ThumbnailAlt: e.target.value }))}
              />
              <input
                placeholder="Latitude"
                type="number"
                inputMode="decimal"
                step="any"
                value={form.Latitude}
                style={modalFieldStyle}
                onChange={(e) => setForm((prev) => ({ ...prev, Latitude: e.target.value }))}
              />
              <input
                placeholder="Longitude"
                type="number"
                inputMode="decimal"
                step="any"
                value={form.Longitude}
                style={modalFieldStyle}
                onChange={(e) => setForm((prev) => ({ ...prev, Longitude: e.target.value }))}
              />
              <textarea
                style={{ ...modalTextareaStyle, gridColumn: "1 / -1" }}
                placeholder="Description"
                value={form.Description}
                onChange={(e) => setForm((prev) => ({ ...prev, Description: e.target.value }))}
              />
              <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>Markers</h3>
                  <button type="button" style={modalButtonStyle} onClick={addMarker}>
                    Add Marker
                  </button>
                </div>
                {form.markers.map((marker, idx) => (
                  <div
                    key={`marker-${idx}`}
                    style={{
                      border: "1px solid #333",
                      borderRadius: 8,
                      padding: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      background: "#0f0f0f",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>Marker #{idx + 1}</strong>
                      {form.markers.length > 1 && (
                          <button
                            type="button"
                            style={{ ...modalButtonStyle, background: "#661818", border: "1px solid #993333" }}
                            onClick={() => removeMarker(idx)}
                          >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      placeholder="Icon (e.g. assets/icons/markerIcon1.png)"
                      style={modalFieldStyle}
                      value={marker.icon}
                      onChange={(e) => updateMarker(idx, { icon: e.target.value })}
                    />
                    <input
                      placeholder="Scale (e.g. 0.1)"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      style={modalFieldStyle}
                      value={marker.scale}
                      onChange={(e) => updateMarker(idx, { scale: e.target.value })}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      <input
                        placeholder="Position X"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        style={modalFieldStyle}
                        value={marker.posX}
                        onChange={(e) => updateMarker(idx, { posX: e.target.value })}
                      />
                      <input
                        placeholder="Position Y"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        style={modalFieldStyle}
                        value={marker.posY}
                        onChange={(e) => updateMarker(idx, { posY: e.target.value })}
                      />
                      <input
                        placeholder="Position Z"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        style={modalFieldStyle}
                        value={marker.posZ}
                        onChange={(e) => updateMarker(idx, { posZ: e.target.value })}
                      />
                    </div>
                    <textarea
                      placeholder="Marker text/description"
                      style={{ ...modalTextareaStyle, minHeight: 60 }}
                      value={marker.text}
                      onChange={(e) => updateMarker(idx, { text: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" style={modalButtonStyle} onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" style={modalButtonStyle} disabled={busy || !form.FieldID.trim() || !form.Name.trim()}>
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {busy && <p>Loading…</p>}
    </div>
  );
}
