import sharp from 'sharp';

async function main() {
  try {
    const { data } = await sharp('/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/visual-diff.png').raw().toBuffer({ resolveWithObject: true });
    let redCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 255 && data[i+1] === 0 && data[i+2] === 0) redCount++;
    }
    console.log('Red pixels (changed):', redCount);
  } catch (err) {
    console.error(err);
  }
}

main();
