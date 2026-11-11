// Reads when a JPEG was taken (EXIF DateTimeOriginal), so photos from
// several cameras sort into shooting order. Cameras store local time with no
// zone; studios shoot in India, so it is read as IST unless the camera also
// wrote an offset (OffsetTimeOriginal).

const DATE_TIME_ORIGINAL = 0x9003;
const OFFSET_TIME_ORIGINAL = 0x9011;
const EXIF_IFD_POINTER = 0x8769;
const DEFAULT_OFFSET = "+05:30";

/** How much of the file to read: EXIF sits in the first few kilobytes. */
export const EXIF_SCAN_BYTES = 128 * 1024;

function ascii(view: DataView, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length && offset + i < view.byteLength; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

type Tags = Map<number, string>;

function readIfd(view: DataView, tiff: number, ifd: number, little: boolean, wanted: number[], into: Tags): number | null {
  if (tiff + ifd + 2 > view.byteLength) return null;
  const count = view.getUint16(tiff + ifd, little);
  let exifPointer: number | null = null;
  for (let i = 0; i < count; i++) {
    const entry = tiff + ifd + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const n = view.getUint32(entry + 4, little);
    if (tag === EXIF_IFD_POINTER) exifPointer = view.getUint32(entry + 8, little);
    if (type === 2 && wanted.includes(tag)) {
      const at = n <= 4 ? entry + 8 : tiff + view.getUint32(entry + 8, little);
      into.set(tag, ascii(view, at, n));
    }
  }
  return exifPointer;
}

/** "2026:11:08 18:42:07" + "+05:30" -> ISO time, or null if malformed. */
export function exifDateToIso(value: string, offset: string = DEFAULT_OFFSET): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const zone = /^[+-]\d{2}:\d{2}$/.test(offset.trim()) ? offset.trim() : DEFAULT_OFFSET;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${zone}`;
  const t = Date.parse(iso);
  if (Number.isNaN(t) || Number(m[1]) < 1990) return null;
  return new Date(t).toISOString();
}

/** When the photo was taken, as an ISO time, from the start of a JPEG file. Null if unknown. */
export function readTakenAt(buffer: ArrayBuffer): string | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if ((marker & 0xff00) !== 0xff00 || size < 2) return null;
    if (marker === 0xffe1 && ascii(view, offset + 4, 4) === "Exif") {
      const tiff = offset + 10;
      if (tiff + 8 > view.byteLength) return null;
      const little = view.getUint16(tiff) === 0x4949;
      const tags: Tags = new Map();
      const exifIfd = readIfd(view, tiff, view.getUint32(tiff + 4, little), little, [], tags);
      if (exifIfd === null) return null;
      readIfd(view, tiff, exifIfd, little, [DATE_TIME_ORIGINAL, OFFSET_TIME_ORIGINAL], tags);
      const taken = tags.get(DATE_TIME_ORIGINAL);
      return taken ? exifDateToIso(taken, tags.get(OFFSET_TIME_ORIGINAL)) : null;
    }
    if (marker === 0xffda) return null; // image data starts: no EXIF
    offset += 2 + size;
  }
  return null;
}
