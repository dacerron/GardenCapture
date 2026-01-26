import * as THREE from "three";

type MarkerPosition = THREE.Vector3 | [number, number, number];

export type MarkerInput = {
  position: MarkerPosition;
  color?: THREE.ColorRepresentation;
  radius?: number;
  texture?: THREE.Texture;
  label?: string;
};

/**
 * wrld-space markers rendered with depth testing.
 */
export class WorldMarkers {
  private readonly scene = new THREE.Scene();
  private sprites: THREE.Sprite[] = [];
  private readonly defaultTexture: THREE.Texture;

  private labelSprite?: THREE.Sprite;
  private labelTarget?: THREE.Sprite;

  constructor() {
    this.defaultTexture = WorldMarkers.createDefaultTexture();
  }

  setMarkers(markers: MarkerInput[]) {
    this.clearMarkers();
    this.clearLabel();

    for (const m of markers) {
      const pos = WorldMarkers.toVector3(m.position);
      const radius = m.radius ?? 0.25;
      const texture = m.texture ?? this.defaultTexture;

      const mat = new THREE.SpriteMaterial({
        map: texture,
        color: m.color ?? "#ffffff",
        depthTest: true,
        depthWrite: true,
        transparent: true,
        alphaTest: 0.4,
      });

      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.scale.setScalar(radius * 2);
      sprite.userData = { label: m.label ?? "", radius };

      this.scene.add(sprite);
      this.sprites.push(sprite);
    }
  }

  // might use this later
  setEnvironmentMap(envMap: THREE.Texture | null | undefined) {
    this.scene.environment = envMap ?? null;
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    renderer.render(this.scene, camera);
  }

  getSprites(): readonly THREE.Sprite[] {
    return this.sprites;
  }

  getPickableObjects(): readonly THREE.Object3D[] {
    return this.labelSprite ? [this.labelSprite, ...this.sprites] : this.sprites;
  }

  toggleLabelForSprite(sprite: THREE.Sprite, camera?: THREE.Camera) {
    if (this.labelSprite && this.labelTarget === sprite) {
      this.clearLabel();
      return;
    }
    this.showLabel(sprite, camera);
  }

  showLabelForSprite(sprite: THREE.Sprite, camera?: THREE.Camera) {
    this.showLabel(sprite, camera);
  }

  removeLabel() {
    this.clearLabel();
  }

  dispose() {
    this.clearLabel();
    this.clearMarkers();
    this.defaultTexture.dispose();
  }

  // --------------------
  // Internals
  // --------------------

  private showLabel(sprite: THREE.Sprite, camera?: THREE.Camera) {
    const text: string = sprite.userData?.label ?? "";
    if (!text) {
      this.clearLabel();
      return;
    }

    this.clearLabel();

    const radius: number = sprite.userData?.radius ?? 0.25;
    const texture = WorldMarkers.createLabelTexture(text);

    const mat = new THREE.SpriteMaterial({
      map: texture,
      depthTest: true,
      depthWrite: true,
      transparent: true,
      opacity: 1,
    });

    const label = new THREE.Sprite(mat);
    label.position.copy(sprite.position);

    const aspect =
      texture.image instanceof HTMLCanvasElement && texture.image.height > 0
        ? texture.image.width / texture.image.height
        : 2;

    const baseHeight = radius * 1.5;
    const distScale =
      camera instanceof THREE.Camera
        ? THREE.MathUtils.clamp(
            (camera.position.distanceTo(sprite.position) || 0.001) * 0.08,
            0.8,
            2.0
          )
        : 1;

    const height = baseHeight * distScale;
    label.scale.set(height * aspect, height, 1);

    this.labelSprite = label;
    this.labelTarget = sprite;

    sprite.visible = false; // hide marker button while label is visible
    this.scene.add(label);
  }

