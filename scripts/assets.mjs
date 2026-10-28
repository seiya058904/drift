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
