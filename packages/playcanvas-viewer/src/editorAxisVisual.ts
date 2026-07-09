// @ts-nocheck
import * as pc from "playcanvas";

export const START_AXIS_LENGTH = 0.75;
export const GIZMO_AXIS_LENGTH = 0.5;
/** Uniform scale for in-scene translate gizmos (marker + start position). */
export const GIZMO_VISUAL_SCALE = 0.75;
export const AXIS_THICKNESS = 0.02;
export const ARROW_TIP_LENGTH = 0.1;
export const ARROW_TIP_RADIUS = 0.034;
export const PLANE_HANDLE_SIZE = 0.16;
export const PLANE_HANDLE_THICKNESS = 0.004;

export type PlaneHandle = "xy" | "xz" | "yz";

export type RgbAxisRootOptions = {
  thickness?: number;
  /** Pyramid arrow heads at the positive end of each axis. */
  arrowTips?: boolean;
  /** Render shafts/tips at reduced opacity until hovered (gizmo only). */
  translucentShafts?: boolean;
  /** Square handles for XY / XZ / YZ plane dragging (gizmo only). */
  planeHandles?: boolean;
};

export type RgbAxisPart = {
  shaft: pc.Entity;
  tip: pc.Entity | null;
};

export type RgbAxisRoot = {
  root: pc.Entity;
  axes: { x: RgbAxisPart; y: RgbAxisPart; z: RgbAxisPart };
  center: pc.Entity;
  planes: Record<PlaneHandle, pc.Entity> | null;
};

export const GIZMO_IDLE_OPACITY = 0.42;
export const GIZMO_HOVER_OPACITY = 1;

function createAxisMaterial(color: pc.Color, translucent: boolean) {
  const material = new pc.StandardMaterial();
  material.diffuse.copy(color);
  material.emissive.copy(color);
  material.useLighting = false;
  if (translucent) {
    material.opacity = GIZMO_IDLE_OPACITY;
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
    // Thin shafts are hard to see from one side with back-face culling enabled.
    material.cull = pc.CULLFACE_NONE;
  }
  material.update();
  return material;
}

export function createAxisEntity(
  name: string,
  color: pc.Color,
  localPosition: [number, number, number],
  localScale: [number, number, number],
  translucent = false,
): pc.Entity {
  const entity = new pc.Entity(name);
  const material = createAxisMaterial(color, translucent);

  entity.addComponent("render", {
    type: "box",
    material,
  });
  entity.setLocalPosition(...localPosition);
  entity.setLocalScale(...localScale);
  return entity;
}

function createArrowTipEntity(
  name: string,
  color: pc.Color,
  localPosition: [number, number, number],
  localEulerAngles: [number, number, number],
  translucent: boolean,
): pc.Entity {
  const entity = new pc.Entity(name);
  const material = createAxisMaterial(color, translucent);
  entity.addComponent("render", {
    type: "cone",
    material,
  });
  entity.setLocalPosition(...localPosition);
  entity.setLocalEulerAngles(...localEulerAngles);
  entity.setLocalScale(
    ARROW_TIP_RADIUS * 2,
    ARROW_TIP_LENGTH,
    ARROW_TIP_RADIUS * 2,
  );
  return entity;
}

function createPlaneHandleEntity(
  name: string,
  color: pc.Color,
  localPosition: [number, number, number],
  localScale: [number, number, number],
  translucent: boolean,
): pc.Entity {
  return createAxisEntity(name, color, localPosition, localScale, translucent);
}

function addPlaneHandles(
  root: pc.Entity,
  planeSize: number,
  thickness: number,
  translucent: boolean,
): Record<PlaneHandle, pc.Entity> {
  const half = planeSize / 2;
  const colorXy = new pc.Color(0.45, 0.65, 1);
  const colorXz = new pc.Color(0.35, 0.9, 0.45);
  const colorYz = new pc.Color(1, 0.45, 0.45);

  const planeXy = createPlaneHandleEntity(
    "plane-xy",
    colorXy,
    [half, half, 0],
    [planeSize, planeSize, thickness],
    translucent,
  );
  const planeXz = createPlaneHandleEntity(
    "plane-xz",
    colorXz,
    [half, 0, half],
    [planeSize, thickness, planeSize],
    translucent,
  );
  const planeYz = createPlaneHandleEntity(
    "plane-yz",
    colorYz,
    [0, half, half],
    [thickness, planeSize, planeSize],
    translucent,
  );

  root.addChild(planeXy);
  root.addChild(planeXz);
  root.addChild(planeYz);

  return { xy: planeXy, xz: planeXz, yz: planeYz };
}

