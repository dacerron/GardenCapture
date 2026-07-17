import * as pc from "playcanvas";
import { setupEditorOverlayLayer } from "./editorOverlayLayer";

/** Returns ground surface world Y under a world XZ, or null when out of bounds. */
export type GroundWorldSampler = (
  worldX: number,
  worldY: number,
  worldZ: number,
) => number | null;

export type WorldCoordinateReadoutHandle = {
  destroy(): void;
};

const CLICK_MOVE_TOLERANCE_PX = 6;
const CLICK_MAX_MS = 450;
const MARCH_STEP_M = 0.5;
const MARCH_MAX_M = 500;
const REFINE_ITERS = 20;
const BOX_MARGIN_M = 1;

const fmt = (n: number) => n.toFixed(2);

/**
 * Click-to-read world/local coordinate picker for tuning collision seed/box
 * positions. Clicking casts a ray from the camera, intersects the heightmap
 * ground (falling back to a horizontal plane through the splat origin), and
 * reports the hit in the splat's local frame — the same frame that
 * `SPLAT_COLLISION_SEED_POS` and the `-B` box crop operate in.
 *
 * Accumulated clicks also produce a ready-to-paste box env snippet.
 */
export function setupWorldCoordinateReadout(options: {
  app: pc.AppBase;
  cameraEntity: pc.Entity;
  splatEntity: pc.Entity;
  canvas: HTMLCanvasElement;
  overlayParent: HTMLElement;
  sampleGroundWorldY?: GroundWorldSampler | null;
}): WorldCoordinateReadoutHandle {
  const { app, cameraEntity, splatEntity, canvas, overlayParent } = options;
  const sampleGroundWorldY = options.sampleGroundWorldY ?? null;

  const near = new pc.Vec3();
  const far = new pc.Vec3();
  const dir = new pc.Vec3();
  const probe = new pc.Vec3();
  const step = new pc.Vec3();
  const invWorld = new pc.Mat4();

  // --- Pick marker (on the depth-cleared editor overlay layer so it stays visible). ---
  const overlayLayer = setupEditorOverlayLayer(app, cameraEntity);
  const markerMaterial = new pc.StandardMaterial();
  markerMaterial.useLighting = false;
  markerMaterial.emissive.set(1, 0.15, 0.1);
  markerMaterial.diffuse.set(0, 0, 0);
  // Blend so it lands in the overlay layer's transparent sublayer (rendered on top).
  markerMaterial.opacity = 1;
  markerMaterial.blendType = pc.BLEND_NORMAL;
  markerMaterial.depthWrite = false;
  markerMaterial.update();

  const marker = new pc.Entity("coord-readout-marker");
  marker.addComponent("render", { type: "sphere", material: markerMaterial });
  if (marker.render) {
    marker.render.layers = [overlayLayer.id];
  }
  marker.setLocalScale(0.4, 0.4, 0.4);
  marker.enabled = false;
  app.root.addChild(marker);

  // --- Box accumulation (local frame). ---
  let boxMin: pc.Vec3 | null = null;
  let boxMax: pc.Vec3 | null = null;
  let pointCount = 0;
  let lastLocal: pc.Vec3 | null = null;

  // --- DOM panel. ---
  const panel = document.createElement("div");
  Object.assign(panel.style, {
    position: "absolute",
    left: "12px",
    bottom: "12px",
    zIndex: "40",
    maxWidth: "320px",
    padding: "10px 12px",
    borderRadius: "8px",
    background: "rgba(18, 20, 24, 0.86)",
    color: "#eaeaea",
    font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
    backdropFilter: "blur(6px)",
    pointerEvents: "auto",
    userSelect: "text",
  } as CSSStyleDeclaration);

  const title = document.createElement("div");
  title.textContent = "Click a point to read its position";
  Object.assign(title.style, { fontWeight: "700", marginBottom: "6px", opacity: "0.9" });

  const lastLine = document.createElement("div");
  lastLine.textContent = "Last: —";
  lastLine.style.whiteSpace = "nowrap";

  const boxBlock = document.createElement("pre");
  boxBlock.textContent = "Box: click 2+ points";
  Object.assign(boxBlock.style, {
    margin: "8px 0 6px",
    padding: "6px",
    borderRadius: "6px",
    background: "rgba(0,0,0,0.35)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } as CSSStyleDeclaration);

  const buttonRow = document.createElement("div");
  Object.assign(buttonRow.style, { display: "flex", gap: "6px", flexWrap: "wrap" });

  const makeButton = (label: string) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: "4px 8px",
      borderRadius: "5px",
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.08)",
      color: "#eaeaea",
      font: "inherit",
      cursor: "pointer",
    } as CSSStyleDeclaration);
    return btn;
  };

  const copySeedBtn = makeButton("Copy seed");
  const copyBoxBtn = makeButton("Copy box env");
  const resetBtn = makeButton("Reset");
  buttonRow.append(copySeedBtn, copyBoxBtn, resetBtn);

  const hint = document.createElement("div");
  hint.textContent = "Local frame = SPLAT_COLLISION_SEED_POS space";
  Object.assign(hint.style, { marginTop: "6px", opacity: "0.55", fontSize: "11px" });

  panel.append(title, lastLine, boxBlock, buttonRow, hint);
  overlayParent.appendChild(panel);

  const seedString = () =>
    lastLocal ? `${fmt(lastLocal.x)},${fmt(lastLocal.y)},${fmt(lastLocal.z)}` : "";

  const boxEnvSnippet = (): string | null => {
    if (!boxMin || !boxMax || pointCount < 2) return null;
    const cx = (boxMin.x + boxMax.x) / 2;
    const cy = (boxMin.y + boxMax.y) / 2;
    const cz = (boxMin.z + boxMax.z) / 2;
    const half =
      Math.max((boxMax.x - boxMin.x) / 2, (boxMax.z - boxMin.z) / 2) + BOX_MARGIN_M;
    const yMin = boxMin.y - BOX_MARGIN_M;
    const yMax = boxMax.y + BOX_MARGIN_M;
    return [
      `$env:SPLAT_COLLISION_SEED_POS   = "${fmt(cx)},${fmt(cy)},${fmt(cz)}"`,
      `$env:SPLAT_COLLISION_BOX_HALF_M = "${fmt(half)}"`,
      `$env:SPLAT_COLLISION_BOX_Y_MIN  = "${fmt(yMin)}"`,
      `$env:SPLAT_COLLISION_BOX_Y_MAX  = "${fmt(yMax)}"`,
      `$env:SPLAT_COLLISION_SPHERE_M   = "none"`,
    ].join("\n");
  };

  const updatePanel = () => {
    lastLine.textContent = lastLocal
      ? `Last (local): ${seedString()}`
      : "Last: —";
    boxBlock.textContent =
      boxEnvSnippet() ?? `Box: click 2+ points (${pointCount} so far)`;
  };

  const copyText = (text: string, btn: HTMLButtonElement) => {
    if (!text) return;
    const done = () => {
      const original = btn.textContent;
      btn.textContent = "Copied";
      window.setTimeout(() => {
        btn.textContent = original;
      }, 1000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {});
    }
  };

  copySeedBtn.addEventListener("click", () => copyText(seedString(), copySeedBtn));
  copyBoxBtn.addEventListener("click", () => copyText(boxEnvSnippet() ?? "", copyBoxBtn));
  resetBtn.addEventListener("click", () => {
    boxMin = null;
    boxMax = null;
    pointCount = 0;
    lastLocal = null;
    marker.enabled = false;
    updatePanel();
  });

  const raycastGround = (origin: pc.Vec3, direction: pc.Vec3): pc.Vec3 | null => {
    if (sampleGroundWorldY) {
      const camera = cameraEntity.camera;
      const maxT = Math.min(MARCH_MAX_M, camera ? camera.farClip : MARCH_MAX_M);
      let prevT = 0;
      let prevDiff: number | null = null;

      for (let t = 0; t <= maxT; t += MARCH_STEP_M) {
        step.copy(direction).mulScalar(t);
        probe.copy(origin).add(step);
        const ground = sampleGroundWorldY(probe.x, probe.y, probe.z);
        if (ground === null) {
          prevDiff = null;
          prevT = t;
          continue;
        }
        const diff = probe.y - ground;
        if (prevDiff !== null && prevDiff > 0 && diff <= 0) {
          let a = prevT;
          let b = t;
          let hitGround = ground;
          for (let i = 0; i < REFINE_ITERS; i++) {
            const m = (a + b) / 2;
            step.copy(direction).mulScalar(m);
            probe.copy(origin).add(step);
            const g = sampleGroundWorldY(probe.x, probe.y, probe.z);
            if (g === null) break;
            hitGround = g;
            if (probe.y - g > 0) a = m;
            else b = m;
          }
          step.copy(direction).mulScalar(b);
          probe.copy(origin).add(step);
          return new pc.Vec3(probe.x, hitGround, probe.z);
        }
        prevDiff = diff;
        prevT = t;
      }
    }

    // Fallback: intersect a horizontal plane through the splat origin.
    const planeY = splatEntity.getPosition().y;
    if (Math.abs(direction.y) < 1e-6) return null;
    const t = (planeY - origin.y) / direction.y;
    if (t < 0) return null;
    step.copy(direction).mulScalar(t);
    probe.copy(origin).add(step);
    return new pc.Vec3(probe.x, planeY, probe.z);
  };

  const pick = (clientX: number, clientY: number) => {
    const camera = cameraEntity.camera;
    if (!camera) return;

    const { width, height } = app.graphicsDevice.clientRect;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? width / rect.width : 1;
    const scaleY = rect.height > 0 ? height / rect.height : 1;
    const screenX = (clientX - rect.left) * scaleX;
    const screenY = (clientY - rect.top) * scaleY;

    camera.screenToWorld(screenX, screenY, camera.nearClip, near);
    camera.screenToWorld(screenX, screenY, camera.farClip, far);
    dir.sub2(far, near).normalize();

    const world = raycastGround(near, dir);
    if (!world) return;

    invWorld.copy(splatEntity.getWorldTransform()).invert();
    const local = new pc.Vec3();
    invWorld.transformPoint(world, local);

    lastLocal = local;
    if (!boxMin || !boxMax) {
      boxMin = local.clone();
      boxMax = local.clone();
    } else {
      boxMin.set(
        Math.min(boxMin.x, local.x),
        Math.min(boxMin.y, local.y),
        Math.min(boxMin.z, local.z),
      );
      boxMax.set(
        Math.max(boxMax.x, local.x),
        Math.max(boxMax.y, local.y),
        Math.max(boxMax.z, local.z),
      );
    }
    pointCount++;

    marker.setPosition(world);
    marker.enabled = true;
    updatePanel();
  };

  // --- Pointer handling: only treat a stationary short click as a pick. ---
  let downX = 0;
  let downY = 0;
  let downTime = 0;
  let downButton = -1;

  const onPointerDown = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
    downTime = performance.now();
    downButton = e.button;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.button !== 0 || downButton !== 0) return;
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved > CLICK_MOVE_TOLERANCE_PX) return;
    if (performance.now() - downTime > CLICK_MAX_MS) return;
    pick(e.clientX, e.clientY);
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);

  updatePanel();

  return {
    destroy() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      panel.remove();
      marker.destroy();
      markerMaterial.destroy();
    },
  };
}
