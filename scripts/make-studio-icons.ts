/**
 * Draws the Studio home-screen icons, and the public site's tab icon
 * (app/favicon.ico and app/icon.svg) from the same mark.
 *
 *   npx tsx scripts/make-studio-icons.ts
 *
 * The icons are committed, so this only needs running when the mark changes.
 * It exists so "how were these made?" has an answer in the repo rather than in
 * someone's design tool, and so a colour token change can be re-applied here.
 *
 * The mark is the studio wordmark reduced to its two parts: the H of Hilman,
 * and the red square that follows it. Everything sits inside the middle 80% of
 * the canvas, which is the safe zone a maskable icon may be cropped to.
 *
 * PNG is written by hand rather than pulled from an image library: four
 * chunks and a zlib stream is less to own than a dependency.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PAPER = [0x0a, 0x0a, 0x0a] as const; // --paper
const INK = [0xf2, 0xef, 0xe9] as const; // --ink
const RED = [0xff, 0x6b, 0x5b] as const; // --red

type RGB = readonly [number, number, number];

/* ── PNG ──────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * Opaque 8-bit truecolour. No alpha: every icon here is full-bleed.
 *
 * `withAlpha` writes the same pixels as RGBA, every one fully opaque, for the
 * one consumer that insists on it: a PNG inside an .ico must be 32-bit, and
 * Next.js refuses to build with a favicon whose PNG is not.
 */
function encodePng(width: number, height: number, pixels: Uint8Array, withAlpha = false): Buffer {
  const channels = withAlpha ? 4 : 3;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = withAlpha ? 6 : 2; // colour type: truecolour, with or without alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // One filter byte per scanline; filter 0 (None) compresses fine for flat art.
  const raw = Buffer.alloc(height * (1 + width * channels));
  for (let y = 0; y < height; y++) {
    const to = y * (1 + width * channels);
    raw[to] = 0;
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 3;
      const at = to + 1 + x * channels;
      raw[at] = pixels[from];
      raw[at + 1] = pixels[from + 1];
      raw[at + 2] = pixels[from + 2];
      if (withAlpha) raw[at + 3] = 0xff;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── the mark ─────────────────────────────────────────────── */

/**
 * The rectangles, as fractions of the canvas: [x0, y0, x1, y1]. Shared by the
 * PNG rasteriser and the SVG writer, so the tab icon and the home-screen icon
 * cannot drift apart.
 */
const MARK: { box: readonly [number, number, number, number]; colour: RGB }[] = [
  { box: [0.28, 0.28, 0.365, 0.68], colour: INK }, // left stem
  { box: [0.635, 0.28, 0.72, 0.68], colour: INK }, // right stem
  { box: [0.365, 0.4425, 0.635, 0.5275], colour: INK }, // crossbar
  { box: [0.755, 0.605, 0.82, 0.68], colour: RED }, // the square after the name
];

function draw(size: number, scale: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3] = PAPER[0];
    pixels[i * 3 + 1] = PAPER[1];
    pixels[i * 3 + 2] = PAPER[2];
  }

  const rect = (x0: number, y0: number, x1: number, y1: number, colour: RGB) => {
    // Fractions of the canvas, scaled about the centre so a maskable icon can
    // pull the whole mark further inside the safe zone.
    const map = (v: number) => Math.round((0.5 + (v - 0.5) * scale) * size);
    for (let y = Math.max(0, map(y0)); y < Math.min(size, map(y1)); y++) {
      for (let x = Math.max(0, map(x0)); x < Math.min(size, map(x1)); x++) {
        const i = (y * size + x) * 3;
        pixels[i] = colour[0];
        pixels[i + 1] = colour[1];
        pixels[i + 2] = colour[2];
      }
    }
  };

  for (const { box, colour } of MARK) rect(box[0], box[1], box[2], box[3], colour);

  return pixels;
}

/* ── the public site's tab icon ───────────────────────────── */

const hex = (colour: RGB) => `#${colour.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** The same rectangles as vectors, for browsers that take an SVG icon. */
function svgMark(scale: number): string {
  const map = (v: number) => Number(((0.5 + (v - 0.5) * scale) * 100).toFixed(2));
  const rects = MARK.map(({ box: [x0, y0, x1, y1], colour }) => {
    const x = map(x0);
    const y = map(y0);
    const w = Number((map(x1) - x).toFixed(2));
    const h = Number((map(y1) - y).toFixed(2));
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${hex(colour)}"/>`;
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" rx="18" fill="${hex(PAPER)}"/>${rects.join("")}</svg>\n`
  );
}

/** One PNG in an ICO container — the form every browser reads for /favicon.ico. */
function encodeIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry[0] = size; // width
  entry[1] = size; // height
  entry[2] = 0; // no palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12); // where the PNG starts
  return Buffer.concat([header, entry, png]);
}

/* ── output ───────────────────────────────────────────────── */

const outDir = join(process.cwd(), "public", "icons");
mkdirSync(outDir, { recursive: true });

const files: { name: string; size: number; scale: number }[] = [
  { name: "studio-192.png", size: 192, scale: 1 },
  { name: "studio-512.png", size: 512, scale: 1 },
  // Android crops a maskable icon to whatever shape the launcher uses, so the
  // mark is pulled in to survive the most aggressive circle.
  { name: "studio-maskable-512.png", size: 512, scale: 0.78 },
  // iOS draws its own rounded corners over this one and ignores transparency.
  { name: "apple-touch-icon.png", size: 180, scale: 0.92 },
];

for (const file of files) {
  const png = encodePng(file.size, file.size, draw(file.size, file.scale));
  writeFileSync(join(outDir, file.name), png);
  console.log(`${file.name.padEnd(28)} ${file.size}×${file.size}  ${(png.length / 1024).toFixed(1)} KB`);
}

// The public site's browser-tab icon, which it did not have: every first
// visit asked for /favicon.ico and got a 404, and the tab showed a blank
// page. Same mark, drawn larger, because at 16px the margin a launcher needs
// is just empty space. Next.js links both from app/ by file convention.
const FAVICON_SCALE = 1.3;
const appDir = join(process.cwd(), "app");
const favicon = encodeIco(encodePng(32, 32, draw(32, FAVICON_SCALE), true), 32);
writeFileSync(join(appDir, "favicon.ico"), favicon);
console.log(`${"app/favicon.ico".padEnd(28)} 32×32  ${(favicon.length / 1024).toFixed(1)} KB`);
const svg = svgMark(FAVICON_SCALE);
writeFileSync(join(appDir, "icon.svg"), svg);
console.log(`${"app/icon.svg".padEnd(28)} vector  ${(svg.length / 1024).toFixed(1)} KB`);
