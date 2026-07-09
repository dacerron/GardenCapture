import * as pc from "playcanvas";

/** Same asset as legacy `ThreeApp` (`/viewer/`). Served from the viewer site origin. */
export const DEFAULT_SKYBOX_URL = "/citrus_orchard_puresky_4k.hdr";

/** Match legacy `packages/shared/src/three/Skybox.ts` horizon fade (world-space Y). */
export const SKYBOX_FADE_START = -0.4;
export const SKYBOX_FADE_END = -0.2;

/** Below-horizon fill; legacy sky shader mixes to pure black. */
export const SKYBOX_GROUND_COLOR = new pc.Color(0, 0, 0);

const SKY_SPHERE_SCALE = 2;

const SKY_VERTEX_GLSL = /* glsl */ `
attribute vec3 aPosition;

varying vec3 vWorldDir;

void main(void) {
    vWorldDir = normalize(aPosition);
    gl_Position = matrix_viewProjection * matrix_model * vec4(aPosition, 1.0);
}
`;

const SKY_FRAGMENT_GLSL = /* glsl */ `
precision highp float;

uniform sampler2D map;
uniform float fadeStart;
uniform float fadeEnd;

varying vec3 vWorldDir;

const float PI = 3.141592653589793;

vec2 equirectUv(vec3 dir) {
    dir = normalize(dir);
    float u = atan(dir.z, dir.x) / (2.0 * PI) + 0.5;
    float v = asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5;
    return vec2(u, v);
}

void main(void) {
    vec3 dir = normalize(vWorldDir);
    float t = smoothstep(fadeStart, fadeEnd, dir.y);
    vec3 sky = texture2D(map, equirectUv(dir)).rgb;
    gl_FragColor = vec4(mix(vec3(0.0), sky, t), 1.0);
}
`;

export type SkyboxHandle = {
  destroy: () => void;
};

function createHorizonSkyMaterial(): pc.ShaderMaterial {
  const material = new pc.ShaderMaterial({
    uniqueName: "horizon-skybox",
    attributes: {
      aPosition: pc.SEMANTIC_POSITION,
    },
    vertexGLSL: SKY_VERTEX_GLSL,
    fragmentGLSL: SKY_FRAGMENT_GLSL,
  });
  material.cull = pc.CULLFACE_NONE;
  material.depthWrite = false;
  material.depthTest = false;
  material.setParameter("fadeStart", SKYBOX_FADE_START);
  material.setParameter("fadeEnd", SKYBOX_FADE_END);
  material.update();
  return material;
}

/**
 * Legacy-style equirect sky: full sky above the horizon, fading to black a few
 * degrees below it (does not wrap under the ground like PlayCanvas infinite sky).
 */
export function setupPlayCanvasSkybox(
  app: pc.AppBase,
  cameraEntity: pc.Entity,
  skyboxUrl: string | null | undefined = DEFAULT_SKYBOX_URL,
): SkyboxHandle {
  let destroyed = false;
  let asset: pc.Asset | null = null;
  let skyEntity: pc.Entity | null = null;
  let material: pc.ShaderMaterial | null = null;

  app.scene.skybox = null;

  const syncSkyPosition = () => {
    if (!skyEntity || destroyed) return;
    skyEntity.setPosition(cameraEntity.getPosition());
  };

  const onUpdate = () => {
    syncSkyPosition();
  };

  const destroy = () => {
    destroyed = true;
    app.off("update", onUpdate);
    if (skyEntity) {
      skyEntity.destroy();
      skyEntity = null;
    }
    material?.destroy();
    material = null;
    if (asset) {
      asset.unload();
      app.assets.remove(asset);
      asset = null;
    }
    app.scene.skybox = null;
  };

  if (!skyboxUrl) {
    return { destroy };
  }

  material = createHorizonSkyMaterial();

  skyEntity = new pc.Entity("horizon-sky");
  skyEntity.addComponent("render", {
    type: "sphere",
    material,
    castShadows: false,
    receiveShadows: false,
    layers: [pc.LAYERID_SKYBOX],
  });
  skyEntity.setLocalScale(SKY_SPHERE_SCALE, SKY_SPHERE_SCALE, SKY_SPHERE_SCALE);
  app.root.addChild(skyEntity);
  syncSkyPosition();
  app.on("update", onUpdate);

  asset = new pc.Asset("skybox", "texture", { url: skyboxUrl }, { mipmaps: false });
  app.assets.add(asset);

  asset.on("load", () => {
    if (destroyed || !asset || !material) return;

    const texture = asset.resource as pc.Texture | undefined;
    if (!texture) {
      console.warn("[playcanvas-viewer] Skybox texture missing after load");
      return;
    }

    material.setParameter("map", texture);
    material.update();

    asset.unload();
    app.assets.remove(asset);
    asset = null;
  });

  asset.on("error", (err: string) => {
    if (destroyed) return;
    console.warn("[playcanvas-viewer] Skybox load failed:", err);
  });

  app.assets.load(asset);

  return { destroy };
}
