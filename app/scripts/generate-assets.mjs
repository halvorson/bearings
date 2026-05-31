/**
 * Generates PNG assets from SVG sources using @resvg/resvg-js.
 * Run once: node scripts/generate-assets.mjs
 */
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const iconSvg = readFileSync(join(publicDir, 'favicon.svg'), 'utf8');
const ogSvg = readFileSync(join(__dirname, 'og-image.svg'), 'utf8');

function renderSvg(svg, width, height, outPath) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  writeFileSync(outPath, pngBuffer);
  console.log(`wrote ${outPath} (${width}×${height})`);
}

renderSvg(iconSvg, 512, 512,  join(publicDir, 'icon-512.png'));
renderSvg(iconSvg, 192, 192,  join(publicDir, 'icon-192.png'));
renderSvg(iconSvg, 180, 180,  join(publicDir, 'apple-touch-icon.png'));
renderSvg(ogSvg,  1200, 630,  join(publicDir, 'og-image.png'));

console.log('Done.');
