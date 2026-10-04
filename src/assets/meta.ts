// Intrinsic metadata read straight from asset bytes: dimensions, transparency, Lottie detection.
// No ffprobe/sharp needed; covers PNG, JPEG, GIF, WebP, SVG and Lottie JSON.
import { readFileSync } from "node:fs";

export interface FileMeta {
  width?: number;
  height?: number;
  transparent?: boolean;
  lottie?: { fps: number; frames: number; seconds: number };
}

export function readMeta(path: string, format: string): FileMeta {
  try {
    switch (format) {
      case "png":
        return png(readFileSync(path));
      case "jpg":
      case "jpeg":
        return jpeg(readFileSync(path));
      case "gif":
        return gif(readFileSync(path));
      case "webp":
        return webp(readFileSync(path));
      case "svg":
        return svg(readFileSync(path, "utf8"));
      case "json":
        return lottieMeta(readFileSync(path, "utf8")) ?? {};
      default:
        return {};
    }
  } catch {
    return {};
  }
}

function png(b: Buffer): FileMeta {
  if (b.readUInt32BE(0) !== 0x89504e47) return {};
  const colorType = b[25];
  // Alpha channel, or a tRNS chunk anywhere before the image data.
  const transparent = colorType === 4 || colorType === 6 || b.indexOf("tRNS") > 0 && b.indexOf("tRNS") < b.indexOf("IDAT");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), transparent };
}

function jpeg(b: Buffer): FileMeta {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    // SOF0-SOF15 except DHT (C4), JPG (C8), DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7), transparent: false };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { transparent: false };
}

function gif(b: Buffer): FileMeta {
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

function webp(b: Buffer): FileMeta {
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, transparent: false };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, transparent: true };
  }
  if (chunk === "VP8X") {
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), transparent: (b[20] & 0x10) !== 0 };
  }
  return {};
}

function svg(text: string): FileMeta {
  const tag = text.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const num = (attr: string) => {
    const v = tag.match(new RegExp(`\\s${attr}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, "i"))?.[1];
    return v ? Number(v) : undefined;
  };
  const vb = tag.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i);
  const width = num("width") ?? (vb ? Number(vb[1]) : undefined);
  const height = num("height") ?? (vb ? Number(vb[2]) : undefined);
  return { width, height, transparent: true };
}

export function lottieMeta(text: string): FileMeta | null {
  if (!/"layers"\s*:/.test(text) || !/"fr"\s*:/.test(text)) return null;
  try {
    const j = JSON.parse(text);
    if (typeof j.fr !== "number" || !Array.isArray(j.layers)) return null;
    const frames = (j.op ?? 0) - (j.ip ?? 0);
    return { width: j.w, height: j.h, transparent: true, lottie: { fps: j.fr, frames, seconds: Math.round((frames / j.fr) * 100) / 100 } };
  } catch {
    return null;
  }
}
