import * as pc from "playcanvas";

/** Same asset as legacy `ThreeApp` (`/viewer/`). Served from the viewer site origin. */
export const DEFAULT_SKYBOX_URL = "/citrus_orchard_puresky_4k.hdr";

export type SkyboxHandle = {
  destroy: () => void;
};

/**
 * Load an equirectangular HDR (or LDR) sky texture and assign it to the scene skybox.
 * Loads asynchronously and does not block splat startup.
 */
export function setupPlayCanvasSkybox(
  app: pc.AppBase,
  skyboxUrl: string | null | undefined = DEFAULT_SKYBOX_URL,
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

  if (!skyboxUrl) {
    return { destroy };
  }

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
