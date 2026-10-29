import sharp from "sharp";
await sharp("docs/design/ocean-source.png")
  .resize(1920)
  .webp({ quality: 82 })
  .toFile("public/art/ocean.webp");
// Mobile cover uses only the center of the landscape. Ship that same crop.
await sharp("docs/design/ocean-source.png")
  .resize(600, 1298, { fit: "cover", position: "centre" })
  .webp({ quality: 82 })
  .toFile("public/art/ocean-mobile.webp");
await sharp("docs/design/bottle-source.png")
  .resize(720)
  .webp({ quality: 85 })
  .toFile("public/art/bottle.webp");
console.log("Optimized original artwork.");
// The generated atlas has real alpha. Crop disjoint cells, then trim transparent
// margins without painting over the original artwork. Keep this source archived.
for (const [name, region, height] of [
  ["glass", { left: 0, top: 0, width: 760, height: 1254 }, 560],
  ["cork", { left: 760, top: 0, width: 494, height: 490 }, 100],
  ["note", { left: 760, top: 490, width: 494, height: 764 }, 250],
]) {
  const cell = await sharp("docs/design/bottle-layers-source.png").extract(region).toBuffer();
  await sharp(cell).trim().resize({ height })
    .webp({ quality: 80, alphaQuality: 100 })
    .toFile(`public/art/bottle-${name}.webp`);
}
console.log("Optimized shared bottle layers.");
