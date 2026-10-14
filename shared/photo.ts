export const PHOTO_BYTE_LIMIT = 1_000_000;
export const PHOTO_DIMENSION_LIMIT = 1000;
export type PhotoInfo = {mimeType: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number};
export class PhotoFormatError extends Error {}
function invalid(): never { throw new PhotoFormatError("JPEG・PNG・WebPの静止画を選んでください。"); }
function dimensions(info: PhotoInfo): PhotoInfo {
  if (info.width < 1 || info.height < 1) invalid();
  if (info.width > PHOTO_DIMENSION_LIMIT || info.height > PHOTO_DIMENSION_LIMIT)
    throw new PhotoFormatError("写真の縦横は1000px以下にしてください。");
  return info;
}
function tag(bytes: Uint8Array, at: number, length = 4) { return String.fromCharCode(...bytes.subarray(at, at + length)); }
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(bytes: Uint8Array, view: DataView): PhotoInfo {
  let at = 8, info: PhotoInfo | undefined, color = -1, palette = false, data = false, sawData = false, dataEnded = false;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at), type = tag(bytes, at + 4), start = at + 8, end = start + length;
    if (end + 4 > bytes.length || !/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2].toUpperCase()) invalid();
    if (crc32(bytes.subarray(at + 4, end)) !== view.getUint32(end)) invalid();
    if (!info && type !== "IHDR") invalid();
    switch (type) {
      case "IHDR": {
        if (info || length !== 13) invalid();
        const depth = bytes[start + 8]; color = bytes[start + 9];
        const legal: Record<number, number[]> = {0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16]};
        if (!legal[color]?.includes(depth) || bytes[start + 10] !== 0 || bytes[start + 11] !== 0 || bytes[start + 12] > 1) invalid();
        info = dimensions({mimeType: "image/png", width: view.getUint32(start), height: view.getUint32(start + 4)});
        break;
      }
      case "PLTE":
        if (palette || data || color === 0 || color === 4 || !length || length % 3 || length > 768 || (color === 3 && length / 3 > 2 ** bytes[24])) invalid();
        palette = true; break;
      case "IDAT":
        if (dataEnded || (color === 3 && !palette)) invalid();
        sawData = true;
        if (length) data = true;
        break;
      case "IEND":
        if (length || !data || end + 4 !== bytes.length || !info) invalid();
        return info;
      case "acTL": case "fcTL": case "fdAT": invalid();
      default:
        if (type[0] === type[0].toUpperCase()) invalid();
        if (sawData) dataEnded = true;
    }
    at = end + 4;
  }
  return invalid();
}
function jpeg(bytes: Uint8Array, view: DataView): PhotoInfo {
  let at = 2, info: PhotoInfo | undefined, components: number[] = [], scans = 0, table = false, huffman = false, baseline = false;
  while (at < bytes.length) {
    if (bytes[at++] !== 0xff) invalid();
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (marker === 0xd9) {
      if (!info || !scans || at !== bytes.length) invalid();
      return info;
    }
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || at + 2 > bytes.length) invalid();
    const length = view.getUint16(at), end = at + length, start = at + 2;
    if (length < 2 || end > bytes.length) invalid();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (info || length < 8 || bytes[start] !== 8) invalid();
      baseline = marker !== 0xc2;
      const count = bytes[start + 5];
      if (![1, 3, 4].includes(count) || length !== 8 + count * 3) invalid();
      components = [];
      for (let i = 0; i < count; i++) {
        const id = bytes[start + 6 + i * 3], sampling = bytes[start + 7 + i * 3];
        if (components.includes(id) || !(sampling >> 4) || (sampling >> 4) > 4 || !(sampling & 15) || (sampling & 15) > 4 || bytes[start + 8 + i * 3] > 3) invalid();
        components.push(id);
      }
      info = dimensions({mimeType: "image/jpeg", width: view.getUint16(start + 3), height: view.getUint16(start + 1)});
    } else if (marker === 0xda) {
      if (!info || !table || !huffman || length < 6) invalid();
      const count = bytes[start], selected = new Set<number>();
      if (!count || count > components.length || length !== 6 + count * 2) invalid();
      for (let i = 0; i < count; i++) {
        const id = bytes[start + 1 + i * 2], selector = bytes[start + 2 + i * 2];
        if (!components.includes(id) || selected.has(id) || (selector >> 4) > 3 || (selector & 15) > 3) invalid();
        selected.add(id);
      }
      const spectral = start + 1 + count * 2;
      if (baseline && (bytes[spectral] !== 0 || bytes[spectral + 1] !== 63 || bytes[spectral + 2] !== 0)) invalid();
      if (bytes[spectral] > 63 || bytes[spectral + 1] > 63 || bytes[spectral] > bytes[spectral + 1] || (bytes[spectral + 2] >> 4) > 13 || (bytes[spectral + 2] & 15) > 13) invalid();
      at = end;
      let entropy = 0;
      while (at < bytes.length) {
        if (bytes[at] !== 0xff) { entropy++; at++; continue; }
        if (bytes[at + 1] === 0) { entropy++; at += 2; continue; }
        if (bytes[at + 1] >= 0xd0 && bytes[at + 1] <= 0xd7) { at += 2; continue; }
        break;
      }
      if (!entropy) invalid();
      scans++; continue;
    } else if (marker === 0xdb) {
      let pos = start;
      if (pos === end) invalid();
      while (pos < end) {
        const spec = bytes[pos++], precision = spec >> 4;
        if (precision > 1 || (spec & 15) > 3) invalid();
        pos += 64 * (precision + 1);
      }
      if (pos !== end) invalid();
      table = true;
    } else if (marker === 0xc4) {
      let pos = start;
      if (pos === end) invalid();
      while (pos < end) {
        const spec = bytes[pos++];
        if ((spec >> 4) > 1 || (spec & 15) > 3 || pos + 16 > end) invalid();
        let symbols = 0;
        for (let i = 0; i < 16; i++) symbols += bytes[pos++];
        if (!symbols || symbols > 256) invalid();
        pos += symbols;
      }
      if (pos !== end) invalid();
      huffman = true;
    } else if (marker === 0xdd) { if (length !== 4) invalid(); }
    else if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) invalid();
    at = end;
  }
  return invalid();
}
function webp(bytes: Uint8Array, view: DataView): PhotoInfo {
  if (view.getUint32(4, true) + 8 !== bytes.length) invalid();
  let at = 12, info: PhotoInfo | undefined, canvas: PhotoInfo | undefined, image = false, alpha = false, flags = 0, losslessAlpha = false;
  const metadata = new Set<string>();
  while (at + 8 <= bytes.length) {
    const type = tag(bytes, at), length = view.getUint32(at + 4, true), start = at + 8, end = start + length;
    if (!length || end + (length % 2) > bytes.length || (length % 2 && bytes[end] !== 0)) invalid();
    if (type === "ANIM" || type === "ANMF") invalid();
    if (type === "VP8X") {
      if (at !== 12 || length !== 10 || (bytes[start] & 0xc3) || bytes[start + 1] || bytes[start + 2] || bytes[start + 3]) invalid();
      const uint24 = (pos: number) => bytes[pos] + bytes[pos + 1] * 256 + bytes[pos + 2] * 65536;
      flags = bytes[start];
      canvas = dimensions({mimeType: "image/webp", width: uint24(start + 4) + 1, height: uint24(start + 7) + 1});
    } else if (type === "VP8 ") {
      if (image || length < 11 || (bytes[start] & 1) || ((bytes[start] >> 1) & 7) > 3 || !(bytes[start] & 16) || tag(bytes, start + 3, 3) !== "\x9d\x01\x2a") invalid();
      const partition = (bytes[start] + bytes[start + 1] * 256 + bytes[start + 2] * 65536) >>> 5;
      if (partition < 1 || partition + 10 > length) invalid();
      info = dimensions({mimeType: "image/webp", width: view.getUint16(start + 6, true) & 0x3fff, height: view.getUint16(start + 8, true) & 0x3fff});
      image = true;
    } else if (type === "VP8L") {
      if (image || alpha || length < 6 || bytes[start] !== 0x2f) invalid();
      const bits = view.getUint32(start + 1, true);
      if (bits >>> 29) invalid();
      losslessAlpha = Boolean(bits & 0x10000000);
      info = dimensions({mimeType: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1});
      image = true;
    } else if (type === "ALPH") {
      if (!canvas || !(flags & 16) || image || alpha || (bytes[start] & 0xc0) || (bytes[start] & 3) > 1 || ((bytes[start] >> 4) & 3) > 1) invalid();
      alpha = true;
    } else {
      const requiredFlag = type === "ICCP" ? 32 : type === "EXIF" ? 8 : type === "XMP " ? 4 : 0;
      if (!canvas || !requiredFlag || !(flags & requiredFlag) || metadata.has(type) || (type === "ICCP" ? image || alpha : !image)) invalid();
      metadata.add(type);
    }
    at = end + length % 2;
  }
  if (at !== bytes.length || !info || (canvas && (canvas.width !== info.width || canvas.height !== info.height))) invalid();
  if (canvas && (Boolean(flags & 32) !== metadata.has("ICCP") || Boolean(flags & 8) !== metadata.has("EXIF") || Boolean(flags & 4) !== metadata.has("XMP ") || (Boolean(flags & 16) !== (alpha || losslessAlpha)))) invalid();
  return info;
}
export function parsePhoto(bytes: Uint8Array): PhotoInfo {
  if (!bytes.length || bytes.length > PHOTO_BYTE_LIMIT) throw new PhotoFormatError("1MB以下の写真を選んでください。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return png(bytes, view);
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) return jpeg(bytes, view);
  if (bytes.length >= 12 && tag(bytes, 0) === "RIFF" && tag(bytes, 8) === "WEBP") return webp(bytes, view);
  return invalid();
}
