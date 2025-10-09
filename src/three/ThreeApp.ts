// three/ThreeApp.ts
import * as THREE from "three";

// Gaussian splats
import * as GaussianSplats3D from "@mkkellogg/gaussian-splats-3d";

export class ThreeApp {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;

  // Flycam (manual velocity integration)
  private flyVel = new THREE.Vector3();
  private flySpeed = 3.0; // m/s
  private damping = 8.0; // higher = snappier damping
  private moving = { f: false, b: false, l: false, r: false, u: false, d: false };

  // Mouse-drag look
  private isDragging = false;
  private lastPointer = new THREE.Vector2();
  private yaw = 0; // around Y
  private pitch = 0; // around X
  private mouseSensitivity = 0.0025; // radians per pixel

  private clock = new THREE.Clock();

  private onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
  private onKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);
  private onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
  private onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private onPointerUp = (e: PointerEvent) => this.handlePointerUp(e);

  private resizeObs?: ResizeObserver;
  private prevDpr = window.devicePixelRatio || 1;

  // Gaussian splat viewer
  private gsViewer?: GaussianSplats3D.Viewer;

  // === Debug axes ===
  // World axes rendered as an overlay with the main camera
  private worldAxesScene = new THREE.Scene();
  private worldAxes?: THREE.AxesHelper;

  // Mini HUD axes rendered in a small viewport that matches camera orientation
  private axesHudScene = new THREE.Scene();
  private axesHudCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  private axesHud = new THREE.AxesHelper(0.8);

  constructor(container: HTMLElement) {
    this.container = container;

    // renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    Object.assign(this.renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
      cursor: "grab", // visible mouse; grab to indicate drag-to-rotate
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x0e1116, 1);
    this.container.appendChild(this.renderer.domElement);

    const gl = this.renderer.getContext();
    const coi =
      "crossOriginIsolated" in globalThis
        ? (globalThis as WindowOrWorkerGlobalScope).crossOriginIsolated
        : false;

    console.info(
      "WebGL2:",
      gl instanceof WebGL2RenderingContext,
      "| COI:",
      coi,
      "| SAB:",
      typeof SharedArrayBuffer !== "undefined"
    );

    // camera
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this.camera.position.set(0, 2.5, 5);

    // initialize yaw/pitch from current orientation
    {
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
      this.pitch = e.x;
      this.yaw = e.y;
    }

    // Input listeners
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.addEventListener("pointerleave", this.onPointerUp);

    // Gaussian splats viewer
    this.gsViewer = new GaussianSplats3D.Viewer({
      selfDrivenMode: false,
      renderer: this.renderer,
      camera: this.camera,
      useBuiltInControls: false,

      // toggles (safe defaults)
      gpuAcceleratedSort: false,
      sharedMemoryForWorkers: false,
      integerBasedSort: false,
      sphericalHarmonicsDegree: 1,
      logLevel: GaussianSplats3D.LogLevel.Debug,
    });

    // TEMP HARDCODED LOAD
    const bonsaiUrl = new URL(
      "../assets/gaussian_splat_data/bonsai/bonsai.ksplat",
      import.meta.url
    ).href;

    // manually tweaking this for now 
    //TODO: WE NEED SCENE BASED ROTATION SUPPORT

    const uprightQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 4, 0, Math.PI, "XYZ"));

    this.gsViewer
      .addSplatScene(bonsaiUrl, {
        position: [0, 0, 0],
        scale: [1, 1, 1],
        rotation: [uprightQ.x, uprightQ.y, uprightQ.z, uprightQ.w], // <— important
        progressiveLoad: false,
      })
      .then(() => {
        this.camera.position.set(0, 0, 2.5);
      }).catch((e) => console.error("Failed to load ksplat:", e));


    // === Debug axes setup ===
    // World axes at origin (1m). We'll render as an overlay so splats never hide them.
    this.worldAxes = new THREE.AxesHelper(1);
    this.makeAxesAlwaysOnTop(this.worldAxes);
    this.worldAxesScene.add(this.worldAxes);

    // Mini HUD axes (lower-left). Also always-on-top.
    // not working rn... fix me
    //this.makeAxesAlwaysOnTop(this.axesHud);
    //this.axesHudScene.add(this.axesHud);

    // sizing
    this.resizeToContainer();
    this.observeResize();

    // animate
    this.renderer.setAnimationLoop(this.tick);
  }

  private tick = () => {
    const dt = Math.max(0.0001, Math.min(0.1, this.clock.getDelta())); // clamp dt

    // Handle DPR changes smoothly (monitor swaps, browser zoom, etc.)
    const dpr = window.devicePixelRatio || 1;
    if (Math.abs(dpr - this.prevDpr) > 0.001) {
      this.prevDpr = dpr;
      const { clientWidth: w, clientHeight: h } = this.container;
      this.renderer.setPixelRatio(Math.min(dpr, 2));
      this.renderer.setSize(Math.max(1, w), Math.max(1, h), false);
      this.camera.aspect = (w || 1) / (h || 1);
      this.camera.updateProjectionMatrix();
    }

    // --- Fly update ---
    // Damping (frame-rate independent)
    const damp = Math.exp(-this.damping * dt);
    this.flyVel.multiplyScalar(damp);

    // Acceleration
    const speed = this.flySpeed;

    // forward/right based on yaw/pitch (no roll)
    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion)
      .normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();

    if (this.moving.f) this.flyVel.addScaledVector(forward, speed * dt);
    if (this.moving.b) this.flyVel.addScaledVector(forward, -speed * dt);
    if (this.moving.r) this.flyVel.addScaledVector(right, speed * dt);
    if (this.moving.l) this.flyVel.addScaledVector(right, -speed * dt);
    if (this.moving.u) this.flyVel.addScaledVector(worldUp, speed * dt);
    if (this.moving.d) this.flyVel.addScaledVector(worldUp, -speed * dt);

    // Apply displacement
    this.camera.position.add(this.flyVel);

    // Optionally scale the world axes so they're readable from far away
    if (this.worldAxes) {
      const dist = this.camera.position.length();
      const s = THREE.MathUtils.clamp(dist * 0.05, 0.5, 10);
      this.worldAxes.scale.setScalar(s);
    }

    this.gsViewer?.update();
    this.gsViewer?.render();

    // === Overlay renders: world axes + mini HUD axes ===
    const canvas = this.renderer.domElement;
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;

    // World axes overlay (same camera, full viewport)
    this.renderer.clearDepth(); // ensure overlay is on top
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, canvas.width, canvas.height);
    this.renderer.render(this.worldAxesScene, this.camera);

    // Mini HUD axes (lower-left)
    this.renderer.clearDepth();
    // Keep the HUD camera's orientation matched to the main camera
    this.axesHudCamera.position.set(0, 0, 2);
    this.axesHudCamera.quaternion.copy(this.camera.quaternion);
    this.axesHudCamera.updateMatrixWorld(true);

    // Size/position of the mini viewport
    const vpSizePx = Math.floor(Math.min(canvas.width, canvas.height) * 0.22); // ~22% of the shorter side
    const marginPx = 16;

    this.renderer.setScissorTest(true);
    this.renderer.setViewport(marginPx, marginPx, vpSizePx, vpSizePx);
    this.renderer.setScissor(marginPx, marginPx, vpSizePx, vpSizePx);
    this.renderer.render(this.axesHudScene, this.axesHudCamera);

    // Restore renderer state
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, canvas.width, canvas.height);
    this.renderer.autoClear = prevAutoClear;
  };

  private resizeToContainer = () => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private observeResize() {
    this.resizeObs = new ResizeObserver(() => this.resizeToContainer());
    this.resizeObs.observe(this.container);
  }

  // --- Mouse drag look ---
  private handlePointerDown(e: PointerEvent) {
    if (e.button !== 0) return; // left button to look
    this.isDragging = true;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.lastPointer.set(e.clientX, e.clientY);
    this.renderer.domElement.style.cursor = "grabbing";
  }

  private handlePointerMove(e: PointerEvent) {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer.set(e.clientX, e.clientY);

    // Update yaw/pitch with sensitivity; clamp pitch to avoid gimbal flip
    this.yaw -= dx * this.mouseSensitivity;
    this.pitch -= dy * this.mouseSensitivity;
    const limit = Math.PI / 2 - 0.001;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -limit, limit);

    // Apply to camera
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(euler);
  }

  private handlePointerUp(e: PointerEvent) {
    if (!this.isDragging) return;
    this.isDragging = false;
    try {
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      // ignore if not captured
    }
    this.renderer.domElement.style.cursor = "grab";
  }

  // --- Keyboard movement ---
  private handleKeyDown(e: KeyboardEvent) {
    // Movement: WASD, Space=up, Shift=down
    if (e.code === "KeyW") this.moving.f = true;
    if (e.code === "KeyS") this.moving.b = true;
    if (e.code === "KeyA") this.moving.l = true;
    if (e.code === "KeyD") this.moving.r = true;
    if (e.code === "Space") this.moving.u = true; // up
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.moving.d = true; // down
  }

  private handleKeyUp(e: KeyboardEvent) {
    if (e.code === "KeyW") this.moving.f = false;
    if (e.code === "KeyS") this.moving.b = false;
    if (e.code === "KeyA") this.moving.l = false;
    if (e.code === "KeyD") this.moving.r = false;
    if (e.code === "Space") this.moving.u = false;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.moving.d = false;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObs?.disconnect();

    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.removeEventListener("pointerleave", this.onPointerUp);

    // Clean up axes helpers
    if (this.worldAxes) {
      this.worldAxes.geometry.dispose();
      const mats = Array.isArray(this.worldAxes.material)
        ? this.worldAxes.material
        : [this.worldAxes.material];
      for (const m of mats) m.dispose();
    }
    {
      this.axesHud.geometry.dispose();
      const mats = Array.isArray(this.axesHud.material)
        ? this.axesHud.material
        : [this.axesHud.material];
      for (const m of mats) m.dispose();
    }

    this.gsViewer?.dispose?.();
    this.renderer.dispose();

    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  // Make AxesHelper lines render on top 
  private makeAxesAlwaysOnTop(helper: THREE.AxesHelper) {
    const materials = Array.isArray(helper.material)
      ? helper.material
      : [helper.material];
    materials.forEach((m) => {
      if (m instanceof THREE.LineBasicMaterial) {
        m.depthTest = false;
        m.depthWrite = false;
        m.transparent = true;
      }
    });
  }
}
