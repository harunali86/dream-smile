import sharp from 'sharp';
import path from 'path';

async function main() {
  try {
    const maskPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/03-modal-full-mask.png';
    const { data, info } = await sharp(maskPath).raw().toBuffer({ resolveWithObject: true });
    
    let whiteCount = 0;
    let blackCount = 0;
    let grayCount = 0;
    
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      if (r === 255) whiteCount++;
      else if (r === 0) blackCount++;
      else grayCount++;
    }
    
    console.log(`Mask dimensions: ${info.width}x${info.height}`);
    console.log(`Black pixels (0): ${blackCount}`);
    console.log(`White pixels (255): ${whiteCount}`);
    console.log(`Gray pixels (1-254): ${grayCount}`);
  } catch (err) {
    console.error(err);
  }
}

main();
