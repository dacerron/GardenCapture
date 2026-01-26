// ThreeApp.ts
import * as THREE from "three";
import { FlyControls } from "./FlyControls";
import { ScreenSpaceUI } from "./ScreenSpace";
import { GaussianViewer } from "./GaussianViewer";
import { WorldMarkers } from "./WorldMarkers";
import { Skybox } from "./Skybox";
import { LoadingOverlay } from "./LoadingOverlay";
import { MarkerPickingController } from "./Interaction";


const DEFAULT_SKYBOX_URL = "/citrus_orchard_puresky_4k.hdr"; 

//we can change this per scene if we wanted to..
const DEFAULT_PLAY_AREA_BOUNDS = new THREE.Box3(
  new THREE.Vector3(-25, -5, -25),
  new THREE.Vector3(25, 15, 25)
);


export class ThreeApp {
  // Core
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private camera!: THREE.PerspectiveCamera;

  // Loop state
  private clock = new THREE.Clock();
  private fps = 0;
  private destroyed = false;

  // Resize
  private resizeObs?: ResizeObserver;
  private prevDpr = window.devicePixelRatio || 1;

  // Systems
  private controls!: FlyControls;
  private screenUI!: ScreenSpaceUI;
  private gaussian!: GaussianViewer;
  private skybox!: Skybox;
  private overlay!: LoadingOverlay;
  private markers!: WorldMarkers;

  // Picking
  private markerPicking!: MarkerPickingController;

  // Debug
  private worldAxesScene = new THREE.Scene();
  private worldAxes?: THREE.AxesHelper;
  private playAreaBounds: THREE.Box3 | null = null;


  // ------------------
  // CONSTRUCTOR
  // ------------------
  constructor(container: HTMLElement) {
    this.container = container;

    //systems
    this.initRenderer();
    this.initCamera();
    this.initGaussianViewer(); //needs cam,renderer

    this.initUI();
    this.initControls();
    this.initScene();

    // sizing
    this.resizeToContainer(false);
    this.observeResize();

    //start
    this.renderer.setAnimationLoop(this.tick);
  }

  private initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    Object.assign(this.renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
      cursor: "grab",
    });
    this.renderer.autoClear = false;

    // Set outputColorSpace if present in this three version
    if ("outputColorSpace" in this.renderer) {
      (
        this.renderer as unknown as { outputColorSpace: THREE.ColorSpace }
      ).outputColorSpace = THREE.SRGBColorSpace;
    }

    this.renderer.setClearColor(0x0e1116, 1);
    this.container.appendChild(this.renderer.domElement);
  }

  private initGaussianViewer() {
    this.gaussian = new GaussianViewer(this.renderer, this.camera);
  }

  private initUI() {
    this.screenUI = new ScreenSpaceUI(this.container);
    this.overlay = new LoadingOverlay(this.container);
  }

  private initCamera() {
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this.camera.position.set(0, 2.5, 5);
  }

  private initControls() {
    this.controls = new FlyControls(this.camera, this.renderer.domElement);
    this.setPlayAreaBounds(DEFAULT_PLAY_AREA_BOUNDS);
    this.screenUI.setSpeedChangeHandler((v) => this.controls.setFlySpeed(v));
    this.screenUI.setSpeed(this.controls.getFlySpeed());
  }

  private initSkybox() {
    this.skybox = new Skybox();
    void this.skybox
      .setEquirectangular(DEFAULT_SKYBOX_URL)
      .then(() => {
        if (this.markers) {
          this.markers.setEnvironmentMap(this.skybox.getEnvironmentMap());
        }
      });
  }

  private initScene() {
    this.markers = new WorldMarkers();
    this.markerPicking = new MarkerPickingController({
      dom: this.renderer.domElement,
      camera: this.camera,
      markers: this.markers,
      moveThresholdPx: 6,
    });
    this.initSkybox();
    this.worldAxes = new THREE.AxesHelper(1);
    this.worldAxesScene.add(this.worldAxes);
  }


  // ------------------
  // MAIN LOOP
  // ------------------
  private tick = () => {
    const dt = this.updateFPS();
    this.resizeToContainer();
    this.beginFrame();
    this.update(dt);
    this.renderFrame();
    this.renderDebug();
  };

  private beginFrame() {
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);
  }

  private update(dt: number) {
    this.controls.update(dt);
    this.gaussian.update();
    this.screenUI.setPlayerWorldPosition(this.camera.position);
    this.screenUI.setFps(this.fps);
    this.screenUI.update();
  }

  private renderFrame() {
    this.skybox.render(this.renderer, this.camera);
    this.markers.render(this.renderer, this.camera);
    this.gaussian.render();
  }

  private renderDebug() {
    this.renderer.clearDepth();
    this.renderer.render(this.worldAxesScene, this.camera);
  }

  // -------------------------------------------------------------------------
  //PUBLIC METHODS-------------------------------------------------------------------------
  //-------------------------------------------------------------------------

  public async loadGaussianScene(path: string) {
    if (this.destroyed) return;
    this.overlay.show();
    try {
      await this.gaussian.loadScene(path);
      if (!this.destroyed) {
        this.camera.position.set(0, 2.5, 5);
      }
    } finally {
      if (!this.destroyed) this.overlay.hide();
    }
  }

  //we will use this later probably
  public async setSkybox(path: string | null | undefined) {
    if (this.destroyed) return;
    await this.skybox.setEquirectangular(path);
    this.markers.setEnvironmentMap(this.skybox.getEnvironmentMap());
  }

  public setWorldMarkers(markers: Parameters<WorldMarkers["setMarkers"]>[0]) {
    this.markers.setMarkers(markers);
  }

  public setPlayAreaBounds(bounds: THREE.Box3 | null | undefined) {
    this.playAreaBounds = bounds ? bounds.clone() : null;
    this.controls.setBounds(this.playAreaBounds);
  }

  // -------------------------------------------------------------------------
  //HELPER METHODS-------------------------------------------------------------------------
  //-------------------------------------------------------------------------

  private resizeToContainer(force = false) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!force && Math.abs(dpr - this.prevDpr) < 0.001) return;

    this.prevDpr = dpr;

    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private observeResize() {
    this.resizeObs = new ResizeObserver(() => this.resizeToContainer(true));
    this.resizeObs?.observe(this.container);
  }

  private updateFPS(): number {
    const dt = Math.max(0.0001, Math.min(0.1, this.clock.getDelta()));
    const instFps = 1 / dt;
    this.fps =
      this.fps === 0
        ? instFps
        : THREE.MathUtils.lerp(this.fps, instFps, 0.1); // smooth a bit
      
    return dt;
  }

  dispose() {
    this.destroyed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObs?.disconnect();
    this.markerPicking.dispose();

    // Dispose controls
    this.controls.dispose();

    if (this.worldAxes) {
      this.worldAxes.geometry.dispose();
      const mats = Array.isArray(this.worldAxes.material)
        ? this.worldAxes.material
        : [this.worldAxes.material];
      for (const m of mats) {
        if ("dispose" in m && typeof m.dispose === "function") m.dispose();
      }
    }

    this.skybox.dispose();
    this.gaussian.dispose();
    this.screenUI.dispose();
    this.overlay.dispose();
    this.markers.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
