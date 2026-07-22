import * as pc from "playcanvas";
import type { HeightmapData } from "./types";
import { buildHeightmapCellCapsMesh } from "./buildHeightmapCellCapsMesh";

export type HeightmapOccluderHandle = {
  entity: pc.Entity;
  setVisible(visible: boolean): void;
  destroy(): void;
};

/** Default offset below the extracted heightmap surface (meters, voxel-grid Y). */
export const DEFAULT_HEIGHTMAP_OCCLUDER_Y_OFFSET = 0.08;

function createDepthOnlyOccluderMaterial(): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.set(0, 0, 0);
  material.opacity = 1;
  // X is negated between voxel-grid and splat-local, which flips triangle winding.
  material.cull = pc.CULLFACE_NONE;
  material.depthTest = true;
  material.depthWrite = true;
  // Depth-only in the main pass; prepass still emits linear depth for gsplat testing.
  material.redWrite = false;
  material.greenWrite = false;
  material.blueWrite = false;
  material.alphaWrite = false;
  material.update();
  return material;
}

/**
 * Invisible horizontal cell-cap occluder parented to the splat entity. Each filled
 * heightmap cell becomes a flat XZ plate (no walls between neighbors). Writes depth
 * during the CameraFrame prepass so splats behind the plates are skipped.
 */
export function createHeightmapOccluder(options: {
  app: pc.AppBase;
  splatEntity: pc.Entity;
  data: HeightmapData;
  yOffset?: number;
}): HeightmapOccluderHandle | null {
  const { app, splatEntity, data } = options;
  const yOffset = options.yOffset ?? DEFAULT_HEIGHTMAP_OCCLUDER_Y_OFFSET;

  const caps = buildHeightmapCellCapsMesh({
    app,
    data,
    yOffset,
  });
  if (!caps) return null;

  const material = createDepthOnlyOccluderMaterial();
  const meshInstance = new pc.MeshInstance(caps.mesh, material);

  const entity = new pc.Entity("heightmap-occluder");
  entity.addComponent("render");
  if (entity.render) {
    entity.render.meshInstances = [meshInstance];
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
      caps.mesh.destroy();
    },
  };
}
