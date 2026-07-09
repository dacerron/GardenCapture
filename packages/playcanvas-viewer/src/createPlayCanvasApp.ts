import * as pc from "playcanvas";
import { CameraControls } from "playcanvas/scripts/esm/camera-controls.mjs";
import type { NavigableMarker } from "@soil/shared/markers/navigableMarkers";
import { applyCameraControlMode } from "./cameraControlMode";
import {
  configureMobileCameraControls,
  DEFAULT_CAMERA_POSITION,
  DEFAULT_FOCUS_POINT,
  isMobileLikeControls,
} from "./mobileCamera";
import { createCameraInputGate } from "./cameraInputGate";
import { setupEditorMarkerGizmo, type MarkerEditHandlers } from "./editorMarkerGizmo";
import { GIZMO_AXIS_LENGTH, START_AXIS_LENGTH } from "./editorAxisVisual";
import { setupEditorOverlayLayer } from "./editorOverlayLayer";
import { setupPlayCanvasMarkers, type PlacementPreviewState } from "./setupAnnotations";
import { setupPlayCanvasSkybox, SKYBOX_GROUND_COLOR } from "./setupSkybox";
import type { ControlMode } from "@soil/shared/three/ScreenSpace";
import type { PerformancePreset } from "@soil/shared/three/ScreenSpace";
import {
  applyPerformancePreset,
  getDefaultPerformancePreset,
  getSplatBudgetM,
} from "./performancePresets";
import { DEFAULT_MARKER_RADIUS } from "@soil/shared/markers/editorMarkers";
import { applySplatOrientationX } from "./applySplatOrientation";
import { deriveStartViewPosition } from "@soil/shared/utils/startPos";
import { resetCameraFromStartPos } from "./spawnCamera";
import { mapLegacyStoredPosition } from "./sceneCoordinates";
import { setupCameraHeightClamp } from "./heightmap/cameraHeightClamp";
import {
  createHeightmapGroundCollider,
  createPositionClamp,
  type CameraPositionClamp,
} from "./heightmap/heightmapCollider";
import { createHeightmapQuery } from "./heightmap/heightmapQuery";
import { loadHeightmap } from "./heightmap/loadHeightmap";
import { resolveHeightmapUrl } from "./heightmap/resolveHeightmapUrl";
import type { HeightmapGroundClampConfig } from "./heightmap/types";

/** Matches legacy mkkellogg viewer flip in GaussianViewer.ts (rotation [1,0,0,0]). */
export const DEFAULT_ORIENTATION_X = 180;

export type PlayCanvasLoadProgress = {
  hint: string;
  progress: number | null;
};

export type PlayCanvasAppOptions = {
  canvas: HTMLCanvasElement;
  splatUrl: string;
  /** Euler X rotation (degrees). Default 180 to align with legacy `/viewer/`. */
  orientationX?: number;
  /** Global splat budget in millions. When set (including `0`), overrides `performancePreset`. */
  splatBudgetM?: number;
  /** Quality preset; overrides `splatBudgetM` when provided. */
  performancePreset?: PerformancePreset;
  /** When set, lock streamed LOD to this level (0 = finest). */
  lockLodLevel?: number;
  /** DOM container for PlayCanvas annotation overlays (defaults to document.body). */
  markerOverlayParent?: HTMLElement;
  markers?: NavigableMarker[];
  /** Initial selected marker index (editor). */
  selectedMarkerIndex?: number | null;
  /** Hotspot click handler; when set, overrides default fly-on-click. */
  onMarkerClick?: (index: number) => void;
  /** Fly camera when a hotspot is clicked (viewer default). */
  flyOnMarkerClick?: boolean;
  /** Equirectangular sky texture URL. Omit for default HDR; pass `null` to disable. */
  skyboxUrl?: string | null;
  /** Desktop camera mode. Ignored on mobile/coarse pointer (always orbit). */
  defaultControlMode?: ControlMode;
  /** Optional loading UI updates while the splat scene is prepared. */
  onLoadProgress?: (state: PlayCanvasLoadProgress) => void;
  /** Scene origin / orbit pivot (`start_pos` from DynamoDB). */
  startPos?: [number, number, number];
  /** Opening / reset camera position (`start_view_position` from DynamoDB). */
  startViewPosition?: [number, number, number] | null;
  showStartAxes?: boolean;
  /** Keep the camera above a precomputed ground heightmap when available. */
  groundClamp?: HeightmapGroundClampConfig;
};

