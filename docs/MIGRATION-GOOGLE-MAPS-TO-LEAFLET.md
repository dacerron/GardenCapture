# Migration plan: Google Maps → Leaflet

This document outlines the steps to replace Google Maps with Leaflet and OpenStreetMap so the app no longer depends on a Google API key or paid tiles.

**Phase 1 and Phase 2 are done.** The map uses Leaflet + OpenStreetMap; markers and popups work; sidebar click pans/zooms and opens the popup.

---

## Current Google Maps usage (summary)

| Feature | Where | Notes |
|--------|--------|--------|
| Script loading | `loadGoogleMaps.ts` | Loads Maps JS API with `VITE_GOOGLE_MAPS_API_KEY` |
| Map instance | `UBCMap.tsx` | `google.maps.Map` with center (49.2606, -123.246), zoom 13, terrain, no street view, fullscreen |
| Markers | `UBCMap.tsx` | One `google.maps.Marker` per pin; `pinToMarkerRef` maps pin index → marker |
| Popup / InfoWindow | `UBCMap.tsx` | Custom HTML: image, title, coords, description, “Open 3D Viewer” button; open on marker click |
| Pan/zoom from sidebar | `UBCMap.tsx` | `handlePinMenuClick`: panTo → setZoom → panToWithOffset → trigger marker click |
| Pan with offset | `UBCMap.tsx` | `panToWithOffset`: move map so pin sits in lower third (room for popup) |
| Cleanup | `UBCMap.tsx` | On unmount / deps: remove markers, close InfoWindow, null map |
| Types | `global.d.ts` | `Window.google`; `@types/google.maps` in package.json |

---

## Leaflet equivalents

| Google Maps | Leaflet |
|-------------|---------|
| `google.maps.Map(div, options)` | `L.map(div, options)` then `L.tileLayer(url).addTo(map)` |
| `center: { lat, lng }`, `zoom: 13` | `map.setView([lat, lng], 13)` (Leaflet uses `[lat, lng]`) |
| `google.maps.Marker({ position, map, title })` | `L.marker([lat, lng]).addTo(map).bindPopup(content)` or `.on('click', fn)` |
| `google.maps.InfoWindow({ content })` + `open(anchor: marker)` | `L.Popup` via `marker.bindPopup(htmlContent, options)` or `L.popup().setContent().setLatLng().openOn(map)` |
| `map.panTo(latLng)` | `map.panTo([lat, lng])` |
| `map.setZoom(15)` | `map.setZoom(15)` |
| `map.getBounds()` | `map.getBounds()` → `getNorth()`, `getSouth()`, `getEast()`, `getWest()` |
| `marker.getPosition().lat()/.lng()` | `marker.getLatLng().lat`, `.lng` |
| “idle” after pan/zoom | `map.whenReady()` or `map.once('moveend', fn)` |
| `marker.addListener('click', fn)` | `marker.on('click', fn)` |
| Trigger marker click | Store popup open logic and call it, or use a single popup and `popup.setContent().setLatLng(marker.getLatLng()).openOn(map)` |

No script tag needed: Leaflet is an npm dependency and is bundled; no API key.

---

## Implementation approach

Use **vanilla Leaflet** inside the existing `UBCMap` component (same pattern as now: one `useEffect` that creates the map and markers when `mapLoaded` and `pins` are ready). This avoids introducing `react-leaflet` and keeps the current “load on demand” and “click to load map” behaviour.

---

## Step-by-step plan

### Phase 1: Dependencies and cleanup

1. **Install Leaflet and types**
   - `npm install leaflet`
   - `npm install -D @types/leaflet`
   - Add Leaflet CSS in the component or in `index.html` / root CSS: `import 'leaflet/dist/leaflet.css'` (e.g. in `UBCMap.tsx` or `main.tsx`).

2. **Remove Google Maps dependency**
   - Remove `@types/google.maps` from `package.json` devDependencies.
   - Delete `src/lib/loadGoogleMaps.ts` (no longer used).
   - In `src/global.d.ts`, remove the `/// <reference types="google.maps" />` and the `google?: typeof google` from `Window`. Keep the file if it has other declarations, or remove the file if it only existed for Google.

3. **Env and docs**
   - Remove `VITE_GOOGLE_MAPS_API_KEY` from any `.env` / `.env.example` and from docs (e.g. PROJECT.md, README) that mention it.
   - Optional: add a short note in README that the map uses Leaflet and OpenStreetMap (no API key required).

