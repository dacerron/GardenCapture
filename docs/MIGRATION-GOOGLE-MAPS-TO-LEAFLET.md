# Migration: Google Maps → Leaflet (completed)

The map runs on **Leaflet** with **OpenStreetMap** tiles. There is no Google Maps API key or Google script loading.

This document records what was implemented, how it behaves today, and what changed during the **leaflet-migration** branch merges (including merge-conflict resolution).

---

## Current implementation (source of truth)

| Area | Details |
|------|---------|
| **Dependencies** | `leaflet` and dev `@types/leaflet` in `package.json`. `@types/google.maps` and `loadGoogleMaps.ts` are gone. |
| **Leaflet CSS** | Imported globally in `src/main.tsx`: `import "leaflet/dist/leaflet.css"`. |
| **Types** | `src/global.d.ts` only notes that the map uses Leaflet (no `Window.google`). |
| **Map component** | `src/UBCMap.tsx` — vanilla Leaflet (no `react-leaflet`). |
| **Pins data** | Fetched with `awsClient` from ``${import.meta.env.VITE_API_URL}/pins`` (GET). |
| **Map init** | `L.map` on the map container with center `UBC_CENTER` `[49.2606, -123.246]`, zoom `13`, default zoom control disabled; `L.control.zoom({ position: "topright" })`. |
| **Tiles** | `L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: … })`. |
| **Default marker icon** | PNGs imported from `leaflet/dist/images/` and `L.Marker.prototype.options.icon` set once (bundler-safe paths). |
| **Markers / popups** | One `L.marker` per pin; `buildPopupContent` builds a DOM tree (thumbnail, title, coordinates, **→ Enter**). `bindPopup(..., { className: "pin-popup", closeButton: false, maxWidth/minWidth: 280 })`. |
| **Popup chrome** | `src/index.css` targets `.leaflet-popup.pin-popup` to remove default padding/shadow/tip/close control so the custom card is the visible UI. |
| **Sidebar ↔ map** | `handlePinMenuClick` sets selection and uses `pendingPopupPinIndexRef` when the map is not yet created; after load, an effect calls `focusMarkerAndOpenPopup`. When the map already exists, focus runs immediately. |
| **Focus / offset** | `getOffsetCenter` + `map.setView(targetCenter, 15)` so the pin sits roughly in the lower third; `map.once("moveend", () => marker.openPopup())` opens the popup after the animated move. |
| **Map background click** | `map.on("click", …)` clears `selectedPinIndex` (no Google `InfoWindow` ref — Leaflet popups are per marker). |
| **Sizing** | `requestAnimationFrame` → `invalidateSize()` on init; `ResizeObserver` on the container (e.g. sidebar toggle) calls `invalidateSize()`. |
| **Cleanup** | Effect teardown removes markers, `map.remove()`, clears refs. |
| **3D viewer** | When `activeViewer` is set, `Viewer` is shown in `embeddedViewerOverlay` over the map pane (unchanged integration pattern). |

**Load behavior:** The map container mounts after the user clicks **Click to load map** (`mapLoaded` / `setMapLoaded`), matching the previous on-demand pattern.

---

## Merge conflict resolution (March 2026)

When **`main`** was merged into **`leaflet-migration`** (see merge commits around PR #21), conflicts were resolved in commit `61785b0` (“fixed merge conflict”).

### `src/UBCMap.tsx`

- **Conflict:** One side still had **Google Maps** map click handling: `mapRef.current.addListener("click", …)` and closing an **`infoWindowRef`**.
- **Resolution:** Use Leaflet’s API only: `map.on("click", () => { setSelectedPinIndex(null); })`. There is no separate `InfoWindow` instance in Leaflet the same way as in Google Maps; popups are tied to markers, and clearing selection on map background click does not require closing a shared info window ref.

### `package-lock.json`

- **Resolution:** Lockfile updates added **`"peer": true`** on various packages’ entries. That reflects **npm’s lockfile format** after reinstall/merge (peer dependency metadata), not an application logic change.

### Follow-up commits after the merge (same migration thread)

- **Remove leaflet popup shell** — Extra styles in `src/index.css` for `.pin-popup` so default Leaflet popup framing does not clash with the custom card.
- **Fix bug regarding clicking pin from menu** — Adjusted focusing/open-popup flow (`focusMarkerAndOpenPopup`, `pendingPopupPinIndexRef`) so choosing a location from the sidebar reliably opens the correct marker popup after pan/zoom.

---

## Historical reference: Google Maps → Leaflet API mapping

| Google Maps | Leaflet |
|-------------|---------|
| `google.maps.Map(div, options)` | `L.map(div, options)` + `L.tileLayer(url).addTo(map)` |
| `center: { lat, lng }`, `zoom: 13` | `map.setView([lat, lng], 13)` (Leaflet uses `[lat, lng]`) |
| `google.maps.Marker` | `L.marker([lat, lng]).addTo(map)` |
| `InfoWindow` | `marker.bindPopup(content)` or `L.popup()` |
| `map.panTo` / `setZoom` | `map.panTo`, `map.setZoom`, or `map.setView` |
| `google.maps.event.addListenerOnce(map, 'idle', …)` | `map.once('moveend', …)` / `map.whenReady()` |
| Script + API key | npm `leaflet` only; tiles load from OSM URL |

---

## Testing checklist (post-migration)

- [ ] Map loads after **Click to load map** (no Google script).
- [ ] OSM tiles and UBC-area center/zoom look correct.
- [ ] Pins match API positions.
- [ ] Pin click opens popup (thumbnail, title, coords, **→ Enter**).
- [ ] **→ Enter** opens the 3D viewer when `path` is set; popup closes appropriately.
- [ ] Sidebar location click pans/zooms and opens that pin’s popup (including when map was not loaded yet).
- [ ] Clicking empty map clears sidebar selection.
- [ ] `npm run build` succeeds; no `google` / `loadGoogleMaps` references.

---

## Rollback

Revert `UBCMap.tsx`, dependencies, `global.d.ts`, and env to the pre-Leaflet revision in git; reintroduce `VITE_GOOGLE_MAPS_API_KEY` and `loadGoogleMaps` if restoring Google Maps.

---

## Optional follow-ups

- **Tiles:** Swap `L.tileLayer` URL/attribution (e.g. Carto, Stadia) if OSM policies or style needs change.
- **react-leaflet:** Optional future refactor; not required for current behavior.
- **Fullscreen:** Add e.g. `leaflet.fullscreen` if you want a control like Google’s fullscreen.