export type PlayCanvasApp = {
  destroy: () => void;
  flyToMarker: (index: number) => void;
  resetCamera: () => void;
  setControlMode: (mode: ControlMode) => void;
  setPerformancePreset: (preset: PerformancePreset) => void;
  setMarkers: (
    markers: NavigableMarker[],
    options?: { selectedIndex?: number | null },
  ) => void;
  setSelectedMarkerIndex: (index: number | null) => void;
  showMarkerLabel: (index: number) => void;
  hideMarkerLabel: () => void;
  setMarkerClickHandler: (handler: ((index: number) => void) | null) => void;
  setPlacementPreview: (state: PlacementPreviewState | null) => void;
  getPlacementPosition: () => [number, number, number];
  getCameraPosition: () => [number, number, number];
  setCameraInputEnabled: (enabled: boolean) => void;
  setStartAxesPosition: (position: [number, number, number]) => void;
  setStartViewPosition: (position: [number, number, number]) => void;
  setStartAxesVisible: (visible: boolean) => void;
  setStartPosEditing: (handlers?: MarkerEditHandlers) => void;
  setStartPosInteractive: (interactive: boolean) => void;
  setMarkerEditing: (
    index: number | null,
    handlers?: MarkerEditHandlers,
  ) => void;
  setMarkerGizmoPosition: (position: [number, number, number]) => void;
  setMarkerGizmoRadius: (radius: number) => void;
};

/**
 * PlayCanvas engine app for streamed LOD (`lod-meta.json`) splats.
 */
