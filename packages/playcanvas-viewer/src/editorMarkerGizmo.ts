// @ts-nocheck
import * as pc from "playcanvas";
import {
  collectRgbAxisPickParts,
  createRgbAxisRoot,
  GIZMO_AXIS_LENGTH,
  GIZMO_VISUAL_SCALE,
  GIZMO_HOVER_OPACITY,
  GIZMO_IDLE_OPACITY,
  type PlaneHandle,
  type RgbAxisPart,
} from "./editorAxisVisual";
import { assignRenderLayerRecursive } from "./editorOverlayLayer";
import type { CameraControlHooks } from "./cameraInputGate";
import { DEFAULT_MARKER_RADIUS } from "@soil/shared/markers/editorMarkers";

export type MarkerEditHandlers = {
  onChange?: (position: [number, number, number]) => void;
  onCommit?: (position: [number, number, number]) => void;
};

export type EditorMarkerGizmoHandle = {
  setEditing(
    active: boolean,
    position: [number, number, number] | null,
    handlers?: MarkerEditHandlers,
    radius?: number,
  ): void;
  /** Keep the gizmo visible but disable hover/drag (e.g. while another gizmo is active). */
  setInteractive(interactive: boolean): void;
  setPosition(position: [number, number, number]): void;
  setRadius(radius: number): void;
  destroy(): void;
};

type DragMode = "x" | "y" | "z" | "free" | PlaneHandle;

const PLANE_NORMALS: Record<PlaneHandle, pc.Vec3> = {
  xy: new pc.Vec3(0, 0, 1),
  xz: new pc.Vec3(0, 1, 0),
  yz: new pc.Vec3(1, 0, 0),
};

const isPlaneDragMode = (mode: DragMode): mode is PlaneHandle =>
  mode === "xy" || mode === "xz" || mode === "yz";

type ScreenPoint = { x: number; y: number };

const HOVER_SCALE = 1.16;
const HOVER_TIP_PICK_SLOP = 1.5;

function screenToRay(cameraEntity: pc.Entity, screenX: number, screenY: number) {
  const camera = cameraEntity.camera;
  const near = new pc.Vec3();
  const far = new pc.Vec3();
  camera.screenToWorld(screenX, screenY, camera.nearClip, near);
  camera.screenToWorld(screenX, screenY, camera.farClip, far);
  const direction = new pc.Vec3().sub2(far, near).normalize();
  return new pc.Ray(near, direction);
}

function rayPlaneIntersection(
  ray: pc.Ray,
  planePoint: pc.Vec3,
  planeNormal: pc.Vec3,
) {
  const denom = ray.direction.dot(planeNormal);
  if (Math.abs(denom) < 1e-5) return null;
  const t = planePoint.clone().sub(ray.origin).dot(planeNormal) / denom;
  if (t < 0) return null;
  return ray.origin.clone().add(ray.direction.clone().mulScalar(t));
}

function projectOntoAxis(point: pc.Vec3, axisOrigin: pc.Vec3, axisDir: pc.Vec3) {
  const axis = axisDir.clone().normalize();
  const amount = point.clone().sub(axisOrigin).dot(axis);
  return axisOrigin.clone().add(axis.mulScalar(amount));
}

function computeAxisDragPlaneNormal(
  axisDir: pc.Vec3,
  axisOrigin: pc.Vec3,
  cameraEntity: pc.Entity,
) {
  const toCamera = cameraEntity.getPosition().clone().sub(axisOrigin);
  const alongAxis = axisDir.clone().mulScalar(toCamera.dot(axisDir));
  const perpendicular = toCamera.sub(alongAxis);

  if (perpendicular.lengthSq() > 1e-6) {
    return perpendicular.normalize();
  }

  let fallback = new pc.Vec3().cross(axisDir, cameraEntity.up);
  if (fallback.lengthSq() < 1e-6) {
    fallback = new pc.Vec3().cross(axisDir, cameraEntity.right);
  }
  if (fallback.lengthSq() < 1e-6) return null;
  return fallback.normalize();
}

