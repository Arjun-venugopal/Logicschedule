const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const iconSrc = path.join(__dirname, '../public/icons/icon-extracted.png');
const outDir = path.join(__dirname, '../public/icons');

async function generate() {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

  // Standard transparent icons
  for (const s of sizes) {
    const filename = 'icon-' + s + 'x' + s + '.png';
    await sharp(iconSrc)
      .resize(s, s, { kernel: sharp.kernel.lanczos3 })
      .toFile(path.join(outDir, filename));
    console.log('Generated ' + filename);
  }

  // Maskable icons (with 14% safe padding on dark #0a0a0a background)
  for (const s of [192, 512]) {
    const iconSize = Math.round(s * 0.74);
    const offset = Math.round((s - iconSize) / 2);
    const resizedIcon = await sharp(iconSrc)
      .resize(iconSize, iconSize, { kernel: sharp.kernel.lanczos3 })
      .toBuffer();

    const filename = 'icon-' + s + 'x' + s + '-maskable.png';
    await sharp({
      create: {
        width: s,
        height: s,
        channels: 4,
        background: { r: 10, g: 10, b: 10, alpha: 1 }
      }
    })
    .composite([{ input: resizedIcon, left: offset, top: offset }])
    .toFile(path.join(outDir, filename));
    console.log('Generated ' + filename);
  }

  // Apple Touch Icon (180x180)
  const appleIconSize = 140;
  const appleOffset = 20;
  const resizedApple = await sharp(iconSrc)
    .resize(appleIconSize, appleIconSize, { kernel: sharp.kernel.lanczos3 })
    .toBuffer();

  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: { r: 10, g: 10, b: 10, alpha: 1 }
    }
  })
  .composite([{ input: resizedApple, left: appleOffset, top: appleOffset }])
  .toFile(path.join(outDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png in icons/');

  // Copy apple-touch-icon.png to public root as well
  fs.copyFileSync(path.join(outDir, 'apple-touch-icon.png'), path.join(__dirname, '../public/apple-touch-icon.png'));
  console.log('Copied apple-touch-icon.png to public root');

  // Favicons
  for (const s of [16, 32]) {
    const filename = 'favicon-' + s + 'x' + s + '.png';
    await sharp(iconSrc)
      .resize(s, s, { kernel: sharp.kernel.lanczos3 })
      .toFile(path.join(__dirname, '../public', filename));
    console.log('Generated ' + filename);
  }
}

generate()
  .then(() => console.log('All icons generated successfully!'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