export async function createPlayCanvasApp(
  options: PlayCanvasAppOptions,
): Promise<PlayCanvasApp> {
  const {
    canvas,
    splatUrl,
    orientationX = DEFAULT_ORIENTATION_X,
    splatBudgetM,
    performancePreset = getDefaultPerformancePreset(),
    lockLodLevel,
    markerOverlayParent,
    markers = [],
    selectedMarkerIndex = null,
    onMarkerClick,
    flyOnMarkerClick = !onMarkerClick,
    skyboxUrl,
    defaultControlMode = "orbit",
    onLoadProgress,
    startPos = [0, 0, 0],
    startViewPosition = null,
    showStartAxes = false,
    groundClamp = {},
  } = options;
  const budgetLocked = splatBudgetM !== undefined;
  const budgetM =
    splatBudgetM !== undefined
      ? splatBudgetM
      : getSplatBudgetM(performancePreset);
  const sceneFocus = new pc.Vec3();
  const sceneCameraPosition = new pc.Vec3();

  const reportLoad = (hint: string, progress: number | null) => {
    onLoadProgress?.({ hint, progress });
  };

  const device = await pc.createGraphicsDevice(canvas, {
    deviceTypes: [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2],
    antialias: false,
  });

  const appOptions = new pc.AppOptions();
  appOptions.graphicsDevice = device;
  appOptions.mouse = new pc.Mouse(canvas);
  appOptions.touch = new pc.TouchDevice(canvas);
  appOptions.keyboard = new pc.Keyboard(window);

  appOptions.componentSystems = [
    pc.RenderComponentSystem,
    pc.CameraComponentSystem,
    pc.ScriptComponentSystem,
    pc.GSplatComponentSystem,
  ];
  appOptions.resourceHandlers = [
    pc.TextureHandler,
    pc.ScriptHandler,
    pc.GSplatHandler,
  ];

  const app = new pc.AppBase(canvas);
  app.init(appOptions);

  app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);

  const onResize = () => app.resizeCanvas();
  window.addEventListener("resize", onResize);

  app.scene.gsplat.lodUpdateAngle = 90;
  app.scene.gsplat.lodBehindPenalty = 3;
  app.scene.gsplat.radialSorting = true;
  app.scene.gsplat.splatBudget = Math.round(budgetM * 1_000_000);

  const heightmapUrl =
    groundClamp.enabled === false
      ? null
      : resolveHeightmapUrl(splatUrl, groundClamp.heightmapUrl);
  const heightmapLoadPromise = heightmapUrl
    ? loadHeightmap(heightmapUrl).catch((err) => {
        console.warn("[heightmap] failed to load", err);
        return null;
      })
    : Promise.resolve(null);

  const asset = new pc.Asset("gsplat", "gsplat", { url: splatUrl });
  app.assets.add(asset);

  reportLoad("Downloading scene data...", null);

  await new Promise<void>((resolve, reject) => {
    asset.on("load", () => resolve());
    asset.on("error", (err: string) => reject(new Error(err)));
    app.assets.load(asset);
  });

  reportLoad("Processing virtual soil...", 0.72);

  app.start();

  const camera = new pc.Entity("camera");
  camera.addComponent("camera", {
    clearColor: SKYBOX_GROUND_COLOR.clone(),
    fov: 75,
    toneMapping: pc.TONEMAP_LINEAR,
  });
  camera.setPosition(DEFAULT_CAMERA_POSITION);
  app.root.addChild(camera);
  camera.lookAt(DEFAULT_FOCUS_POINT);

  const skyboxHandle = setupPlayCanvasSkybox(app, camera, skyboxUrl);

  camera.addComponent("script");
  const controls = camera.script?.create(CameraControls) as InstanceType<
    typeof CameraControls
  > | undefined;

  if (controls) {
    Object.assign(controls, {
      sceneSize: 200,
      moveSpeed: 4,
      moveFastSpeed: 12,
      enableOrbit: true,
      enablePan: true,
      focusPoint: DEFAULT_FOCUS_POINT.clone(),
    });
    if (isMobileLikeControls()) {
      configureMobileCameraControls(controls);
    } else {
      applyCameraControlMode(controls, defaultControlMode);
    }
  }

  const splatEntity = new pc.Entity("splat");
  splatEntity.addComponent("gsplat", { asset });
  applySplatOrientationX(splatEntity, orientationX);
  app.root.addChild(splatEntity);

  const gsplat = splatEntity.gsplat;
  const resource = gsplat?.resource as { octree?: { lodLevels?: number } } | undefined;
  const lodLevels = resource?.octree?.lodLevels;

  const applyLodRange = (min: number, max: number) => {
    app.scene.gsplat.lodRangeMin = min;
    app.scene.gsplat.lodRangeMax = max;
  };

  const waitForInteractive = new Promise<void>((resolve) => {
    if (!lodLevels) {
      resolve();
      return;
    }

    const worstLod = lodLevels - 1;
    const targetMin = lockLodLevel ?? worstLod;
    const targetMax = lockLodLevel ?? worstLod;
    applyLodRange(targetMin, targetMax);

    const gsplatSystem = app.systems.gsplat as pc.GSplatComponentSystem & {
      on: (name: string, fn: (...args: unknown[]) => void) => void;
      off: (name: string, fn: (...args: unknown[]) => void) => void;
    };

    reportLoad("Finalizing virtual soil...", 0.92);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      gsplatSystem.off("frame:ready", onFrameReady);
      clearTimeout(timeoutId);
      if (lockLodLevel !== undefined) {
        applyLodRange(lockLodLevel, lockLodLevel);
      } else {
        applyLodRange(0, worstLod);
      }
      resolve();
    };

    const onFrameReady = (
      _cam: unknown,
      _layer: unknown,
      ready: boolean,
      loadingCount: number,
    ) => {
      if (ready && loadingCount === 0) {
        finish();
      }
    };

    const timeoutId = window.setTimeout(finish, 30_000);
    gsplatSystem.on("frame:ready", onFrameReady);
  });

  await waitForInteractive;

  const heightmapData = await heightmapLoadPromise;
  let clampCameraPosition: CameraPositionClamp | null = null;
  let heightClampHandle: { clampNow(): boolean; destroy(): void } = {
    clampNow: () => false,
    destroy() {},
  };

  if (heightmapData && groundClamp.enabled !== false) {
    const filledCells = heightmapData.heights.filter(
      (v) => v > heightmapData.meta.sentinel + 1,
    ).length;
    console.info(
      "[heightmap] loaded",
      heightmapUrl,
      `(${heightmapData.meta.coordinateSpace ?? "voxel-grid"}, ${filledCells} cells)`,
    );
    const heightQuery = createHeightmapQuery(heightmapData);
    const heightCollider = createHeightmapGroundCollider({
      query: heightQuery,
      splatEntity,
      eyeHeight: groundClamp.eyeHeight,
      surfaceClearance: groundClamp.surfaceClearance,
    });
    clampCameraPosition = createPositionClamp(heightCollider);
    heightClampHandle = setupCameraHeightClamp({
      app,
      cameraEntity: camera,
      controls: controls ?? null,
      collider: heightCollider,
      enabled: true,
    });
  }

  resetCameraFromStartPos({
    cameraEntity: camera,
    controls: controls ?? null,
    startPos,
    startViewPosition:
      startViewPosition ?? deriveStartViewPosition(startPos),
    splatEntity,
    sceneFocus,
    sceneCameraPosition,
  });
  heightClampHandle.clampNow();
  reportLoad("Finalizing virtual soil...", 1);

  const cameraInputGate = createCameraInputGate(controls ?? null);
  const editorOverlayLayer = showStartAxes
    ? setupEditorOverlayLayer(app, camera)
    : null;
  const startPosGizmoRadius =
    DEFAULT_MARKER_RADIUS * (START_AXIS_LENGTH / GIZMO_AXIS_LENGTH);
  const startPosGizmoHandle = showStartAxes
    ? setupEditorMarkerGizmo({
        app,
        cameraEntity: camera,
        canvas,
        pointerRoot: markerOverlayParent ?? canvas,
        cameraControlHooks: cameraInputGate.hooks,
        overlayLayer: editorOverlayLayer!,
        rootName: "start-pos-gizmo",
      })
    : null;
  let currentStartPos: [number, number, number] = [...startPos];
  let currentStartViewPosition: [number, number, number] = [
    ...(startViewPosition ?? deriveStartViewPosition(startPos)),
  ];
  let startPosHandlers: MarkerEditHandlers = {};
  let startPosInteractive = true;

  const syncStartPosGizmo = () => {
    if (!startPosGizmoHandle) return;
    startPosGizmoHandle.setEditing(true, currentStartPos, startPosHandlers, startPosGizmoRadius);
    startPosGizmoHandle.setInteractive(startPosInteractive);
  };

  syncStartPosGizmo();

  const markerGizmoHandle = showStartAxes
    ? setupEditorMarkerGizmo({
        app,
        cameraEntity: camera,
        canvas,
        pointerRoot: markerOverlayParent ?? canvas,
        cameraControlHooks: cameraInputGate.hooks,
        overlayLayer: editorOverlayLayer!,
      })
    : null;
  let markerEditHotspotIndex: number | null = null;

  const setStartAxesPosition = (position: [number, number, number]) => {
    currentStartPos = position;
    startPosGizmoHandle?.setPosition(position);
  };

  const applyStartPosCameraFraming = () => {
    resetCameraFromStartPos({
      cameraEntity: camera,
      controls: controls ?? null,
      startPos: currentStartPos,
      startViewPosition: currentStartViewPosition,
      splatEntity,
      sceneFocus,
      sceneCameraPosition,
    });
  };

  const markersHandle = setupPlayCanvasMarkers({
    app,
    cameraEntity: camera,
    controls: controls ?? null,
    markers,
    overlayParent: markerOverlayParent ?? document.body,
    selectedIndex: selectedMarkerIndex,
    onMarkerClick,
    flyOnMarkerClick,
    cameraControlHooks: cameraInputGate.hooks,
    clampCameraPosition,
    splatEntity,
  });

  return {
    flyToMarker(index: number) {
      markersHandle.flyToMarker(index);
    },
    resetCamera() {
      applyStartPosCameraFraming();
      heightClampHandle.clampNow();
    },
    setControlMode(mode: ControlMode) {
      applyCameraControlMode(controls ?? null, mode);
    },
    setPerformancePreset(preset: PerformancePreset) {
      if (budgetLocked) return;
      applyPerformancePreset(app, preset);
    },
    setMarkers(nextMarkers, options) {
      markersHandle.setMarkers(nextMarkers, options);
    },
    setSelectedMarkerIndex(index: number | null) {
      markersHandle.setSelectedIndex(index);
    },
    showMarkerLabel(index: number) {
      markersHandle.showMarkerLabel(index);
    },
    hideMarkerLabel() {
      markersHandle.hideMarkerLabel();
    },
    setMarkerClickHandler(handler) {
      markersHandle.setMarkerClickHandler(handler);
    },
    setPlacementPreview(state) {
      markersHandle.setPlacementPreview(state);
    },
    getPlacementPosition() {
      return markersHandle.getPlacementPosition();
    },
    getCameraPosition() {
      return markersHandle.getCameraPosition();
    },
    setCameraInputEnabled(enabled) {
      cameraInputGate.setCameraInputEnabled(enabled);
    },
    setStartAxesPosition(position) {
      setStartAxesPosition(position);
    },
    setStartViewPosition(position) {
      currentStartViewPosition = [...position];
    },
    setStartAxesVisible(visible) {
      if (!startPosGizmoHandle) return;
      if (visible) {
        syncStartPosGizmo();
      } else {
        startPosGizmoHandle.setEditing(false, null);
      }
    },
    setStartPosEditing(handlers) {
      startPosHandlers = handlers ?? {};
      syncStartPosGizmo();
    },
    setStartPosInteractive(interactive) {
      startPosInteractive = interactive;
      startPosGizmoHandle?.setInteractive(interactive);
    },
    setMarkerEditing(index, handlers) {
      if (markerEditHotspotIndex !== null) {
        markersHandle.setHotspotPointerEvents(markerEditHotspotIndex, true);
        markerEditHotspotIndex = null;
      }

      if (!markerGizmoHandle) return;
      if (index === null) {
        markerGizmoHandle.setEditing(false, null);
        return;
      }

      const position = markersHandle.getMarkerPosition(index);
      if (!position) {
        markerGizmoHandle.setEditing(false, null);
        return;
      }
      const gizmoPosition = mapLegacyStoredPosition(position, splatEntity);

      const radius = markersHandle.getMarkerRadius(index) ?? undefined;

      markersHandle.setHotspotPointerEvents(index, false);
      markerEditHotspotIndex = index;

      markerGizmoHandle.setEditing(true, gizmoPosition, {
        onChange: (nextPosition) => {
          markersHandle.setMarkerPosition(index, nextPosition);
          handlers?.onChange?.(nextPosition);
        },
        onCommit: (nextPosition) => {
          markersHandle.setMarkerPosition(index, nextPosition);
          handlers?.onCommit?.(nextPosition);
        },
      }, radius);
    },
    setMarkerGizmoPosition(position) {
      const gizmoPosition = mapLegacyStoredPosition(position, splatEntity);
      markerGizmoHandle?.setPosition(gizmoPosition);
    },
    setMarkerGizmoRadius(radius) {
      markerGizmoHandle?.setRadius(radius);
    },
    destroy() {
      heightClampHandle.destroy();
      markersHandle.destroy();
      markerGizmoHandle?.destroy();
      startPosGizmoHandle?.destroy();
      skyboxHandle.destroy();
      window.removeEventListener("resize", onResize);
      app.destroy();
    },
  };
}
