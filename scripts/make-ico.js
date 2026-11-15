/* Generate build/icon.ico (single 256x256 PNG-entry ICO) from build/icon.png */
const fs = require("fs");
const path = require("path");

const png = fs.readFileSync(path.join(__dirname, "..", "desktop", "build", "icon.png"));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; // 256px
entry[1] = 0;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(6 + 16, 12);
const ico = Buffer.concat([header, entry, png]);
fs.writeFileSync(path.join(__dirname, "..", "desktop", "build", "icon.ico"), ico);
console.log("icon.ico written:", ico.length, "bytes");