function addAxisPart(
  root: pc.Entity,
  shaft: pc.Entity,
  tip: pc.Entity | null,
): RgbAxisPart {
  root.addChild(shaft);
  if (tip) root.addChild(tip);
  return { shaft, tip };
}

export function createRgbAxisRoot(
  name: string,
  axisLength: number,
  options: RgbAxisRootOptions = {},
): RgbAxisRoot {
  const {
    thickness = AXIS_THICKNESS,
    arrowTips = false,
    translucentShafts = false,
    planeHandles = false,
  } = options;
  const root = new pc.Entity(name);
  const shaftLength = arrowTips ? axisLength - ARROW_TIP_LENGTH : axisLength;
  const shaftHalf = shaftLength / 2;
  const tipCenter = axisLength - ARROW_TIP_LENGTH * 0.5;

  const colorX = new pc.Color(1, 0.2, 0.2);
  const colorY = new pc.Color(0.2, 1, 0.2);
  const colorZ = new pc.Color(0.35, 0.55, 1);

  const axisX = createAxisEntity(
    "axis-x",
    colorX,
    [shaftHalf, 0, 0],
    [shaftLength, thickness, thickness],
    translucentShafts,
  );
  const axisY = createAxisEntity(
    "axis-y",
    colorY,
    [0, shaftHalf, 0],
    [thickness, shaftLength, thickness],
    translucentShafts,
  );
  const axisZ = createAxisEntity(
    "axis-z",
    colorZ,
    [0, 0, shaftHalf],
    [thickness, thickness, shaftLength],
    translucentShafts,
  );

  const tipX = arrowTips
    ? createArrowTipEntity(
        "axis-x-tip",
        colorX,
        [tipCenter, 0, 0],
        [0, 0, -90],
        translucentShafts,
      )
    : null;
  const tipY = arrowTips
    ? createArrowTipEntity(
        "axis-y-tip",
        colorY,
        [0, tipCenter, 0],
        [0, 0, 0],
        translucentShafts,
      )
    : null;
  const tipZ = arrowTips
    ? createArrowTipEntity(
        "axis-z-tip",
        colorZ,
        [0, 0, tipCenter],
        [90, 0, 0],
        translucentShafts,
      )
    : null;

  const center = new pc.Entity("axis-center");
  const centerMaterial = createAxisMaterial(new pc.Color(0.9, 0.9, 0.9), translucentShafts);
  center.addComponent("render", {
    type: "sphere",
    material: centerMaterial,
  });
  center.setLocalScale(thickness * 4, thickness * 4, thickness * 4);
  root.addChild(center);

  const planes = planeHandles
    ? addPlaneHandles(root, PLANE_HANDLE_SIZE, PLANE_HANDLE_THICKNESS, translucentShafts)
    : null;

  return {
    root,
    axes: {
      x: addAxisPart(root, axisX, tipX),
      y: addAxisPart(root, axisY, tipY),
      z: addAxisPart(root, axisZ, tipZ),
    },
    center,
    planes,
  };
}

/** Collect every pickable render entity from an axis root. */
export function collectRgbAxisPickParts(gizmo: RgbAxisRoot): pc.Entity[] {
  const parts: pc.Entity[] = [];
  if (gizmo.planes) {
    parts.push(gizmo.planes.xy, gizmo.planes.xz, gizmo.planes.yz);
  }
  for (const axis of ["x", "y", "z"] as const) {
    parts.push(gizmo.axes[axis].shaft);
    if (gizmo.axes[axis].tip) parts.push(gizmo.axes[axis].tip);
  }
  parts.push(gizmo.center);
  return parts;
}

/**
 * View depth where translate gizmos match their fixed local axis length × visual scale
 * (calibrated for typical editor orbit distance).
 */
export const GIZMO_REFERENCE_VIEW_DEPTH = 6;

/** Camera view-space depth (positive along forward axis), matching PlayCanvas annotations. */
export function getCameraViewDepth(
  cameraEntity: pc.Entity,
  worldPosition: pc.Vec3,
  out = new pc.Vec3(),
): number {
  const camera = cameraEntity.camera;
  if (!camera) return GIZMO_REFERENCE_VIEW_DEPTH;
  camera.viewMatrix.transformPoint(worldPosition, out);
  return Math.max(-out.z, 0.001);
}

/** Scale factor so gizmos shrink when the camera is close and grow when it moves away. */
export function computeGizmoDistanceScale(viewDepth: number): number {
  return viewDepth / GIZMO_REFERENCE_VIEW_DEPTH;
}
