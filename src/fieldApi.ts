const BASE = import.meta.env.VITE_API_URL as string | undefined;

export type ViewerMarkerPayload = {
  icon?: string;
  scale?: number;
  position?: { x?: number; y?: number; z?: number };
  text?: string;
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

const normalizeMarker = (raw: unknown): ViewerMarkerPayload | null => {
  const value = unwrapAttributeValue(raw);

  if (Array.isArray(value) && value.length >= 4) {
    const [iconRaw, scaleRaw, positionRaw, textRaw] = value;
    if (!Array.isArray(positionRaw) || positionRaw.length < 3) return null;
    const [x, y, z] = positionRaw.slice(0, 3).map(toFiniteNumber);
    if (x === undefined || y === undefined || z === undefined) return null;
    return {
      icon: toStringValue(iconRaw),
      scale: toFiniteNumber(scaleRaw),
      position: { x, y, z },
      text: toStringValue(textRaw),
    };
  }

  if (!isRecord(value)) return null;
  const pos = value.position ?? value.Position;
  let position: ViewerMarkerPayload["position"];

  if (Array.isArray(pos) && pos.length >= 3) {
    const [x, y, z] = pos.slice(0, 3).map(toFiniteNumber);
    if (x !== undefined && y !== undefined && z !== undefined) {
      position = { x, y, z };
    }
  } else if (isRecord(pos)) {
    const x = toFiniteNumber(pos.x ?? pos.X);
    const y = toFiniteNumber(pos.y ?? pos.Y);
    const z = toFiniteNumber(pos.z ?? pos.Z);
    if (x !== undefined && y !== undefined && z !== undefined) {
      position = { x, y, z };
    }
  }

  if (!position) return null;

  return {
    icon: toStringValue(value.icon ?? value.Icon),
    scale: toFiniteNumber(value.scale ?? value.Scale),
    position,
    text: toStringValue(value.text ?? value.Text),
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
