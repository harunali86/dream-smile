import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';

async function main() {
  try {
    const inputPath = path.join(BASE_DIR, 'public/demo-result.jpg');
    const outputPath = path.join(BASE_DIR, 'public/test-local-output.webp');
    const diffOutPath = path.join(BASE_DIR, 'public/diff.png');

    const outputImg = sharp(outputPath);
    const outputMeta = await outputImg.metadata();
    const W = outputMeta.width;
    const H = outputMeta.height;

    const inputBuf = await sharp(inputPath).resize(W, H, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    const outputBuf = await outputImg.ensureAlpha().raw().toBuffer();

    const diffPixels = Buffer.alloc(W * H * 4); // RGBA

    let totalDiffPixels = 0;
    for (let i = 0; i < W * H; i++) {
      const idx = i * 4;

      const rDiff = Math.abs(inputBuf[idx] - outputBuf[idx]);
      const gDiff = Math.abs(inputBuf[idx + 1] - outputBuf[idx + 1]);
      const bDiff = Math.abs(inputBuf[idx + 2] - outputBuf[idx + 2]);

      const maxDiff = Math.max(rDiff, gDiff, bDiff);

      if (maxDiff > 5) {
        // Colored red if different
        diffPixels[idx] = 255;
        diffPixels[idx + 1] = 0;
        diffPixels[idx + 2] = 0;
        diffPixels[idx + 3] = 255;
        totalDiffPixels++;
      } else {
        // Keep the original pixel but slightly dimmed
        diffPixels[idx] = Math.round(inputBuf[idx] * 0.4);
        diffPixels[idx + 1] = Math.round(inputBuf[idx + 1] * 0.4);
        diffPixels[idx + 2] = Math.round(inputBuf[idx + 2] * 0.4);
        diffPixels[idx + 3] = 255;
      }
    }

    await sharp(diffPixels, { raw: { width: W, height: H, channels: 4 } })
      .png()
      .toFile(diffOutPath);

    console.log(`Saved visual diff to ${diffOutPath}`);
    console.log(`Different pixels (maxDiff > 5): ${totalDiffPixels} / ${W * H} (${((totalDiffPixels / (W * H)) * 100).toFixed(2)}%)`);
  } catch (err) {
    console.error(err);
  }
}

main();
