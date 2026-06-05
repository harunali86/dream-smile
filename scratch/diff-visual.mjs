import sharp from 'sharp';

async function main() {
  try {
    const inputPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/fail-01-input.png';
    const outputPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/fail-04-output.webp';
    const diffOutPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/visual-diff.png';

    const outputImg = sharp(outputPath);
    const outputMeta = await outputImg.metadata();
    const W = outputMeta.width;
    const H = outputMeta.height;

    const inputBuf = await sharp(inputPath).resize(W, H, { fit: 'fill' }).raw().toBuffer();
    const outputBuf = await outputImg.raw().toBuffer();

    const diffPixels = Buffer.alloc(W * H * 4); // RGBA

    for (let i = 0; i < W * H; i++) {
      const idx = i * 4;
      const idxRaw = i * 3; // input/output raw RGB buffers have 3 channels

      const rDiff = Math.abs(inputBuf[idxRaw] - outputBuf[idxRaw]);
      const gDiff = Math.abs(inputBuf[idxRaw + 1] - outputBuf[idxRaw + 1]);
      const bDiff = Math.abs(inputBuf[idxRaw + 2] - outputBuf[idxRaw + 2]);

      const maxDiff = Math.max(rDiff, gDiff, bDiff);

      if (maxDiff > 10) {
        // Pixel is significantly different - color it RED in the diff image
        diffPixels[idx] = 255;
        diffPixels[idx + 1] = 0;
        diffPixels[idx + 2] = 0;
        diffPixels[idx + 3] = 255;
      } else {
        // Keep the original pixel but slightly dimmed
        diffPixels[idx] = Math.round(inputBuf[idxRaw] * 0.4);
        diffPixels[idx + 1] = Math.round(inputBuf[idxRaw + 1] * 0.4);
        diffPixels[idx + 2] = Math.round(inputBuf[idxRaw + 2] * 0.4);
        diffPixels[idx + 3] = 255;
      }
    }

    await sharp(diffPixels, { raw: { width: W, height: H, channels: 4 } })
      .png()
      .toFile(diffOutPath);

    console.log(`Saved visual diff to ${diffOutPath}`);
  } catch (err) {
    console.error(err);
  }
}

main();
