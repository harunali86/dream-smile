import sharp from 'sharp';

async function main() {
  try {
    const inputPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/fail-01-input.png';
    const outputPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/fail-04-output.webp';
    
    const inputImg = sharp(inputPath);
    const outputImg = sharp(outputPath);
    
    const inputMeta = await inputImg.metadata();
    const outputMeta = await outputImg.metadata();
    
    console.log(`Input size: ${inputMeta.width}x${inputMeta.height}`);
    console.log(`Output size: ${outputMeta.width}x${outputMeta.height}`);
    
    const inputBuf = await inputImg.resize(outputMeta.width, outputMeta.height, { fit: 'fill' }).raw().toBuffer();
    const outputBuf = await outputImg.raw().toBuffer();
    
    let diffCount = 0;
    let totalDiff = 0;
    for (let i = 0; i < inputBuf.length; i++) {
      const diff = Math.abs(inputBuf[i] - outputBuf[i]);
      if (diff > 5) { // threshold of 5 to ignore compression noise
        diffCount++;
        totalDiff += diff;
      }
    }
    
    console.log(`Total values checked: ${inputBuf.length}`);
    console.log(`Differing values (> 5): ${diffCount}`);
    console.log(`Average difference: ${totalDiff / inputBuf.length}`);
  } catch (err) {
    console.error(err);
  }
}

main();
