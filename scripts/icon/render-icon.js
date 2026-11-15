/**
 * Resona app-icon renderer.
 * Renders the canonical five-bar mark (src/components/Logo.tsx path) on a
 * warm-dark squircle, using the website's palette (gh-pages index.html):
 *   bg  #272219 -> #15130F  (subtle top-lit gradient, warm dark)
 *   mark #F2EEE6 (paper cream), optional green accent #1B9E4B
 *
 * Usage: node render-icon.js <size> <mono|green> <output.png>
 */
const { chromium } = require("playwright");

const size = parseInt(process.argv[2] || "1024", 10);
const variant = process.argv[3] || "mono";
const out = process.argv[4];
if (!out) {
  console.error("usage: node render-icon.js <size> <mono|green> <output.png>");
  process.exit(1);
}

const CREAM = "#F2EEE6";
const GREEN = "#1B9E4B";
const center = variant === "green" ? GREEN : CREAM;

// Optical weight bump for tiny sizes: five 1px bars smear at 16-32px, so
// small renders use a heavier stroke on the same canonical path.
const stroke = variant === "small" ? "3.0" : "2.6";

// The mark lives in a 24x24 box, scaled to 58% of the canvas and centered.
const BOX = 594; // 24-unit box in 1024-canvas units
const T = (1024 - BOX) / 2; // 215
const S = BOX / 24; // 24.75

const html = `<!DOCTYPE html><html><head><style>
html,body{margin:0;padding:0;background:transparent}
</style></head><body>
<svg width="${size}" height="${size}" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#272219"/>
      <stop offset="1" stop-color="#15130F"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1024" height="1024" rx="230.4" fill="url(#bg)"/>
  <g transform="translate(${T} ${T}) scale(${S})"
     fill="none" stroke-width="${stroke}" stroke-linecap="round">
    <path d="M4 10v4"  stroke="${CREAM}"/>
    <path d="M8 6v12"  stroke="${CREAM}"/>
    <path d="M12 3v18" stroke="${center}"/>
    <path d="M16 6v12" stroke="${CREAM}"/>
    <path d="M20 10v4" stroke="${CREAM}"/>
  </g>
</svg>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await browser.close();
  console.log(`rendered ${out} (${size}x${size}, ${variant})`);
})();
