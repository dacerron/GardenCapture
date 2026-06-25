import { toNumberOrNull } from "../utils/numbers";

export function formatCoordinateForInput(value: number | undefined): string {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return numericValue.toFixed(2);
}

export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isCoordinateDraft(value: string): boolean {
  return /^-?\d*(?:\.\d*)?$/.test(value.trim());
}

export function parseCoordinateDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return toNumberOrNull(trimmed);
}