function entityToDragMode(entity: pc.Entity | null): DragMode | null {
  let current = entity;
  while (current) {
    switch (current.name) {
      case "axis-x":
      case "axis-x-tip":
        return "x";
      case "axis-y":
      case "axis-y-tip":
        return "y";
      case "axis-z":
      case "axis-z-tip":
        return "z";
      case "axis-center":
        return "free";
      case "plane-xy":
        return "xy";
      case "plane-xz":
        return "xz";
      case "plane-yz":
        return "yz";
      default:
        current = current.parent;
    }
  }
  return null;
}

function rayIntersectsWorldAabb(
  ray: pc.Ray,
  center: pc.Vec3,
  halfExtents: pc.Vec3,
) {
  const min = new pc.Vec3(
    center.x - halfExtents.x,
    center.y - halfExtents.y,
    center.z - halfExtents.z,
  );
  const max = new pc.Vec3(
    center.x + halfExtents.x,
    center.y + halfExtents.y,
    center.z + halfExtents.z,
  );

  let tmin = -Infinity;
  let tmax = Infinity;

  const axes = ["x", "y", "z"] as const;
  for (const axis of axes) {
    const origin = ray.origin[axis];
    const dir = ray.direction[axis];
    if (Math.abs(dir) < 1e-8) {
      if (origin < min[axis] || origin > max[axis]) return null;
      continue;
    }
    let t1 = (min[axis] - origin) / dir;
    let t2 = (max[axis] - origin) / dir;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  if (tmax < 0) return null;
  const distance = tmin >= 0 ? tmin : tmax;
  return distance >= 0 ? distance : null;
}

function getEntityWorldScale(entity: pc.Entity, out = new pc.Vec3()) {
  const worldTransform = entity.getWorldTransform();
  worldTransform.getScale(out);
  return out;
}

function raycastEntity(ray: pc.Ray, entity: pc.Entity, pickSlop = 1.35) {
  const center = entity.getPosition();
  const scale = getEntityWorldScale(entity);
  const halfExtents = new pc.Vec3(
    scale.x * 0.5 * pickSlop,
    scale.y * 0.5 * pickSlop,
    scale.z * 0.5 * pickSlop,
  );
  const distance = rayIntersectsWorldAabb(ray, center, halfExtents);
  return distance === null ? null : { entity, distance };
}

function raycastGizmo(
  ray: pc.Ray,
  parts: pc.Entity[],
): { entity: pc.Entity; distance: number } | null {
  let best: { entity: pc.Entity; distance: number } | null = null;

  for (const entity of parts) {
    const isTip = entity.name.endsWith("-tip");
    const isPlane = entity.name.startsWith("plane-");
    const pickSlop = isTip ? HOVER_TIP_PICK_SLOP : isPlane ? 1.2 : 1.35;
    const hit = raycastEntity(ray, entity, pickSlop);
    if (!hit) continue;
    if (!best || hit.distance < best.distance) {
      best = hit;
    }
  }

  return best;
}

function getEntityMaterial(entity: pc.Entity): pc.StandardMaterial | null {
  const meshInstances = entity.render?.meshInstances;
  if (!meshInstances?.length) return null;
  const material = meshInstances[0].material;
  return material instanceof pc.StandardMaterial ? material : null;
}

type HoverPartKind = "shaft" | "tip" | "plane" | "center";

type HoverVisual = {
  mode: DragMode;
  parts: Array<{ entity: pc.Entity; kind: HoverPartKind }>;
  baseScales: Map<pc.Entity, pc.Vec3>;
};

function buildHoverVisuals(gizmo: ReturnType<typeof createRgbAxisRoot>): HoverVisual[] {
  const makeAxisVisual = (mode: DragMode, axis: RgbAxisPart): HoverVisual => {
    const parts: HoverVisual["parts"] = [{ entity: axis.shaft, kind: "shaft" }];
    if (axis.tip) parts.push({ entity: axis.tip, kind: "tip" });
    const baseScales = new Map();
    for (const part of parts) {
      baseScales.set(part.entity, part.entity.getLocalScale().clone());
    }
    return { mode, parts, baseScales };
  };

  const makePlaneVisual = (mode: PlaneHandle, entity: pc.Entity): HoverVisual => ({
    mode,
    parts: [{ entity, kind: "plane" }],
    baseScales: new Map([[entity, entity.getLocalScale().clone()]]),
  });

  const centerBaseScale = gizmo.center.getLocalScale().clone();
  const visuals: HoverVisual[] = [
    makeAxisVisual("x", gizmo.axes.x),
    makeAxisVisual("y", gizmo.axes.y),
    makeAxisVisual("z", gizmo.axes.z),
    {
      mode: "free",
      parts: [{ entity: gizmo.center, kind: "center" }],
      baseScales: new Map([[gizmo.center, centerBaseScale]]),
    },
  ];

  if (gizmo.planes) {
    visuals.push(
      makePlaneVisual("xy", gizmo.planes.xy),
      makePlaneVisual("xz", gizmo.planes.xz),
      makePlaneVisual("yz", gizmo.planes.yz),
    );
  }

  return visuals;
}

/** Translate gizmo (RGB axes) for in-scene marker positioning in edit mode. */
export function setupEditorMarkerGizmo(options: {
  app: pc.AppBase;
  cameraEntity: pc.Entity;
  canvas: HTMLCanvasElement;
  pointerRoot: HTMLElement;
  cameraControlHooks: CameraControlHooks;
  overlayLayer: pc.Layer;
  /** Entity root name (defaults to `marker-translate-gizmo`). */
  rootName?: string;
}): EditorMarkerGizmoHandle {
  const { app, cameraEntity, canvas, pointerRoot, cameraControlHooks, overlayLayer, rootName } =
    options;

  const gizmo = createRgbAxisRoot(rootName ?? "marker-translate-gizmo", GIZMO_AXIS_LENGTH, {
    arrowTips: true,
    translucentShafts: true,
    planeHandles: true,
  });
  const { root: gizmoRoot } = gizmo;
  const pickParts = collectRgbAxisPickParts(gizmo);
  const hoverVisuals = buildHoverVisuals(gizmo);
  gizmoRoot.enabled = false;
  app.root.addChild(gizmoRoot);
  assignRenderLayerRecursive(gizmoRoot, overlayLayer.id);

  let handlers: MarkerEditHandlers = {};
  let listenersAttached = false;
  let interactive = true;
  let dragging = false;
  let dragMode: DragMode | null = null;
  let hoveredMode: DragMode | null = null;
  let initialMarkerPosition = new pc.Vec3();
  let dragPlaneNormal = new pc.Vec3();
  let dragGrabOffset = new pc.Vec3();
  let dragGrabAxisScalar = 0;
  const axisDirs = {
    x: new pc.Vec3(1, 0, 0),
    y: new pc.Vec3(0, 1, 0),
    z: new pc.Vec3(0, 0, 1),
  };

  const applyGizmoRadius = (radius: number) => {
    const safeRadius =
      typeof radius === "number" && Number.isFinite(radius) ? radius : DEFAULT_MARKER_RADIUS;
    const multiplier = (safeRadius / DEFAULT_MARKER_RADIUS) * GIZMO_VISUAL_SCALE;
    gizmoRoot.setLocalScale(multiplier, multiplier, multiplier);
  };

  applyGizmoRadius(DEFAULT_MARKER_RADIUS);

  const getScreenCoords = (event: PointerEvent): ScreenPoint => {
    const { width, height } = app.graphicsDevice.clientRect;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? width / rect.width : 1;
    const scaleY = rect.height > 0 ? height / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const isPointerInViewer = (event: PointerEvent) => {
    const rect = pointerRoot.getBoundingClientRect();
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  };

  const setPartOpacity = (entity: pc.Entity, opacity: number) => {
    const material = getEntityMaterial(entity);
    if (!material) return;
    material.opacity = opacity;
    material.update();
  };

  const setPartScale = (
    entity: pc.Entity,
    baseScale: pc.Vec3,
    mode: DragMode,
    kind: HoverPartKind,
    hovered: boolean,
  ) => {
    if (!hovered) {
      entity.setLocalScale(baseScale.x, baseScale.y, baseScale.z);
      return;
    }

    const f = HOVER_SCALE;
    if (kind === "center") {
      entity.setLocalScale(baseScale.x * f, baseScale.y * f, baseScale.z * f);
      return;
    }

    if (kind === "tip") {
      entity.setLocalScale(baseScale.x * f, baseScale.y, baseScale.z * f);
      return;
    }

    if (kind === "plane") {
      if (mode === "xy") {
        entity.setLocalScale(baseScale.x * f, baseScale.y * f, baseScale.z);
      } else if (mode === "xz") {
        entity.setLocalScale(baseScale.x * f, baseScale.y, baseScale.z * f);
      } else {
        entity.setLocalScale(baseScale.x, baseScale.y * f, baseScale.z * f);
      }
      return;
    }

    // Shaft: thicken cross-section only so length stays flush with the arrow base.
    if (mode === "x") {
      entity.setLocalScale(baseScale.x, baseScale.y * f, baseScale.z * f);
    } else if (mode === "y") {
      entity.setLocalScale(baseScale.x * f, baseScale.y, baseScale.z * f);
    } else {
      entity.setLocalScale(baseScale.x * f, baseScale.y * f, baseScale.z);
    }
  };

  const applyHoverVisual = (mode: DragMode | null) => {
    if (hoveredMode === mode) return;
    hoveredMode = mode;

    for (const visual of hoverVisuals) {
      const isActive = visual.mode === mode;
      for (const part of visual.parts) {
        const baseScale = visual.baseScales.get(part.entity);
        if (!baseScale) continue;
        setPartOpacity(part.entity, isActive ? GIZMO_HOVER_OPACITY : GIZMO_IDLE_OPACITY);
        setPartScale(part.entity, baseScale, visual.mode, part.kind, isActive);
      }
    }

    canvas.style.cursor = mode ? "grab" : "";
  };

  const applyPosition = (position: pc.Vec3, commit: boolean) => {
    gizmoRoot.setPosition(position);
    const tuple = [position.x, position.y, position.z] as [number, number, number];
    handlers.onChange?.(tuple);
    if (commit) {
      handlers.onCommit?.(tuple);
    }
  };

  const pickDragMode = (screenX: number, screenY: number): DragMode | null => {
    if (!gizmoRoot.enabled) return null;
    const ray = screenToRay(cameraEntity, screenX, screenY);
    const hit = raycastGizmo(ray, pickParts);
    return hit ? entityToDragMode(hit.entity) : null;
  };

  const updateHover = (event: PointerEvent) => {
    if (!gizmoRoot.enabled || dragging) return;
    if (!isPointerInViewer(event)) {
      applyHoverVisual(null);
      return;
    }
    const { x, y } = getScreenCoords(event);
    applyHoverVisual(pickDragMode(x, y));
  };

  const updateDrag = (screenX: number, screenY: number) => {
    if (!dragging || !dragMode) return;

    const ray = screenToRay(cameraEntity, screenX, screenY);
    let nextPosition: pc.Vec3 | null = null;

    if (dragMode === "free" || isPlaneDragMode(dragMode)) {
      const planeHit = rayPlaneIntersection(ray, initialMarkerPosition, dragPlaneNormal);
      if (!planeHit) return;
      nextPosition = planeHit.clone().add(dragGrabOffset);
    } else {
      const axisDir = axisDirs[dragMode];
      const planeHit = rayPlaneIntersection(ray, initialMarkerPosition, dragPlaneNormal);
      if (!planeHit) return;
      const axisPoint = projectOntoAxis(planeHit, initialMarkerPosition, axisDir);
      const axisScalar = axisPoint.clone().sub(initialMarkerPosition).dot(axisDir);
      const delta = axisScalar - dragGrabAxisScalar;
      nextPosition = initialMarkerPosition.clone().add(axisDir.clone().mulScalar(delta));
    }

    if (!nextPosition) return;
    applyPosition(nextPosition, false);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    dragMode = null;
    canvas.style.cursor = hoveredMode ? "grab" : "";
    cameraControlHooks.resumeCameraControls();
    applyPosition(gizmoRoot.getPosition().clone(), true);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!gizmoRoot.enabled || event.button !== 0 || !isPointerInViewer(event)) return;
    const { x, y } = getScreenCoords(event);
    const mode = pickDragMode(x, y);
    if (!mode) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    dragging = true;
    dragMode = mode;
    applyHoverVisual(mode);
    canvas.style.cursor = "grabbing";
    initialMarkerPosition.copy(gizmoRoot.getPosition());

    if (mode === "free") {
      dragPlaneNormal.copy(cameraEntity.forward).normalize();
      const grabRay = screenToRay(cameraEntity, x, y);
      const grabHit = rayPlaneIntersection(grabRay, initialMarkerPosition, dragPlaneNormal);
      if (!grabHit) {
        dragging = false;
        dragMode = null;
        canvas.style.cursor = hoveredMode ? "grab" : "";
        return;
      }
      dragGrabOffset.sub2(initialMarkerPosition, grabHit);
    } else if (isPlaneDragMode(mode)) {
      dragPlaneNormal.copy(PLANE_NORMALS[mode]);
      const grabRay = screenToRay(cameraEntity, x, y);
      const grabHit = rayPlaneIntersection(grabRay, initialMarkerPosition, dragPlaneNormal);
      if (!grabHit) {
        dragging = false;
        dragMode = null;
        canvas.style.cursor = hoveredMode ? "grab" : "";
        return;
      }
      dragGrabOffset.sub2(initialMarkerPosition, grabHit);
    } else {
      const axisPlaneNormal = computeAxisDragPlaneNormal(
        axisDirs[mode],
        initialMarkerPosition,
        cameraEntity,
      );
      if (!axisPlaneNormal) {
        dragging = false;
        dragMode = null;
        canvas.style.cursor = hoveredMode ? "grab" : "";
        return;
      }
      dragPlaneNormal.copy(axisPlaneNormal);
      const grabRay = screenToRay(cameraEntity, x, y);
      const grabHit = rayPlaneIntersection(grabRay, initialMarkerPosition, dragPlaneNormal);
      if (!grabHit) {
        dragging = false;
        dragMode = null;
        canvas.style.cursor = hoveredMode ? "grab" : "";
        return;
      }
      const axisDir = axisDirs[mode];
      const grabAxisPoint = projectOntoAxis(grabHit, initialMarkerPosition, axisDir);
      dragGrabAxisScalar = grabAxisPoint.clone().sub(initialMarkerPosition).dot(axisDir);
    }

    cameraControlHooks.pauseCameraControls();
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // ignore if capture is not supported for this target
      }
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (dragging) {
      event.preventDefault();
      const { x, y } = getScreenCoords(event);
      updateDrag(x, y);
      return;
    }
    updateHover(event);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!dragging) return;
    event.preventDefault();
    if (canvas.hasPointerCapture?.(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    endDrag();
    updateHover(event);
  };

  const onPointerLeave = () => {
    if (dragging) return;
    applyHoverVisual(null);
  };

  const attachListeners = () => {
    if (listenersAttached || !interactive) return;
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    pointerRoot.addEventListener("pointerleave", onPointerLeave);
    listenersAttached = true;
  };

  const detachListeners = () => {
    if (!listenersAttached) return;
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerUp, true);
    pointerRoot.removeEventListener("pointerleave", onPointerLeave);
    listenersAttached = false;
    applyHoverVisual(null);
    canvas.style.cursor = "";
  };

  const syncListenerAttachment = () => {
    if (!gizmoRoot.enabled) {
      detachListeners();
      return;
    }
    if (interactive) {
      attachListeners();
    } else {
      detachListeners();
    }
  };

  return {
    setEditing(active, position, nextHandlers, radius) {
      handlers = nextHandlers ?? {};
      if (!active || !position) {
        if (dragging) {
          endDrag();
        }
        gizmoRoot.enabled = false;
        detachListeners();
        return;
      }

      applyGizmoRadius(radius ?? DEFAULT_MARKER_RADIUS);
      gizmoRoot.setPosition(position[0], position[1], position[2]);
      gizmoRoot.enabled = true;
      syncListenerAttachment();
    },
    setInteractive(enabled) {
      if (interactive === enabled) return;
      interactive = enabled;
      if (!enabled) {
        if (dragging) {
          endDrag();
        }
        applyHoverVisual(null);
      }
      syncListenerAttachment();
    },
    setPosition(position) {
      if (!gizmoRoot.enabled) return;
      gizmoRoot.setPosition(position[0], position[1], position[2]);
    },
    setRadius(radius) {
      if (!gizmoRoot.enabled) return;
      applyGizmoRadius(radius);
    },
    destroy() {
      detachListeners();
      if (dragging) {
        dragging = false;
        cameraControlHooks.resumeCameraControls();
      }
      gizmoRoot.destroy();
    },
  };
}