  private clearLabel() {
    if (this.labelSprite) {
      this.scene.remove(this.labelSprite);
      const mat = this.labelSprite.material;
      mat.map?.dispose();
      mat.dispose();
      this.labelSprite = undefined;
    }

    if (this.labelTarget) {
      this.labelTarget.visible = true;
      this.labelTarget = undefined;
    }
  }

  private clearMarkers() {
    for (const s of this.sprites) {
      this.scene.remove(s);
      s.material.dispose();
      //NOT disposing s.material.map since textures may be shared or user-owned
    }
    this.sprites = [];
  }

  private static toVector3(pos: MarkerPosition): THREE.Vector3 {
    return Array.isArray(pos) ? new THREE.Vector3(pos[0], pos[1], pos[2]) : pos;
  }

  private static createDefaultTexture(): THREE.Texture {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create canvas context for marker texture.");

    ctx.clearRect(0, 0, size, size);
    const gradient = ctx.createRadialGradient(
      size * 0.5,
      size * 0.5,
      size * 0.05,
      size * 0.5,
      size * 0.5,
      size * 0.45
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,204,0,0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.5, size * 0.45, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  private static createLabelTexture(text: string): THREE.Texture {
    const padding = 8;
    const fontSize = 16;
    const font = `${fontSize}px sans-serif`;
    const lineHeight = fontSize * 1.3;
    const closeSize = fontSize * 0.9;
    const closePadding = 6;
    const maxTextWidth = 220;
    const minTotalWidth = 100;
    const scale = 2;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create canvas context for label texture.");

    ctx.font = font;
    const { lines, maxLineWidth } = WorldMarkers.wrapText(ctx, text, maxTextWidth);

    const textBlockWidth = Math.max(maxLineWidth, 1);
    const textBlockHeight = lines.length * lineHeight;
    const closeBoxWidth = closeSize + closePadding * 2;

    const logicalWidth = Math.max(minTotalWidth, padding * 2 + textBlockWidth + closeBoxWidth);
    const logicalHeight = padding * 2 + textBlockHeight;

    canvas.width = Math.ceil(logicalWidth * scale);
    canvas.height = Math.ceil(logicalHeight * scale);

    const ctx2 = canvas.getContext("2d");
    if (!ctx2) throw new Error("Unable to create canvas context for label texture.");

    ctx2.scale(scale, scale);
    ctx2.font = font;
    ctx2.textBaseline = "top";

    // background
    ctx2.fillStyle = "rgba(20,24,32,0.8)";
    ctx2.strokeStyle = "rgba(255,255,255,0.15)";
    ctx2.lineWidth = 2;
    ctx2.beginPath();
    ctx2.rect(1, 1, logicalWidth - 2, logicalHeight - 2);
    ctx2.fill();
    ctx2.stroke();

    // text
    ctx2.fillStyle = "#ffffff";
    lines.forEach((line, i) => {
      ctx2.fillText(line, padding, padding + i * lineHeight);
    });

    // Close X
    const closeX = logicalWidth - closePadding - closeSize;
    const closeY = padding + (textBlockHeight - closeSize) * 0.5;
    ctx2.strokeStyle = "rgba(255,255,255,0.8)";
    ctx2.lineWidth = 2.5;
    ctx2.beginPath();
    ctx2.moveTo(closeX, closeY);
    ctx2.lineTo(closeX + closeSize, closeY + closeSize);
    ctx2.moveTo(closeX + closeSize, closeY);
    ctx2.lineTo(closeX, closeY + closeSize);
    ctx2.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  private static wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): { lines: string[]; maxLineWidth: number } {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    let widest = 0;

    for (const word of words) {
      const tentative = current ? `${current} ${word}` : word;
      const width = ctx.measureText(tentative).width;

      if (width <= maxWidth || !current) {
        current = tentative;
        widest = Math.max(widest, width);
      } else {
        lines.push(current);
        current = word;
        widest = Math.max(widest, ctx.measureText(word).width);
      }
    }

    if (current) lines.push(current);
    return { lines, maxLineWidth: widest };
  }
}
