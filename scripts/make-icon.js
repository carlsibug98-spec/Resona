/**
 * Generate the Resona app icon: desktop/build/icon.png (1024) and
 * desktop/build/icon.ico (multi-size, every entry rendered natively).
 *
 * The mark is the canonical five-bar Resona logo (src/components/Logo.tsx
 * path, also the website favicon): five rounded bars with heights
 * 4/12/18/12/4 in a 24x24 box, drawn as a stroke so the caps stay round.
 * Palette comes from the website (gh-pages): warm-dark squircle with a
 * subtle top-lit gradient, mark in paper cream.
 *
 * Small sizes (16/24/32) get an optically heavier stroke — five 1px bars
 * smear at taskbar sizes, so the same path is drawn with weight 3.0
 * instead of 2.6. Nothing but the stroke weight changes.
 *
 * Usage: node scripts/make-icon.js   (CI runs this before packaging)
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const BUILD = path.join(__dirname, "..", "desktop", "build");
const CREAM = "#F2EEE6";

// The 24-unit mark box occupies 58% of the canvas and is centered.
const BOX = 594;
const T = (1024 - BOX) / 2; // 215
const S = BOX / 24; // 24.75

function svg(size, stroke) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#272219"/>
      <stop offset="1" stop-color="#15130F"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="230.4" fill="url(#bg)"/>
  <g transform="translate(${T} ${T}) scale(${S})" fill="none" stroke="${CREAM}"
     stroke-width="${stroke}" stroke-linecap="round">
    <path d="M4 10v4M8 6v12M12 3v18M16 6v12M20 10v4"/>
  </g>
</svg>`;
}

async function render(size) {
  const stroke = size <= 32 ? "3.0" : "2.6";
  return sharp(Buffer.from(svg(size, stroke))).png().toBuffer();
}

/** ICO with PNG-compressed entries (Vista+), like electron-builder makes. */
function packIco(entries) {
  // entries: array of { size, png }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + 16 * entries.length;
  const dirs = [];
  const blobs = [];
  for (const { size, png } of entries) {
    const dim = size >= 256 ? 0 : size; // 0 encodes 256
    const entry = Buffer.alloc(16);
    entry[0] = dim;
    entry[1] = dim;
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirs.push(entry);
    blobs.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...dirs, ...blobs]);
}

async function main() {
  fs.mkdirSync(BUILD, { recursive: true });

  const master = await render(1024);
  fs.writeFileSync(path.join(BUILD, "icon.png"), master);
  const meta = await sharp(master).metadata();
  console.log(`icon.png written: ${meta.width}x${meta.height}`);

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const entries = [];
  for (const size of sizes) {
    entries.push({ size, png: await render(size) });
  }
  const ico = packIco(entries);
  fs.writeFileSync(path.join(BUILD, "icon.ico"), ico);
  console.log(`icon.ico written: ${ico.length} bytes, ${sizes.length} entries (${sizes.join(", ")})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
