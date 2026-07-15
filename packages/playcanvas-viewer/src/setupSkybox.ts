import * as pc from "playcanvas";
import type { SkyboxMode } from "./parseSkyboxMode";

/** Same asset as legacy `ThreeApp` (`/viewer/`). Served from the viewer site origin. */
export const DEFAULT_SKYBOX_URL = "/citrus_orchard_puresky_4k.hdr";

/** Match legacy `packages/shared/src/three/Skybox.ts` horizon fade (world-space Y). */
export const SKYBOX_FADE_START = -0.4;
export const SKYBOX_FADE_END = -0.2;

/** Below-horizon fill; legacy sky shader mixes to pure black. */
export const SKYBOX_GROUND_COLOR = new pc.Color(0, 0, 0);

/** Clear color used by the pre-fix infinite cubemap sky path. */
export const INFINITE_SKYBOX_CLEAR_COLOR = new pc.Color(0.055, 0.067, 0.086);

/** Solid surround for `?skybox=blue` transparency A/B checks. */
export const SOLID_BLUE_SKYBOX_COLOR = new pc.Color(0.22, 0.48, 0.92);

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

const SOLID_SKY_FRAGMENT_GLSL = /* glsl */ `
precision highp float;

uniform vec3 skyColor;

void main(void) {
    gl_FragColor = vec4(skyColor, 1.0);
}
`;

export type SkyboxHandle = {
  destroy: () => void;
};

export type SetupSkyboxOptions = {
  /** Equirectangular sky texture URL. Omit for default HDR; pass `null` to disable. Ignored when mode is `blue`. */
  skyboxUrl?: string | null;
  /** `blue` = solid blue; `infinite` = pre-fix PlayCanvas wraparound cubemap. */
  mode?: SkyboxMode;
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

function createSolidSkyMaterial(color: pc.Color): pc.ShaderMaterial {
  const material = new pc.ShaderMaterial({
    uniqueName: "solid-skybox",
    attributes: {
      aPosition: pc.SEMANTIC_POSITION,
    },
    vertexGLSL: SKY_VERTEX_GLSL,
    fragmentGLSL: SOLID_SKY_FRAGMENT_GLSL,
  });
  material.cull = pc.CULLFACE_NONE;
  material.depthWrite = false;
  material.depthTest = false;
  material.setParameter("skyColor", [color.r, color.g, color.b]);
  material.update();
  return material;
}

function attachSkySphere(
  app: pc.AppBase,
  cameraEntity: pc.Entity,
  material: pc.ShaderMaterial,
  name: string,
): { skyEntity: pc.Entity; onUpdate: () => void } {
  const skyEntity = new pc.Entity(name);
  skyEntity.addComponent("render", {
    type: "sphere",
    material,
    castShadows: false,
    receiveShadows: false,
    layers: [pc.LAYERID_SKYBOX],
  });
  skyEntity.setLocalScale(SKY_SPHERE_SCALE, SKY_SPHERE_SCALE, SKY_SPHERE_SCALE);
  app.root.addChild(skyEntity);

  const syncSkyPosition = () => {
    skyEntity.setPosition(cameraEntity.getPosition());
  };
  syncSkyPosition();

  const onUpdate = () => {
    syncSkyPosition();
  };
  app.on("update", onUpdate);

  return { skyEntity, onUpdate };
}

/**
 * Load equirect HDR into a PlayCanvas infinite cubemap (sky wraps under the ground).
 * This was the default before the horizon-fade transparency fix.
 */
function setupInfiniteCubemapSkybox(
  app: pc.AppBase,
  skyboxUrl: string,
): SkyboxHandle {
  let destroyed = false;
  let skyboxCubemap: pc.Texture | null = null;
  let asset: pc.Asset | null = null;

  const destroy = () => {
    destroyed = true;
    if (skyboxCubemap) {
      app.scene.skybox = null;
      skyboxCubemap.destroy();
      skyboxCubemap = null;
    }
    if (asset) {
      asset.unload();
      app.assets.remove(asset);
      asset = null;
    }
  };

  asset = new pc.Asset("skybox", "texture", { url: skyboxUrl }, { mipmaps: false });
  app.assets.add(asset);

  asset.on("load", () => {
    if (destroyed || !asset) return;

    const source = asset.resource as pc.Texture | undefined;
    if (!source) {
      console.warn("[playcanvas-viewer] Skybox texture missing after load");
      asset.unload();
      app.assets.remove(asset);
      asset = null;
      return;
    }

    skyboxCubemap = pc.EnvLighting.generateSkyboxCubemap(source);
    app.scene.sky.type = pc.SKYTYPE_INFINITE;
    app.scene.skybox = skyboxCubemap;

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

/**
 * Default: legacy-style equirect sky — full sky above the horizon, fading to black
 * a few degrees below it (does not wrap under the ground).
 * Pass `mode: "blue"` for a solid blue surround, or `mode: "infinite"` for the
 * pre-fix PlayCanvas wraparound cubemap.
 */
export function setupPlayCanvasSkybox(
  app: pc.AppBase,
  cameraEntity: pc.Entity,
  skyboxUrlOrOptions: string | null | undefined | SetupSkyboxOptions = DEFAULT_SKYBOX_URL,
): SkyboxHandle {
  const options: SetupSkyboxOptions =
    skyboxUrlOrOptions !== null &&
    typeof skyboxUrlOrOptions === "object" &&
    !Array.isArray(skyboxUrlOrOptions)
      ? skyboxUrlOrOptions
      : { skyboxUrl: skyboxUrlOrOptions as string | null | undefined };

  const mode = options.mode ?? "default";
  const skyboxUrl =
    mode === "blue"
      ? null
      : options.skyboxUrl === undefined
        ? DEFAULT_SKYBOX_URL
        : options.skyboxUrl;

  let destroyed = false;
  let asset: pc.Asset | null = null;
  let skyEntity: pc.Entity | null = null;
  let material: pc.ShaderMaterial | null = null;
  let onUpdate: (() => void) | null = null;

  app.scene.skybox = null;

  const destroy = () => {
    destroyed = true;
    if (onUpdate) {
      app.off("update", onUpdate);
      onUpdate = null;
    }
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

  if (mode === "blue") {
    material = createSolidSkyMaterial(SOLID_BLUE_SKYBOX_COLOR);
    const attached = attachSkySphere(app, cameraEntity, material, "solid-blue-sky");
    skyEntity = attached.skyEntity;
    onUpdate = attached.onUpdate;
    return { destroy };
  }

  if (mode === "infinite") {
    if (!skyboxUrl) {
      return { destroy };
    }
    return setupInfiniteCubemapSkybox(app, skyboxUrl);
  }

  if (!skyboxUrl) {
    return { destroy };
  }

  material = createHorizonSkyMaterial();
  const attached = attachSkySphere(app, cameraEntity, material, "horizon-sky");
  skyEntity = attached.skyEntity;
  onUpdate = attached.onUpdate;

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

/** Clear / camera background color for a given skybox mode. */
export function skyboxClearColor(mode: SkyboxMode = "default"): pc.Color {
  if (mode === "blue") return SOLID_BLUE_SKYBOX_COLOR.clone();
  if (mode === "infinite") return INFINITE_SKYBOX_CLEAR_COLOR.clone();
  return SKYBOX_GROUND_COLOR.clone();
}
