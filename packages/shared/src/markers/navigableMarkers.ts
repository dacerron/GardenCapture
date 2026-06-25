import type { Field, MarkerVector, ViewerMarkerPayload } from "../types/fields";
import { normalizeMarkerLabel } from "../types/markerLabel";
import { deriveViewPosition, normalizeVector, parseMarkers } from "../utils/markers";

export type NavigableMarker = {
  position: MarkerVector;
  viewPosition: MarkerVector;
  title: string;
  description: string;
  icon?: string;
  /** World-space marker radius (matches legacy Three.js sprite scale / 2). */
  radius?: number;
};

export function getFieldMarkerPayloads(field: Field): ViewerMarkerPayload[] {
  const raw = field.markers ?? field.Markers;
  if (!raw) return [];

  if (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
  ) {
    return raw as ViewerMarkerPayload[];
  }

  return parseMarkers(raw);
}

export function toNavigableMarkers(markers: ViewerMarkerPayload[]): NavigableMarker[] {
  return markers.flatMap((marker) => {
    const position = normalizeVector(marker.position);
    if (!position) return [];

    const viewPosition = normalizeVector(marker.viewPosition) ?? deriveViewPosition(position);
    const [title, description] = normalizeMarkerLabel(marker.label);

    return [
      {
        position,
        viewPosition,
        title,
        description,
        icon: marker.icon,
        radius:
          typeof marker.scale === "number" && Number.isFinite(marker.scale)
            ? marker.scale
            : undefined,
      },
    ];
  });
}

export function getNavigableMarkersFromField(field: Field): NavigableMarker[] {
  return toNavigableMarkers(getFieldMarkerPayloads(field));
}
