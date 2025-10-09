import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import vert from "../shaders/test.vert";
import frag from "../shaders/test.frag";

export class ThreeApp {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private resizeObs?: ResizeObserver;
  private prevDpr = window.devicePixelRatio || 1;
  private shaderMats: THREE.ShaderMaterial[] = [];

  constructor(container: HTMLElement) {
    this.container = container;

    // renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    Object.assign(this.renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // scene & camera
    this.scene.background = new THREE.Color(0x0e1116);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this.camera.position.set(0, 2.5, 5);

    // lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemi.position.set(0, 20, 0);
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(3, 10, 5);
    dir.castShadow = true;
    this.scene.add(hemi, dir);

    // ground
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.update();

    // material
    const shaderMat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      glslVersion: THREE.GLSL3,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color("#ff6b6b") },
        uHasBaseColorMap: { value: false },
        uBaseColorMap: { value: null },
      },
    });

    // test
    shaderMat.uniforms.uTime.value = performance.now() * 0.001;

    // model
    const loader = new GLTFLoader();
    loader.load("/models/DamagedHelmet.glb", (gltf: GLTF) => {
      const model = gltf.scene;
      model.position.set(0, 1, 0);

      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const src = obj.material as THREE.MeshStandardMaterial;
          const mat = shaderMat.clone() as THREE.ShaderMaterial;

          const baseMap = src?.map ?? null;
          mat.uniforms.uHasBaseColorMap.value = !!baseMap;
          mat.uniforms.uBaseColorMap.value = baseMap;

          obj.material = mat;
          this.shaderMats.push(mat);
        }
      });

      this.scene.add(model);
    });

    // demo box
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0xff6b6b,
        metalness: 0.2,
        roughness: 0.6,
      })
    );
    box.position.set(2, 0.5, 2);
    box.castShadow = true;
    this.scene.add(box);

    // initial size + observers
    this.resizeToContainer();
    this.observeResize();

    // animate
    this.renderer.setAnimationLoop(this.tick);
  }

  private tick = () => {
    const time = performance.now() * 0.001;

    // Update all shader materials
    for (const mat of this.shaderMats) {
      mat.uniforms.uTime.value = time;
    }

    // Handle DPR changes smoothly (monitor swaps, zoom, etc.)
    const dpr = window.devicePixelRatio || 1;
    if (Math.abs(dpr - this.prevDpr) > 0.001) {
      this.prevDpr = dpr;
      // keep buffer size in sync with DPR
      const { clientWidth: w, clientHeight: h } = this.container;
      this.renderer.setPixelRatio(Math.min(dpr, 2));
      this.renderer.setSize(Math.max(1, w), Math.max(1, h), false);
      this.camera.aspect = (w || 1) / (h || 1);
      this.camera.updateProjectionMatrix();
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
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

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObs?.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