---

### Phase 2: Map and tile layer in UBCMap

4. **Imports and refs**
   - In `UBCMap.tsx`: remove `loadGoogleMaps` import.
   - Import Leaflet: `import L from 'leaflet'` and ensure Leaflet CSS is imported (e.g. `import 'leaflet/dist/leaflet.css'` at top of `UBCMap.tsx` or in `main.tsx`).
   - Replace refs:
     - `mapRef` → `useRef<L.Map | null>(null)`.
     - `markersRef` → `useRef<L.Marker[]>([])`.
     - `pinToMarkerRef` → `useRef<Map<number, L.Marker>>(new Map())`.
   - Remove `infoWindowRef` (popups will be bound to markers; optionally keep one ref for a single shared popup if you prefer).

5. **Map creation (no async script)**
   - In the same `useEffect` that currently runs when `mapLoaded` and `pins` are ready:
     - Remove `await loadGoogleMaps()`.
     - If `!mapRef.current` and `containerRef.current`:
       - `mapRef.current = L.map(containerRef.current, { ... })` with options like `center: [49.2606, -123.246]`, `zoom: 13`, `zoomControl: true` (and optionally move zoom control to a corner).
       - Add a tile layer: `L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '...' }).addTo(map)`.
     - Use `L.setView` if you create the map without initial center/zoom in the constructor.
   - Ensure the map container has a height (e.g. `.mapFrame { height: 100%; }` in CSS) so Leaflet can size correctly.

6. **Default marker icon (optional but recommended)**
   - Leaflet has a known issue with default marker icons when using bundlers (wrong path). Fix by setting the default icon:
     - `import icon from 'leaflet/dist/images/marker-icon.png';` (and optionally `iconShadow`) and set `L.Marker.prototype.options.icon = L.icon({ iconUrl: icon, ... })` once when the map is first created, or use a small inline/base64 icon so you don’t depend on asset paths.

---

### Phase 3: Markers and popups

7. **Create markers and attach popups**
   - Cleanup: clear `markersRef.current` and `pinToMarkerRef.current` and remove existing layers from the map (e.g. `markersRef.current.forEach(m => map.removeLayer(m))`).
   - For each pin:
     - `const marker = L.marker([pin.position.lat, pin.position.lng]).addTo(mapRef.current!)`.
     - Build the same popup content as today (image, title, coords, description, “Open 3D Viewer” button) as an HTML string or `HTMLElement`.
     - Either:
       - **Option A:** `marker.bindPopup(content, { maxWidth: 480, ... }).on('click', () => { setSelectedPinIndex(index); ... })` and use one popup per marker; or
       - **Option B:** Use a single `L.Popup` instance, and on marker click set its content and `setLatLng(marker.getLatLng()).openOn(map)` (and track selected pin index).
     - For “Open 3D Viewer” inside the popup: use a data attribute or a closure so the button’s click handler calls `openViewer(pin.path, pin.markers)` and optionally closes the popup. If you build the content as a string, you’ll need to use event delegation (e.g. listen for click on popup container and check `e.target` or a data-pin-index).
     - Push `marker` to `markersRef.current` and `pinToMarkerRef.current.set(index, marker)`.

8. **Popup content**
   - Reuse the same structure and styles as the current InfoWindow (image div, title, coords, description, button). You can build an HTML string with template literals, or create elements and pass the container to `bindPopup(container)`. If using a string, ensure any user content is escaped to avoid XSS.

9. **Close popup when opening viewer**
   - When the user clicks “Open 3D Viewer”, close the current popup: e.g. `marker.closePopup()` or, with a single shared popup, `popupRef.current?.close()`.

---

### Phase 4: Pan, zoom, and “sidebar click” behaviour

10. **panToWithOffset**
    - Rewrite for Leaflet: get `map.getBounds()`; compute north/south/east/west; compute offset so the pin sits in the lower third (e.g. offset center lat so the pin’s lat is at 1/3 from bottom); call `map.panTo([offsetLat, lng])`. Leaflet uses `[lat, lng]` and `LatLng` has `.lat` and `.lng` properties.

