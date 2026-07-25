import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputPath = 'public/ChatGPT Image Jul 25, 2026, 01_37_16 AM.png';
const logoPngPath = 'public/logo.png';
const logoB64Path = 'public/logo_base64.txt';
const faviconPngPath = 'public/favicon.png';
const faviconIcoPath = 'public/favicon.ico';

async function processLogo() {
  try {
    console.log('Processing logo with sharp...');
    
    // 1. Resize for general use (width 450, height auto)
    // We also want to trim any unnecessary white borders if any, but let's keep it clean
    await sharp(inputPath)
      .resize({ width: 450 })
      .png()
      .toFile(logoPngPath);
    
    console.log('Created public/logo.png');
    
    // 2. Generate Base64
    const logoBuffer = fs.readFileSync(logoPngPath);
    const base64Data = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    fs.writeFileSync(logoB64Path, base64Data);
    console.log(`Created public/logo_base64.txt (length: ${base64Data.length})`);
    
    // 3. Generate favicon.png (32x32)
    await sharp(inputPath)
      .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(faviconPngPath);
    console.log('Created public/favicon.png');
    
    // 4. Generate favicon.ico (optional, using favicon.png or direct output)
    await sharp(inputPath)
      .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFormat('ico')
      .toFile(faviconIcoPath);
    console.log('Created public/favicon.ico');
    
    console.log('Image processing completed successfully!');
  } catch (error) {
    console.error('Error processing logo:', error);
  }
}

processLogo();
