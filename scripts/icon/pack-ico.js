/**
 * Pack natively-rendered PNGs into a multi-size .ico for Windows.
 * PNG-compressed entries (Vista+), same approach electron-builder uses.
 * 256px entries use dimension byte 0 (the ICO "means 256" encoding).
 *
 * Prerequisites: render-icon.js outputs in ./out/ —
 *   out/small-{16,24,32}.png  (optical 3.0-stroke renders)
 *   out/final-{48,64,128,256,1024}.png (standard 2.6-stroke renders)
 *
 * Usage: node scripts/icon/pack-ico.js [output.ico]
 */
const fs = require("fs");
const path = require("path");

const out = process.argv[2] || path.join(__dirname, "..", "..", "desktop", "build", "icon.ico");
const src = path.join(__dirname, "out");
const sizes = [16, 24, 32, 48, 64, 128, 256];

const buffers = sizes.map((s) => {
  const tag = s <= 32 ? "small" : "final";
  return fs.readFileSync(path.join(src, `${tag}-${s}.png`));
});

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = icon
header.writeUInt16LE(sizes.length, 4);

const entries = [];
const blobs = [];
let offset = 6 + 16 * sizes.length;
sizes.forEach((s, i) => {
  const png = buffers[i];
  // sanity: PNG IHDR width must match
  const w = png.readUInt32BE(16);
  if (w !== s) throw new Error(`out/${sizes[i]}.png is ${w}px, expected ${s}`);
  const entry = Buffer.alloc(16);
  const dim = s >= 256 ? 0 : s; // 0 encodes 256
  entry[0] = dim;
  entry[1] = dim;
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  blobs.push(png);
  offset += png.length;
});

const ico = Buffer.concat([header, ...entries, ...blobs]);
fs.writeFileSync(out, ico);
console.log(`icon.ico written: ${ico.length} bytes, ${sizes.length} entries (${sizes.join(", ")})`);
