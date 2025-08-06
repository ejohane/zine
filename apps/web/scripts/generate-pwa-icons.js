import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const publicDir = join(__dirname, '..', 'public');

// Create a simple icon with "Z" for Zine
async function generateIcon(size) {
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#000000"/>
      <text x="50%" y="50%" font-family="system-ui, -apple-system, sans-serif" font-size="${size * 0.4}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">Z</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(publicDir, `pwa-${size}x${size}.png`));
  
  console.log(`Generated pwa-${size}x${size}.png`);
}

// Generate Apple touch icon
async function generateAppleTouchIcon() {
  const svg = `
    <svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">
      <rect width="180" height="180" fill="#000000"/>
      <text x="50%" y="50%" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">Z</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(publicDir, 'apple-touch-icon.png'));
  
  console.log('Generated apple-touch-icon.png');
}

// Generate favicon
async function generateFavicon() {
  const svg = `
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" fill="#000000"/>
      <text x="50%" y="50%" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">Z</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(publicDir, 'favicon.png'));
  
  console.log('Generated favicon.png');
}

async function main() {
  try {
    await generateIcon(192);
    await generateIcon(512);
    await generateAppleTouchIcon();
    await generateFavicon();
    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

main();