import * as pc from "playcanvas";

const SPLAT_FLIP_AXIS = pc.Vec3.RIGHT;

/** Legacy mkkellogg viewer: 180° about +X (`rotation: [1, 0, 0, 0]` xyzw). */
export const LEGACY_SPLAT_ORIENTATION_X = 180;

/**
 * Apply splat X rotation (degrees). Uses axis-angle quaternions — NOT euler angles,
 * because setLocalEulerAngles(180, 0, 0) is a gimbal singularity (no-op in PlayCanvas).
 *
 * Matches legacy mkkellogg `rotation: [1, 0, 0, 0]` (180° about +X, xyzw) at 180°.
 */
export function applySplatOrientationX(
  splatEntity: pc.Entity,
  orientationXDegrees: number,
): void {
  const normalized = ((orientationXDegrees % 360) + 360) % 360;
  if (normalized < 1e-6 || Math.abs(normalized - 360) < 1e-6) {
    splatEntity.setLocalRotation(pc.Quat.IDENTITY);
    return;
  }

  splatEntity.setLocalRotation(
    new pc.Quat().setFromAxisAngle(SPLAT_FLIP_AXIS, orientationXDegrees),
  );
}

/** Legacy mkkellogg viewer quaternion for 180° X (x, y, z, w). */
export function legacyMkKelloggSplatQuat(out = new pc.Quat()): pc.Quat {
  return out.set(1, 0, 0, 0);
}

export function applyLegacyMkKelloggSplatFlip(splatEntity: pc.Entity): void {
  splatEntity.setLocalRotation(legacyMkKelloggSplatQuat());
}
