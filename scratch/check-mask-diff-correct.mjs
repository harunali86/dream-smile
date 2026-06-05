import sharp from 'sharp';

async function main() {
  try {
    const inputPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/fail-01-input.png';
    const maskPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/fail-03-mask.png';
    const outputPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/fail-04-output.webp';
    
    const outputImg = sharp(outputPath);
    const outputMeta = await outputImg.metadata();
    const W = outputMeta.width;
    const H = outputMeta.height;
    
    // Force RGB (3 channels)
    const inputBuf = await sharp(inputPath).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const outputBuf = await outputImg.removeAlpha().raw().toBuffer();
    
    // Force grayscale (1 channel)
    const maskBuf = await sharp(maskPath).resize(W, H, { fit: 'fill' }).grayscale().raw().toBuffer();
    
    console.log(`Buffers loaded. Sizes: Input=${inputBuf.length}, Output=${outputBuf.length}, Mask=${maskBuf.length}`);
    
    let inMaskDiff = 0;
    let inMaskTotal = 0;
    let outMaskDiff = 0;
    let outMaskTotal = 0;
    
    for (let i = 0; i < W * H; i++) {
      const idxRGB = i * 3;
      const idxMask = i;
      
      const maskVal = maskBuf[idxMask];
      
      const rDiff = Math.abs(inputBuf[idxRGB] - outputBuf[idxRGB]);
      const gDiff = Math.abs(inputBuf[idxRGB + 1] - outputBuf[idxRGB + 1]);
      const bDiff = Math.abs(inputBuf[idxRGB + 2] - outputBuf[idxRGB + 2]);
      const diff = Math.max(rDiff, gDiff, bDiff);
      
      if (maskVal > 127) {
        inMaskTotal++;
        if (diff > 5) inMaskDiff++;
      } else {
        outMaskTotal++;
        if (diff > 5) outMaskDiff++;
      }
    }
    
    console.log(`Corrected results:`);
    console.log(`In-mask total pixels: ${inMaskTotal}`);
    console.log(`In-mask differing (> 5): ${inMaskDiff} (${(inMaskDiff / Math.max(1, inMaskTotal) * 100).toFixed(2)}%)`);
    console.log(`Out-mask total pixels: ${outMaskTotal}`);
    console.log(`Out-mask differing (> 5): ${outMaskDiff} (${(outMaskDiff / Math.max(1, outMaskTotal) * 100).toFixed(2)}%)`);
  } catch (err) {
    console.error(err);
  }
}

main();
