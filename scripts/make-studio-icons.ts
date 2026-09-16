/**
 * Draws the Studio home-screen icons.
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

/** Opaque 8-bit truecolour. No alpha: every icon here is full-bleed. */
function encodePng(width: number, height: number, pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // One filter byte per scanline; filter 0 (None) compresses fine for flat art.
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const to = y * (1 + width * 3);
    raw[to] = 0;
    pixels.subarray(y * width * 3, (y + 1) * width * 3).forEach((v, i) => {
      raw[to + 1 + i] = v;
    });
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── the mark ─────────────────────────────────────────────── */

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

  rect(0.28, 0.28, 0.365, 0.68, INK); // left stem
  rect(0.635, 0.28, 0.72, 0.68, INK); // right stem
  rect(0.365, 0.4425, 0.635, 0.5275, INK); // crossbar
  rect(0.755, 0.605, 0.82, 0.68, RED); // the square after the name

  return pixels;
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
