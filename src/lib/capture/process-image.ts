import { FULL_LONG_EDGE, fitWithin, THUMB_LONG_EDGE } from "./photos";

export type ProcessedPhoto = {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** Local preview URL; revoke when done. */
  previewUrl: string;
};

async function encode(source: ImageBitmap, longEdge: number, quality: number) {
  const { width, height } = fitWithin(source.width, source.height, longEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process photos.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Couldn't prepare the photo.");
  return { blob, width, height };
}

/**
 * Turns a camera or SLR photo into a print-size JPEG and a small thumbnail.
 * Re-encoding in the browser also straightens rotated phone photos and drops
 * EXIF data such as GPS location before anything is uploaded.
 */
export async function processImage(file: File): Promise<ProcessedPhoto> {
  if (/\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/i.test(file.type)) {
    throw new Error("HEIC photos aren't supported yet. Export as JPEG, or set the camera to 'Most compatible'.");
  }
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't a photo.`);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`Couldn't open ${file.name}. Try a JPEG or PNG.`);
  }

  try {
    const full = await encode(bitmap, FULL_LONG_EDGE, 0.88);
    const thumb = await encode(bitmap, THUMB_LONG_EDGE, 0.8);
    return {
      full: full.blob,
      thumb: thumb.blob,
      width: full.width,
      height: full.height,
      previewUrl: URL.createObjectURL(thumb.blob),
    };
  } finally {
    bitmap.close();
  }
}
