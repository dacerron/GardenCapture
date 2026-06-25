// @ts-nocheck
import * as pc from "playcanvas";

export const EDITOR_OVERLAY_LAYER_NAME = "EditorOverlay";

/** Transparent editor gizmo layer rendered after World, with depth cleared so it draws on top of the splat. */
export function setupEditorOverlayLayer(
  app: pc.AppBase,
  cameraEntity: pc.Entity,
): pc.Layer {
  const composition = app.scene.layers;
  let layer = composition.getLayerByName(EDITOR_OVERLAY_LAYER_NAME);

  if (!layer) {
    layer = new pc.Layer({ name: EDITOR_OVERLAY_LAYER_NAME });
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
  if (!camera.layers.includes(layer.id)) {
    camera.layers = [...camera.layers, layer.id];
  }

  return layer;
}

export function assignRenderLayerRecursive(entity: pc.Entity, layerId: number) {
  if (entity.render) {
    entity.render.layers = [layerId];
  }
  for (const child of entity.children) {
    assignRenderLayerRecursive(child, layerId);
  }
}
