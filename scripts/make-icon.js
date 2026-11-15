/* Generate desktop/build/icon.png from an SVG matching Resona's logo. */
const sharp = require("sharp");
const path = require("path");

// lucide "radio" glyph scaled onto a rounded monochrome tile
const svg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="224" fill="#0a0a0a"/>
  <g transform="translate(102.4 102.4) scale(34.13)"
     stroke="#fafafa" fill="none" stroke-width="1.5"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
    <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
    <circle cx="12" cy="12" r="2" fill="#fafafa"/>
    <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
    <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/>
  </g>
</svg>`;

async function main() {
  const out = path.join(__dirname, "..", "desktop", "build", "icon.png");
  await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(out);
  const meta = await sharp(out).metadata();
  console.log("icon written:", out, meta.width + "x" + meta.height);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
