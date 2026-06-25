// @ts-nocheck
import * as pc from "playcanvas";
import { Annotation } from "playcanvas/scripts/esm/annotations.mjs";
import type { CameraControls } from "playcanvas/scripts/esm/camera-controls.mjs";
import { DEFAULT_MARKER_RADIUS } from "@soil/shared/markers/editorMarkers";

export type PlacementPreviewState = {
  visible: boolean;
  distance: number;
  icon?: string;
  radius?: number;
};

export type EditorPlacementHandle = {
  setPlacementPreview(state: PlacementPreviewState | null): void;
  getPlacementPosition(): [number, number, number];
  getCameraPosition(): [number, number, number];
  destroy(): void;
};

/** Preview hotspot tint (distinct from saved markers). */
const PREVIEW_TINT = new pc.Color(0.55, 0.85, 1);

export function setupEditorPlacement(options: {
  app: pc.AppBase;
  cameraEntity: pc.Entity;
  manager: {
    stageMarkerIcon(entity: pc.Entity, iconUrl: string): void;
    setMarkerRadius(annotation: unknown, radius: number): void;
    _registerAnnotation(annotation: unknown): void;
    _annotationResources: Map<unknown, { hotspotDom?: HTMLElement; materials: unknown[] }>;
  };
  createPreviewAnnotation(entity: pc.Entity): InstanceType<typeof Annotation>;
}): EditorPlacementHandle {
  const { app, cameraEntity, manager, createPreviewAnnotation } = options;

  let previewEntity: pc.Entity | null = null;
  let previewAnnotation: InstanceType<typeof Annotation> | null = null;
  let previewVisible = false;
  let placementDistance = 1;
  let previewIcon = "";
  let previewRadius = DEFAULT_MARKER_RADIUS;
  let onUpdate: ((dt: number) => void) | null = null;

  const scratchForward = new pc.Vec3();
  const scratchPos = new pc.Vec3();

  const getForward = () => {
    scratchForward.copy(cameraEntity.forward);
    scratchForward.normalize();
    return scratchForward;
  };

  const updatePreviewPosition = () => {
    if (!previewEntity || !previewVisible || placementDistance <= 0) return;
    const cameraPos = cameraEntity.getPosition();
    const forward = getForward();
    scratchPos.set(
      cameraPos.x + forward.x * placementDistance,
      cameraPos.y + forward.y * placementDistance,
      cameraPos.z + forward.z * placementDistance,
    );
    previewEntity.setPosition(scratchPos);
  };

  const applyPreviewTint = () => {
    if (!previewAnnotation) return;
    const resources = manager._annotationResources.get(previewAnnotation);
    if (!resources) return;
    resources.materials.forEach((material) => {
      material.emissive.copy(PREVIEW_TINT);
      material.update();
    });
  };

  const destroyPreview = () => {
    if (onUpdate) {
      app.off("update", onUpdate);
      onUpdate = null;
    }
    if (previewEntity) {
      previewEntity.destroy();
      previewEntity = null;
      previewAnnotation = null;
    }
    previewVisible = false;
  };

  const ensurePreview = () => {
    if (previewEntity) return;

    previewEntity = new pc.Entity("placement-preview");
    app.root.addChild(previewEntity);
    previewEntity.addComponent("script");

    if (previewIcon) {
      manager.stageMarkerIcon(previewEntity, previewIcon);
    }

    previewAnnotation = createPreviewAnnotation(previewEntity);
    previewAnnotation.label = " ";
    previewAnnotation.title = "Placement preview";
    previewAnnotation.text = "";
    manager.setMarkerRadius(previewAnnotation, previewRadius);

    const resources = manager._annotationResources.get(previewAnnotation);
    if (resources?.hotspotDom) {
      resources.hotspotDom.style.pointerEvents = "none";
    }
    applyPreviewTint();
    updatePreviewPosition();

    onUpdate = () => updatePreviewPosition();
    app.on("update", onUpdate);
  };

  return {
    setPlacementPreview(state) {
      if (!state?.visible || state.distance <= 0) {
        destroyPreview();
        return;
      }

      previewVisible = true;
      placementDistance = state.distance;
      const nextIcon = state.icon?.trim() ?? "";
      const nextRadius =
        typeof state.radius === "number" && Number.isFinite(state.radius)
          ? state.radius
          : DEFAULT_MARKER_RADIUS;

      if (!previewEntity) {
        previewIcon = nextIcon;
        previewRadius = nextRadius;
        ensurePreview();
        return;
      }

      if (nextIcon !== previewIcon) {
        previewIcon = nextIcon;
        if (previewIcon) {
          manager.stageMarkerIcon(previewEntity, previewIcon);
        }
      }

      if (nextRadius !== previewRadius) {
        previewRadius = nextRadius;
        if (previewAnnotation) {
          manager.setMarkerRadius(previewAnnotation, previewRadius);
        }
      }

      updatePreviewPosition();
    },

    getPlacementPosition() {
      const cameraPos = cameraEntity.getPosition();
      const forward = getForward();
      const distance = previewVisible && placementDistance > 0 ? placementDistance : 1;
      return [
        cameraPos.x + forward.x * distance,
        cameraPos.y + forward.y * distance,
        cameraPos.z + forward.z * distance,
      ];
    },

    getCameraPosition() {
      const p = cameraEntity.getPosition();
      return [p.x, p.y, p.z];
    },

    destroy() {
      destroyPreview();
    },
  };
}
