import { normalizeMarkerLabel, type MarkerLabel } from "./markerLabel";

const BASE = import.meta.env.VITE_API_URL as string | undefined;

export type ViewerMarkerPayload = {
  icon?: string;
  scale?: number;
  position?: { x?: number; y?: number; z?: number };
  viewPosition?: { x?: number; y?: number; z?: number };
  label?: MarkerLabel;
};

export type Field = {
  FieldID: string;
  Name: string;
  Description?: string;
  LocationName?: string;
  Latitude?: number;
  Longitude?: number;
  Metadata?: unknown;
  Thumbnail?: string;
  ThumbnailAlt?: string;
  File?: string;
  markers?: ViewerMarkerPayload[];
  Markers?: ViewerMarkerPayload[];
  start_pos?: unknown;
};

type RawObject = Record<string, unknown>;

const isRecord = (value: unknown): value is RawObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const unwrapAttributeValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(unwrapAttributeValue);
  if (!isRecord(value)) return value;

  if ("S" in value) return value.S;
  if ("N" in value) return toFiniteNumber(value.N);
  if ("BOOL" in value) return value.BOOL;
  if ("NULL" in value) return null;
  if ("L" in value && Array.isArray(value.L)) return value.L.map(unwrapAttributeValue);
  if ("M" in value && isRecord(value.M)) return unwrapAttributeValue(value.M);

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, unwrapAttributeValue(entry)])
  );
};

const toStringValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizePosition = (raw: unknown): ViewerMarkerPayload["position"] | undefined => {
  if (Array.isArray(raw) && raw.length >= 3) {
    const [x, y, z] = raw.slice(0, 3).map(toFiniteNumber);
    if (x !== undefined && y !== undefined && z !== undefined) {
      return { x, y, z };
    }
  } else if (isRecord(raw)) {
    const x = toFiniteNumber(raw.x ?? raw.X);
    const y = toFiniteNumber(raw.y ?? raw.Y);
    const z = toFiniteNumber(raw.z ?? raw.Z);
    if (x !== undefined && y !== undefined && z !== undefined) {
      return { x, y, z };
    }
  }
  return undefined;
};

const deriveViewPosition = (position: NonNullable<ViewerMarkerPayload["position"]>) => ({
  x: position.x,
  y: (position.y ?? 0) + 2.5,
  z: (position.z ?? 0) + 5,
});

const normalizeMarker = (raw: unknown): ViewerMarkerPayload | null => {
  const value = unwrapAttributeValue(raw);

  if (Array.isArray(value) && value.length >= 3) {
    const [iconRaw, scaleRaw, positionRaw] = value;
    const position = normalizePosition(positionRaw);
    if (!position) return null;
    const isCurrentShape = value.length >= 5;
    const viewPosition = isCurrentShape ? normalizePosition(value[3]) : undefined;
    const labelRaw = isCurrentShape ? value[4] : value[3];
    return {
      icon: toStringValue(iconRaw),
      scale: toFiniteNumber(scaleRaw),
      position,
      viewPosition: viewPosition ?? deriveViewPosition(position),
      label: normalizeMarkerLabel(labelRaw),
    };
  }

  if (!isRecord(value)) return null;
  const position = normalizePosition(value.position ?? value.Position);
  if (!position) return null;
  const viewPosition = normalizePosition(
    value.viewPosition ?? value.ViewPosition ?? value.view_position
  );

  return {
    icon: toStringValue(value.icon ?? value.Icon),
    scale: toFiniteNumber(value.scale ?? value.Scale),
    position,
    viewPosition: viewPosition ?? deriveViewPosition(position),
    label: normalizeMarkerLabel(value.label ?? value.Label ?? value.text ?? value.Text),
  };
};

const normalizeMarkers = (raw: unknown): ViewerMarkerPayload[] => {
  const value = unwrapAttributeValue(raw);
  if (!Array.isArray(value)) return [];
  return value.map(normalizeMarker).filter(Boolean) as ViewerMarkerPayload[];
};

export const normalizeField = (raw: unknown): Field | null => {
  const unwrapped = unwrapAttributeValue(raw);
  const value = isRecord(unwrapped) && "item" in unwrapped ? unwrapAttributeValue(unwrapped.item) : unwrapped;
  if (!isRecord(value)) return null;

  const fieldId = toStringValue(value.FieldID);
  if (!fieldId) return null;

  const markers = normalizeMarkers(value.markers ?? value.Markers);

  return {
    FieldID: fieldId,
    Name: toStringValue(value.Name) ?? fieldId,
    Description: toStringValue(value.Description),
    LocationName: toStringValue(value.LocationName),
    Latitude: toFiniteNumber(value.Latitude),
    Longitude: toFiniteNumber(value.Longitude),
    Metadata: value.Metadata,
    Thumbnail: toStringValue(value.Thumbnail),
    ThumbnailAlt: toStringValue(value.ThumbnailAlt),
    File: toStringValue(value.File),
    markers,
    Markers: markers,
    start_pos: value.start_pos ?? value.StartPos ?? value.startPos,
  };
};

export async function fetchFields(): Promise<Field[]> {
  if (!BASE) {
    throw new Error("VITE_API_URL is not configured.");
  }

  const res = await fetch(`${BASE}/fields`, {
    method: "GET",
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Fields fetch failed: ${res.status} ${res.statusText}${raw ? `: ${raw}` : ""}`);
  }

  const raw = await res.json();
  const value = unwrapAttributeValue(raw);
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.items)
    ? value.items
    : [];

  return list.map(normalizeField).filter(Boolean) as Field[];
}

async function getFieldById(fieldId: string): Promise<Field | null> {
  if (!BASE) {
    throw new Error("VITE_API_URL is not configured.");
  }

  const res = await fetch(`${BASE}/fields/${encodeURIComponent(fieldId)}`, {
    method: "GET",
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Field fetch failed: ${res.status} ${res.statusText}${raw ? `: ${raw}` : ""}`);
  }

  const raw = await res.json();
  return normalizeField(raw);
}

export async function fetchFieldById(fieldId: string): Promise<Field | null> {
  const requested = fieldId.trim();
  const fields = await fetchFields();
  const listedField = fields.find((field) => field.FieldID === requested);

  if (!listedField) return null;

  const field = await getFieldById(listedField.FieldID);
  return field ?? listedField;
}
