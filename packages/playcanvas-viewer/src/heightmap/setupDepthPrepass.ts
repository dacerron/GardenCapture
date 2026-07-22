import * as pc from "playcanvas";

export type DepthPrepassHandle = {
  destroy(): void;
};

/**
 * Enable CameraFrame's scene depth prepass so compute gsplats can depth-test
 * against opaque meshes rendered earlier in the World layer.
 */
export function setupDepthPrepass(
  app: pc.AppBase,
  cameraEntity: pc.Entity,
): DepthPrepassHandle | null {
  const cameraComponent = cameraEntity.camera;
  if (!cameraComponent) return null;

  const cameraFrame = new pc.CameraFrame(app, cameraComponent);
  cameraFrame.rendering.sceneDepthMap = true;
  cameraFrame.rendering.toneMapping = pc.TONEMAP_LINEAR;
  cameraFrame.enabled = true;
  cameraFrame.update();

  const onPostUpdate = () => {
    if (cameraFrame.enabled) {
      cameraFrame.update();
    }
  };
  app.on("postupdate", onPostUpdate);

  return {
    destroy() {
      app.off("postupdate", onPostUpdate);
      cameraFrame.enabled = false;
      cameraFrame.destroy();
    },
  };
}
