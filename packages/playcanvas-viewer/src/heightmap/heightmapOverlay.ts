import * as pc from "playcanvas";
import type { HeightmapData } from "./types";
import { voxelGridToSplatLocal } from "./coordinates";

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

/** Match the sampler's "filled" test: sentinel + small epsilon guards float noise. */
const SENTINEL_EPS = 1;

function isFilled(value: number, sentinel: number): boolean {
  return Number.isFinite(value) && value > sentinel + SENTINEL_EPS;
}

/** Low → high elevation ramp: blue → cyan → green → yellow → red. */
function heightRamp(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  const stops: Array<[number, number, number]> = [
    [0.15, 0.2, 0.75],
    [0.1, 0.75, 0.85],
    [0.2, 0.8, 0.25],
    [0.95, 0.85, 0.15],
    [0.9, 0.2, 0.15],
  ];
  const seg = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
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
  const { meta, heights } = data;
  const [originX, originZ] = meta.origin;
  const { cellSize, width, depth, sentinel } = meta;

  let minH = Infinity;
  let maxH = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    if (!isFilled(h, sentinel)) continue;
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }
  if (!Number.isFinite(minH)) return null;
  const span = maxH - minH || 1;

  const vertexIndex = new Int32Array(width * depth).fill(-1);
  const positions: number[] = [];
  const colors: number[] = [];
  let vcount = 0;

  for (let gz = 0; gz < depth; gz++) {
    for (let gx = 0; gx < width; gx++) {
      const idx = gz * width + gx;
      const h = heights[idx];
      if (!isFilled(h, sentinel)) continue;
      const vgX = originX + (gx + 0.5) * cellSize;
      const vgZ = originZ + (gz + 0.5) * cellSize;
      const [lx, ly, lz] = voxelGridToSplatLocal(vgX, h, vgZ);
      positions.push(lx, ly, lz);
      const [r, g, b] = heightRamp((h - minH) / span);
      colors.push(r, g, b, 1);
      vertexIndex[idx] = vcount++;
    }
  }

  const indices: number[] = [];
  for (let gz = 0; gz < depth - 1; gz++) {
    for (let gx = 0; gx < width - 1; gx++) {
      const i00 = vertexIndex[gz * width + gx];
      const i10 = vertexIndex[gz * width + gx + 1];
      const i01 = vertexIndex[(gz + 1) * width + gx];
      const i11 = vertexIndex[(gz + 1) * width + gx + 1];
      if (i00 < 0 || i10 < 0 || i01 < 0 || i11 < 0) continue;
      indices.push(i00, i10, i11, i00, i11, i01);
    }
  }

  if (indices.length === 0) return null;

  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.setColors(colors, 4);
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);

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

  const meshInstance = new pc.MeshInstance(mesh, material);
  if (mode === "wire") {
    mesh.generateWireframe();
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
      mesh.destroy();
    },
  };
}