11. **handlePinMenuClick**
    - When map isn’t loaded: `setMapLoaded(true)` and wait for the map and markers to exist (e.g. short polling or `setTimeout`), then:
      - Get `marker = pinToMarkerRef.current.get(index)` and `map = mapRef.current`.
      - `map.panTo(marker.getLatLng())`.
      - Use `map.once('moveend', () => { map.setZoom(15); map.once('moveend', () => { panToWithOffset(...); map.once('moveend', () => { marker.openPopup(); /* or trigger click */ }); }); })` to sequence pan → zoom → offset pan → open popup (or fire the same logic as marker click).
    - When map is already loaded: same sequence (zoom to 15, then pan with offset, then open popup / trigger marker click).
    - Replace `google.maps.event.addListenerOnce(map, 'idle', ...)` with `map.once('moveend', ...)` (and optionally `map.once('zoomend', ...)` if you need zoom to finish first).

12. **Trigger “marker click” from sidebar**
    - Easiest: call `marker.openPopup()` so the same popup appears. If you need to run the same handler as a real click (e.g. to set `selectedPinIndex`), call that handler explicitly or dispatch a synthetic click; otherwise opening the popup is enough.

---

### Phase 5: Cleanup and types

13. **Effect cleanup**
    - In the effect’s return: remove all markers from the map (`markersRef.current.forEach(m => map.removeLayer(m))`), clear arrays/maps, close any popup, call `mapRef.current?.remove()` to destroy the map, set `mapRef.current = null`.

14. **TypeScript**
    - Remove all `google.maps.*` types. Use `L.Map`, `L.Marker`, `L.LatLng`, `L.Popup`, `L.Bounds` from `leaflet` where needed. Fix any type errors (e.g. event types from `leaflet`).

15. **Vite proxy (optional)**
    - If you had a dev proxy for Google Maps, remove it from `vite.config.ts`. No proxy is needed for OSM tiles (they are loaded from `tile.openstreetmap.org` by default).

---

## Files to change (checklist)

| File | Action |
|------|--------|
| `package.json` | Add `leaflet`; add `@types/leaflet`; remove `@types/google.maps`. |
| `src/lib/loadGoogleMaps.ts` | Delete. |
| `src/global.d.ts` | Remove Google Maps reference and `Window.google`. |
| `src/UBCMap.tsx` | Full rework: Leaflet import + CSS; map init; tile layer; markers + popups; panToWithOffset; handlePinMenuClick; cleanup. |
| `src/index.css` or `main.tsx` | Ensure Leaflet CSS is imported (e.g. in `UBCMap.tsx`: `import 'leaflet/dist/leaflet.css'`). |
| `vite.config.ts` | Remove `/pins` → localhost proxy if it was only for Maps; keep if still used for API. (No Google-specific proxy to remove unless you had one.) |
| `.env` / `.env.example` | Remove `VITE_GOOGLE_MAPS_API_KEY`. |
| `docs/PROJECT.md` (or README) | Update “Map” section to say Leaflet + OSM; remove Google Maps / API key mentions. |

---

## Testing checklist

- [ ] Map loads when user clicks “Click to load map” (no Google script).
- [ ] Map shows OSM tiles; center and zoom are correct (UBC area).
- [ ] Pins appear at correct lat/lng.
- [ ] Clicking a pin opens the popup with image, title, coords, description, and “Open 3D Viewer” button.
- [ ] “Open 3D Viewer” opens the viewer and closes the popup (or navigates as today).
- [ ] Clicking a location in the sidebar pans/zooms to the pin and opens its popup.
- [ ] Fullscreen (if you keep it) works; Leaflet has a fullscreen plugin or you can rely on browser fullscreen.
- [ ] No console errors; no references to `google` or `loadGoogleMaps`.
- [ ] Build succeeds (`npm run build`); no missing types for `google`.

---

## Rollback

If you need to rollback: re-add `@types/google.maps` and `loadGoogleMaps.ts`, restore `UBCMap.tsx` and `global.d.ts` from git, and re-add `VITE_GOOGLE_MAPS_API_KEY` to env. Keeping a branch or tag before the migration is recommended.

---

## Optional follow-ups

- **Tile provider:** You can switch to another free tile URL (e.g. Carto, Stadia) by changing the `L.tileLayer` URL and attribution.
- **react-leaflet:** If you later want a more “React” approach, you can refactor to use `react-leaflet` components; the plan above does not require it.
- **Fullscreen:** Use something like `leaflet.fullscreen` if you want a fullscreen control similar to Google’s.
