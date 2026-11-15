/**
 * electron-builder afterPack hook.
 * Embeds the app icon into the Windows .exe WITHOUT wine:
 * electron-builder's rcedit step is disabled (signAndEditExecutable: false)
 * and this hook rewrites the PE icon resources with resedit (pure JS).
 */
const fs = require("fs");
const path = require("path");

/** wrap a PNG buffer in a minimal single-image 256x256 .ICO container */
function pngToIco(png) {
  const header = Buffer.alloc(6); // ICONDIR: reserved, type=1(icon), count=1
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16); // ICONDIRENTRY: 0 means 256px
  entry[0] = 0;
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // data offset
  return Buffer.concat([header, entry, png]);
}

function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const exePath = path.join(context.appOutDir, "Resona.exe");
  if (!fs.existsSync(exePath)) {
    console.warn("[afterpack] exe not found:", exePath);
    return;
  }
  const iconPng = path.join(__dirname, "build", "icon.png");
  if (!fs.existsSync(iconPng)) {
    console.warn("[afterpack] icon.png missing, keeping default icon");
    return;
  }

  const { NtExecutable, NtExecutableResource, Data, Resource } = await import(
    "resedit"
  );

  const png = fs.readFileSync(iconPng);
  const iconBuf = pngToIco(png);
  const iconFile = Data.IconFile.from(toArrayBuffer(iconBuf));
  const icons = iconFile.icons.map((i) => i.data);

  const exe = fs.readFileSync(exePath);
  const nt = NtExecutable.from(toArrayBuffer(exe));
  const res = NtExecutableResource.from(nt);

  // replace the first existing icon group (= application icon)
  const groups = Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, icons);

  res.outputResource(nt);
  fs.writeFileSync(exePath, Buffer.from(nt.generate()));
  console.log("[afterpack] icon embedded into Resona.exe");
};
