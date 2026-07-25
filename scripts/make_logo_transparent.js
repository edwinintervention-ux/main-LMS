import sharp from 'sharp';
import fs from 'fs';

const inputPath = 'public/ChatGPT Image Jul 25, 2026, 01_37_16 AM.png';
const logoPngPath = 'public/logo.png';
const logoB64Path = 'public/logo_base64.txt';
const faviconPngPath = 'public/favicon.png';

async function makeTransparent() {
  try {
    console.log('Reading image raw pixel data...');
    const { data, info } = await sharp(inputPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    console.log(`Image dimensions: ${width}x${height}, channels: ${channels}`);

    // Loop through pixels and make white/off-white background transparent
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const minVal = Math.min(r, g, b);
      const maxVal = Math.max(r, g, b);

      if (minVal > 210) {
        // Smoothly fade to transparent for values between 210 and 255
        const alpha = Math.round(255 * (255 - maxVal) / (255 - 210));
        data[i + 3] = Math.max(0, Math.min(255, alpha));
        
        // Also blend the colors towards white slightly to match anti-aliasing
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }

    console.log('Writing transparent logo...');
    // Save standard 450px wide transparent logo.png
    await sharp(data, { raw: { width, height, channels } })
      .resize({ width: 450 })
      .png()
      .toFile(logoPngPath);

    // Save transparent favicon.png
    await sharp(data, { raw: { width, height, channels } })
      .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(faviconPngPath);

    console.log('Generating Base64 text file...');
    const logoBuffer = fs.readFileSync(logoPngPath);
    const base64Data = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    fs.writeFileSync(logoB64Path, base64Data);

    console.log('Logo transparency and base64 generation completed successfully!');
  } catch (error) {
    console.error('Error processing transparency:', error);
  }
}

makeTransparent();
