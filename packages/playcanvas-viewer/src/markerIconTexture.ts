import * as pc from "playcanvas";
import { resolveMarkerIconUrl } from "./resolveMarkerIconUrl";

const ICON_CANVAS_SIZE = 64;
const ICON_BORDER_WIDTH = 4;

function createTextureFromImage(
  device: pc.GraphicsDevice,
  image: CanvasImageSource,
): pc.Texture {
  const size = ICON_CANVAS_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create canvas context for marker icon.");
  }

  const center = size / 2;
  const radius = size / 2 - 4;

  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const iw =
    "naturalWidth" in image && image.naturalWidth > 0
      ? image.naturalWidth
      : (image as HTMLCanvasElement).width;
  const ih =
    "naturalHeight" in image && image.naturalHeight > 0
      ? image.naturalHeight
      : (image as HTMLCanvasElement).height;
  const scale = Math.max((radius * 2) / iw, (radius * 2) / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  ctx.drawImage(image, center - drawW / 2, center - drawH / 2, drawW, drawH);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.lineWidth = ICON_BORDER_WIDTH;
  ctx.strokeStyle = "white";
  ctx.stroke();

  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha > 0 && alpha < 255) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }

  return new pc.Texture(device, {
    width: size,
    height: size,
    format: pc.PIXELFORMAT_RGBA8,
    magFilter: pc.FILTER_LINEAR,
    minFilter: pc.FILTER_LINEAR,
    mipmaps: false,
    levels: [new Uint8Array(data)],
  });
}

export function loadMarkerIconTexture(
  device: pc.GraphicsDevice,
  iconUrl: string,
): Promise<pc.Texture> {
  const url = resolveMarkerIconUrl(iconUrl);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        resolve(createTextureFromImage(device, img));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error(`Failed to load marker icon: ${url}`));
    img.src = url;
  });
}
