import type { Field, Pin } from "../types/fields";

/** Legacy Three.js / `.ksplat` splat URL from DynamoDB `File`. */
export function getFieldLegacySplatUrl(field: Pick<Field, "File">): string {
  return field.File?.trim() ?? "";
}

/** PlayCanvas streamed LOD or SOG URL from DynamoDB `FilePlayCanvas`. */
export function getFieldPlayCanvasSplatUrl(field: Pick<Field, "FilePlayCanvas">): string {
  return field.FilePlayCanvas?.trim() ?? "";
}

/** Scene URL for the PlayCanvas editor/viewer (prefers `FilePlayCanvas`). */
export function resolvePlayCanvasSceneUrl(
  field: Pick<Field, "File" | "FilePlayCanvas">,
): string {
  return getFieldPlayCanvasSplatUrl(field) || getFieldLegacySplatUrl(field);
}

/** Scene URL for the legacy Three.js editor (`.ksplat` only). */
export function resolveLegacyEditorSceneUrl(field: Pick<Field, "File">): string {
  return getFieldLegacySplatUrl(field);
}

/** Pin shape for the admin editor scene picker (matches public `/pins` API). */
export function fieldToEditorPin(field: Field): Pin {
  return {
    title: field.Name || field.FieldID,
    path: getFieldLegacySplatUrl(field) || undefined,
    FilePlayCanvas: getFieldPlayCanvasSplatUrl(field) || undefined,
    FileFormat: field.FileFormat,
    start_pos: field.start_pos,
    markers: field.markers ?? [],
  };
}

export function pinHasPlayCanvasAsset(pin: Pick<Pin, "FilePlayCanvas">): boolean {
  return Boolean(pin.FilePlayCanvas?.trim());
}
