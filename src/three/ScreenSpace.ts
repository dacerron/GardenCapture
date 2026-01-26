// ScreenSpace.ts
import * as THREE from "three";

export class ScreenSpaceUI {
  private container: HTMLElement;
  private root: HTMLDivElement;
  private positionLabel: HTMLDivElement;
  private fpsLabel: HTMLDivElement;
  private speedWrap: HTMLDivElement;
  private speedValue: HTMLSpanElement;
  private onSpeedChange?: (value: number) => void;

  private playerWorldPos = new THREE.Vector3();
  private fps = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    console.log("ScreenSpaceUI created");
    // Make sure the container can host absolutely positioned children
    const style = getComputedStyle(container);
    if (style.position === "static" || !style.position) {
      container.style.position = "relative";
    }

    // Root overlay element 
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      alignItems: "flex-start",
      padding: "8px",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: "12px",
      color: "#ffffff",
    });

    //  world position lavel
    this.positionLabel = document.createElement("div");
    Object.assign(this.positionLabel.style, {
        background: "rgba(0, 0, 0, 0.5)", 
        padding: "4px 8px",
        borderRadius: "4px",
        whiteSpace: "pre",
    });
    this.positionLabel.textContent = "Player world: (0, 0, 0)";


    //fps label
    this.fpsLabel = document.createElement("div");
    Object.assign(this.fpsLabel.style, {
      background: "rgba(0, 0, 0, 0.5)",
      padding: "4px 8px",
      borderRadius: "4px",
      whiteSpace: "pre",
    });
    this.fpsLabel.textContent = "FPS: 0";

    // speed slider
    this.speedWrap = document.createElement("div");
    Object.assign(this.speedWrap.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 8px",
      background: "rgba(0, 0, 0, 0.5)",
      borderRadius: "4px",
      pointerEvents: "auto",
    });

    const speedLabel = document.createElement("span");
    speedLabel.textContent = "Speed";
    this.speedValue = document.createElement("span");
    this.speedValue.textContent = "";
    Object.assign(this.speedValue.style, { minWidth: "42px", textAlign: "right" });

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0.05";
    slider.max = "3";
    slider.step = "0.05";
    slider.value = "0.5";
    Object.assign(slider.style, { width: "120px" });
    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      this.speedValue.textContent = `${v.toFixed(2)} units/s`;
      this.onSpeedChange?.(v);
    });

    this.speedWrap.appendChild(speedLabel);
    this.speedWrap.appendChild(slider);
    this.speedWrap.appendChild(this.speedValue);

    this.root.appendChild(this.positionLabel);
    this.root.appendChild(this.fpsLabel);
    this.root.appendChild(this.speedWrap);
    this.container.appendChild(this.root);
  }

  /**
   *  every frame
   */
  public setPlayerWorldPosition(pos: THREE.Vector3) {
    this.playerWorldPos.copy(pos);
  }

  public setFps(fps: number) {
    this.fps = fps;
  }

  public setSpeed(value: number) {
    this.speedValue.textContent = `${value.toFixed(2)} units/s`;
    const slider = this.speedWrap.querySelector("input[type=range]") as HTMLInputElement | null;
    if (slider) slider.value = value.toString();
  }

  public setSpeedChangeHandler(fn: (value: number) => void) {
    this.onSpeedChange = fn;
  }

  /**
   * Same here
   */
  public update() {
    const { x, y, z } = this.playerWorldPos;
    this.positionLabel.textContent =
      `Player world: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`;
    this.fpsLabel.textContent = `FPS: ${this.fps.toFixed(1)}`;
  }

  public dispose() {
    if (this.root.parentElement === this.container) {
      this.container.removeChild(this.root);
    }
  }
}
