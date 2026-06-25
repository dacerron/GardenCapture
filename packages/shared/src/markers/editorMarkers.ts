import type { MarkerPayload } from "../types/fields";
import type { MarkerLabel } from "../types/markerLabel";
import { normalizeMarkerLabel } from "../types/markerLabel";
import { toNumberOrNull } from "../utils/numbers";
import type { NavigableMarker } from "./navigableMarkers";

export type EditorMarker = {
  position: [number, number, number];
  viewPosition: [number, number, number];
  radius?: number;
  label?: MarkerLabel;
  icon?: string;
};

export const DEFAULT_MARKER_ICON = "/assets/icons/markerIcon1.png";
export const DEFAULT_MARKER_RADIUS = 0.25;

export function deriveViewPosition(position: [number, number, number]): [number, number, number] {
  return [position[0], position[1] + 2.5, position[2] + 5];
}

function parseVector(raw: unknown): [number, number, number] | null {
  if (Array.isArray(raw) && raw.length >= 3) {
    const x = toNumberOrNull(raw[0]);
    const y = toNumberOrNull(raw[1]);
    const z = toNumberOrNull(raw[2]);
    if (x !== null && y !== null && z !== null) return [x, y, z];
  }

  if (raw && typeof raw === "object") {
    const value = raw as { x?: unknown; y?: unknown; z?: unknown };
    const x = toNumberOrNull(value.x);
    const y = toNumberOrNull(value.y);
    const z = toNumberOrNull(value.z);
    if (x !== null && y !== null && z !== null) return [x, y, z];
  }

  return null;
}

export function backendMarkersToEditorMarkers(
  raw: unknown[] | undefined,
  currentCameraPosition?: [number, number, number] | null,
): EditorMarker[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!Array.isArray(entry) || entry.length < 3) return null;
      const [icon, scale] = entry;
      const position = parseVector(entry[2]);
      if (!position) return null;
      const isCurrentShape = entry.length >= 5;
      const viewPosition =
        (isCurrentShape ? parseVector(entry[3]) : null) ??
        currentCameraPosition ??
        deriveViewPosition(position);
      return {
        position,
        viewPosition,
        radius: typeof scale === "number" && Number.isFinite(scale) ? scale : undefined,
        label: normalizeMarkerLabel(isCurrentShape ? entry[4] : entry[3]),
        icon: typeof icon === "string" ? icon : undefined,
      };
    })
    .filter(Boolean) as EditorMarker[];
}

export function editorMarkersToBackend(markers: EditorMarker[]): MarkerPayload[] {
  return markers.map((marker) => {
    const [xRaw, yRaw, zRaw] = marker.position;
    const normalizedPosition: [number, number, number] = [
      Number.isFinite(xRaw) ? xRaw : 0,
      Number.isFinite(yRaw) ? yRaw : 0,
      Number.isFinite(zRaw) ? zRaw : 0,
    ];
    const normalizedViewPosition: [number, number, number] = marker.viewPosition.map(
      (value, index) =>
        Number.isFinite(value) ? value : deriveViewPosition(normalizedPosition)[index],
    ) as [number, number, number];
    const radius =
      typeof marker.radius === "number" && Number.isFinite(marker.radius) ? marker.radius : DEFAULT_MARKER_RADIUS;
    const icon = marker.icon?.trim() ? marker.icon : DEFAULT_MARKER_ICON;
    return [icon, radius, normalizedPosition, normalizedViewPosition, normalizeMarkerLabel(marker.label)];
  });
}

export function cloneEditorMarkers(markers: EditorMarker[]): EditorMarker[] {
  return markers.map((marker) => ({
    ...marker,
    position: [...marker.position] as [number, number, number],
    viewPosition: [...marker.viewPosition] as [number, number, number],
    label: normalizeMarkerLabel(marker.label),
  }));
}

export function editorMarkersToNavigable(markers: EditorMarker[]): NavigableMarker[] {
  return markers.map((marker, index) => {
    const [title, description] = normalizeMarkerLabel(marker.label);
    return {
      position: marker.position,
      viewPosition: marker.viewPosition,
      title: title || `Marker ${index + 1}`,
      description,
      icon: marker.icon,
      radius: marker.radius,
    };
  });
}
