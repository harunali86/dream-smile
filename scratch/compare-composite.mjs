import sharp from 'sharp';

async function main() {
  try {
    const rawPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/fail-04-output.webp';
    const compositePath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/fail-05-composite.webp';
    
    const rawImg = sharp(rawPath);
    const compImg = sharp(compositePath);
    
    const rawMeta = await rawImg.metadata();
    const compMeta = await compImg.metadata();
    
    console.log(`Raw Model Output size: ${rawMeta.width}x${rawMeta.height}`);
    console.log(`Composite size: ${compMeta.width}x${compMeta.height}`);
    
    const rawBuf = await rawImg.resize(compMeta.width, compMeta.height, { fit: 'fill' }).raw().toBuffer();
    const compBuf = await compImg.raw().toBuffer();
    
    let diffCount = 0;
    let totalDiff = 0;
    for (let i = 0; i < rawBuf.length; i++) {
      const diff = Math.abs(rawBuf[i] - compBuf[i]);
      if (diff > 5) {
        diffCount++;
        totalDiff += diff;
      }
    }
    
    console.log(`Total values checked: ${rawBuf.length}`);
    console.log(`Differing values (> 5): ${diffCount}`);
    console.log(`Average difference: ${totalDiff / rawBuf.length}`);
  } catch (err) {
    console.error(err);
  }
}

main();
