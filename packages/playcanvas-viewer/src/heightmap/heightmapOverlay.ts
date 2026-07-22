import * as pc from "playcanvas";
import type { HeightmapData } from "./types";
import { buildHeightmapSurfaceMesh } from "./buildHeightmapSurfaceMesh";

export type HeightmapOverlayMode = "surface" | "wire";

export type HeightmapOverlayHandle = {
  entity: pc.Entity;
  setVisible(visible: boolean): void;
  destroy(): void;
};

const HEIGHTMAP_OVERLAY_LAYER_NAME = "HeightmapDebug";

/**
 * Dedicated transparent layer rendered after `World` with the depth buffer
 * cleared, so the overlay draws consistently on top of the gsplat instead of
 * fighting it in the shared transparent sublayer (where per-object distance
 * sorting flips as the camera rotates and the splat blends over the overlay).
 */
function setupHeightmapOverlayLayer(
  app: pc.AppBase,
  cameraEntity: pc.Entity,
): pc.Layer | null {
  const composition = app.scene.layers;
  let layer = composition.getLayerByName(HEIGHTMAP_OVERLAY_LAYER_NAME);

  if (!layer) {
    layer = new pc.Layer({ name: HEIGHTMAP_OVERLAY_LAYER_NAME });
    layer.clearDepthBuffer = true;

    const worldLayer = composition.getLayerByName("World");
    let insertIndex = composition.layerList.length;
    for (let i = 0; i < composition.layerList.length; i++) {
      if (composition.layerList[i] === worldLayer && composition.subLayerList[i]) {
        insertIndex = i + 1;
        break;
      }
    }

    composition.insertTransparent(layer, insertIndex);
  }

  const camera = cameraEntity.camera;
  if (camera && !camera.layers.includes(layer.id)) {
    camera.layers = [...camera.layers, layer.id];
  }

  return layer;
}

/**
 * Build a debug surface mesh from a loaded heightmap and parent it to the splat
 * entity, so it inherits the exact world transform the ground collider queries
 * against. One vertex per filled grid cell center; quads touching an empty
 * (sentinel) cell are skipped, so holes in the heightmap render as real holes.
 *
 * Heights are stored in voxel-grid space; vertices are converted to gsplat-local
 * space via {@link voxelGridToSplatLocal} (the inverse of the sampler's mapping).
 */
export function createHeightmapOverlay(options: {
  app: pc.AppBase;
  splatEntity: pc.Entity;
  cameraEntity: pc.Entity;
  data: HeightmapData;
  mode?: HeightmapOverlayMode;
  opacity?: number;
}): HeightmapOverlayHandle | null {
  const { app, splatEntity, cameraEntity, data } = options;
  const mode = options.mode ?? "surface";
  const opacity = options.opacity ?? (mode === "wire" ? 1 : 0.6);

  const surface = buildHeightmapSurfaceMesh({
    app,
    data,
    colorMode: "height-ramp",
  });
  if (!surface) return null;

  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.emissive.set(1, 1, 1);
  material.emissiveVertexColor = true;
  material.diffuse.set(0, 0, 0);
  // X is negated between voxel-grid and splat-local, which flips triangle winding.
  material.cull = pc.CULLFACE_NONE;
  // Write depth so the heightfield occludes itself at grazing angles. The overlay
  // renders on its own depth-cleared layer, so this never fights the gsplat.
  material.depthTest = true;
  material.depthWrite = true;
  if (opacity < 1) {
    material.opacity = opacity;
    material.blendType = pc.BLEND_NORMAL;
  }
  material.update();

  const meshInstance = new pc.MeshInstance(surface.mesh, material);
  if (mode === "wire") {
    surface.mesh.generateWireframe();
    meshInstance.renderStyle = pc.RENDERSTYLE_WIREFRAME;
  }

  const overlayLayer = setupHeightmapOverlayLayer(app, cameraEntity);

  const entity = new pc.Entity("heightmap-overlay");
  entity.addComponent("render");
  if (entity.render) {
    entity.render.meshInstances = [meshInstance];
    if (overlayLayer) {
      entity.render.layers = [overlayLayer.id];
    }
  }
  splatEntity.addChild(entity);

  return {
    entity,
    setVisible(visible) {
      entity.enabled = visible;
    },
    destroy() {
      entity.destroy();
      material.destroy();
      surface.mesh.destroy();
    },
  };
}
