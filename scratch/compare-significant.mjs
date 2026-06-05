import sharp from 'sharp';
import fs from 'fs';

const origPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/input.jpg';
const compPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/latest_final_composite.webp';

async function main() {
    const orig = sharp(origPath);
    const comp = sharp(compPath);
    
    const origMeta = await orig.metadata();
    const width = origMeta.width;
    const height = origMeta.height;
    
    const rOrig = await orig.ensureAlpha().raw().toBuffer();
    const rComp = await comp.resize(width, height).ensureAlpha().raw().toBuffer();
    
    let significantPixels = 0;
    
    for (let i = 0; i < rOrig.length; i += 4) {
        const diffR = Math.abs(rOrig[i] - rComp[i]);
        const diffG = Math.abs(rOrig[i+1] - rComp[i+1]);
        const diffB = Math.abs(rOrig[i+2] - rComp[i+2]);
        
        if (diffR > 10 || diffG > 10 || diffB > 10) {
            significantPixels++;
        }
    }
    
    const totalPixels = width * height;
    console.log(`Total pixels: ${totalPixels}`);
    console.log(`Pixels with >10 color difference: ${significantPixels}`);
    console.log(`Percentage of image changed: ${((significantPixels / totalPixels) * 100).toFixed(4)}%`);
}

main().catch(console.error);
