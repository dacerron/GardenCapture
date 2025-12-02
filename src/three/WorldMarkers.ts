import * as THREE from "three";

type MarkerInput =
  | {
      position: THREE.Vector3;
      color?: THREE.ColorRepresentation;
      radius?: number;
      texture?: THREE.Texture;
    }
  | {
      position: [number, number, number];
      color?: THREE.ColorRepresentation;
      radius?: number;
      texture?: THREE.Texture;
    };

/**
 * Simple world-space markers rendered with depth testing.
 * Sprites stay billboarded toward the camera while still writing depth
 * so Gaussian splats can occlude them.
 */
export class WorldMarkers {
  private scene = new THREE.Scene();
  private markers: THREE.Sprite[] = [];
  private envMap: THREE.Texture | null = null;
  private defaultTexture: THREE.Texture;

  constructor() {
    this.defaultTexture = WorldMarkers.createDefaultTexture();
  }

  setMarkers(markers: MarkerInput[]) {
    this.clear();

    for (const marker of markers) {
      const pos =
        marker.position instanceof THREE.Vector3
          ? marker.position
          : new THREE.Vector3(...marker.position);

      const radius = marker.radius ?? 0.25;
      const texture = marker.texture ?? this.defaultTexture;
      const mat = new THREE.SpriteMaterial({
        map: texture,
        color: marker.color ?? "#ffffff",
        depthTest: true,
        depthWrite: true,
        transparent: true,
        alphaTest: 0.4, // discard low-alpha texels so depth doesn't become a big quad
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.scale.setScalar(radius * 2); // approximate diameter
      this.scene.add(sprite);
      this.markers.push(sprite);
    }
  }

  setEnvironmentMap(envMap: THREE.Texture | null) {
    this.envMap = envMap;
    this.scene.environment = envMap ?? null;
    for (const mesh of this.markers) {
      const mat = mesh.material;
      if ("envMap" in mat) {
        (mat as THREE.MeshStandardMaterial).envMap = envMap ?? undefined;
        mat.needsUpdate = true;
      }
    }
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    const gl = renderer.getContext();
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.depthFunc(gl.LEQUAL);
    renderer.render(this.scene, camera);
  }

  dispose() {
    this.clear();
    this.defaultTexture.dispose();
  }

  private clear() {
    for (const mesh of this.markers) {
      this.scene.remove(mesh);
      if ("dispose" in mesh.material && typeof mesh.material.dispose === "function") {
        mesh.material.dispose();
      }
    }
    this.markers = [];
  }

  private static createDefaultTexture(): THREE.Texture {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create canvas context for marker texture.");

    ctx.clearRect(0, 0, size, size);
    const gradient = ctx.createRadialGradient(
      size * 0.5,
      size * 0.5,
      size * 0.05,
      size * 0.5,
      size * 0.5,
      size * 0.45
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,204,0,0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.5, size * 0.45, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false; // avoid alpha bleed in mips
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }
}
