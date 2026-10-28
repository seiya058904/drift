import sharp from "sharp";
await sharp("docs/design/ocean-source.png")
  .resize(1920)
  .webp({ quality: 82 })
  .toFile("public/art/ocean.webp");
await sharp("docs/design/bottle-source.png")
  .resize(720)
  .webp({ quality: 85 })
  .toFile("public/art/bottle.webp");
console.log("Optimized original artwork.");
