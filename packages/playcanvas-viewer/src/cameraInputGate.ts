// @ts-nocheck
import { KeyboardMouseSource } from "playcanvas";
import type { CameraControls } from "playcanvas/scripts/esm/camera-controls.mjs";

type Controls = InstanceType<typeof CameraControls>;

export type CameraControlHooks = {
  pauseCameraControls(): void;
  resumeCameraControls(): void;
};

/**
 * CameraControls accumulates keyboard edge deltas into `_state.axis`. While controls
 * are disabled during gizmo drags, keyup/keydown still update the source but those
 * deltas are not consumed until resume — which can leave a negative axis and fly the
 * camera backward. Rebuild movement state from the current key snapshot instead.
 */
function resyncCameraControlInput(controls: Controls) {
  const desktop = controls._desktopInput;
  if (!desktop?._keyNow || !desktop?._keyPrev) return;

  const { keyCode } = KeyboardMouseSource;
  const keyNow = desktop._keyNow;
  const state = controls._state;

  for (let i = 0; i < desktop._keyPrev.length; i++) {
    desktop._keyPrev[i] = keyNow[i];
  }
  desktop.read();
  controls._orbitMobileInput?.read();
  controls._flyMobileInput?.read();
  controls._gamepadInput?.read();

  state.axis.set(
    keyNow[keyCode.D] -
      keyNow[keyCode.A] +
      keyNow[keyCode.RIGHT] -
      keyNow[keyCode.LEFT],
    keyNow[keyCode.E] - keyNow[keyCode.Q],
    keyNow[keyCode.W] -
      keyNow[keyCode.S] +
      keyNow[keyCode.UP] -
      keyNow[keyCode.DOWN],
  );
  state.shift = keyNow[keyCode.SHIFT];
  state.ctrl = keyNow[keyCode.CTRL];
}

export function createCameraInputGate(controls: Controls | null): {
  hooks: CameraControlHooks;
  setCameraInputEnabled(enabled: boolean): void;
} {
  let suppressed = false;

  const pauseCameraControls = () => {
    if (!controls) return;
    resyncCameraControlInput(controls);
    controls.enabled = false;
  };

  const resumeCameraControls = () => {
    if (!controls || suppressed) return;
    resyncCameraControlInput(controls);
    controls.enabled = true;
  };

  return {
    hooks: {
      pauseCameraControls,
      resumeCameraControls,
    },
    setCameraInputEnabled(enabled: boolean) {
      suppressed = !enabled;
      if (suppressed) {
        pauseCameraControls();
        return;
      }
      resumeCameraControls();
    },
  };
}
