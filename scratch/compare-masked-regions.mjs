import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts';

async function main() {
    const inputPath = path.join(ARTIFACTS_DIR, 'fail-01-input.png');
    const maskPath = path.join(ARTIFACTS_DIR, 'fail-03-mask.png');
    const outputPath = path.join(ARTIFACTS_DIR, 'fail-05-composite.webp');

    if (!fs.existsSync(inputPath) || !fs.existsSync(maskPath) || !fs.existsSync(outputPath)) {
        console.log("❌ Files missing in artifacts folder");
        return;
    }

    const inputMeta = await sharp(inputPath).metadata();
    const w = inputMeta.width;
    const h = inputMeta.height;

    const inputRaw = await sharp(inputPath).raw().toBuffer();
    const maskRaw = await sharp(maskPath).resize(w, h, { fit: 'fill' }).raw().toBuffer();
    const outputRaw = await sharp(outputPath).resize(w, h, { fit: 'fill' }).raw().toBuffer();

    let insideDiffCount = 0;
    let insideTotalDiff = 0;
    let insidePixels = 0;

    let outsideDiffCount = 0;
    let outsideTotalDiff = 0;
    let outsidePixels = 0;

    for (let i = 0; i < inputRaw.length; i += 4) {
        // Check mask alpha/color (mask is PNG. composite onto black has white pixels where mask was)
        // Let's use maskRaw[i] (Red channel) as indicator of mask (since it is black/white)
        const isMasked = maskRaw[i] > 127; 
        
        const rDiff = Math.abs(inputRaw[i] - outputRaw[i]);
        const gDiff = Math.abs(inputRaw[i+1] - outputRaw[i+1]);
        const bDiff = Math.abs(inputRaw[i+2] - outputRaw[i+2]);
        const avgColorDiff = (rDiff + gDiff + bDiff) / 3;

        if (isMasked) {
            insidePixels++;
            if (avgColorDiff > 0) {
                insideDiffCount++;
                insideTotalDiff += avgColorDiff;
            }
        } else {
            outsidePixels++;
            if (avgColorDiff > 0) {
                outsideDiffCount++;
                outsideTotalDiff += avgColorDiff;
            }
        }
    }

    console.log(`Masked (inside) pixels: ${insidePixels}`);
    console.log(`Unmasked (outside) pixels: ${outsidePixels}`);
    
    console.log(`\n--- Inside Mask ---`);
    console.log(`Different pixels: ${insideDiffCount} (${((insideDiffCount / insidePixels) * 100).toFixed(2)}%)`);
    console.log(`Average color diff inside mask: ${insidePixels > 0 ? (insideTotalDiff / insidePixels).toFixed(2) : 0}`);

    console.log(`\n--- Outside Mask ---`);
    console.log(`Different pixels: ${outsideDiffCount} (${((outsideDiffCount / outsidePixels) * 100).toFixed(2)}%)`);
    console.log(`Average color diff outside mask: ${outsidePixels > 0 ? (outsideTotalDiff / outsidePixels).toFixed(2) : 0}`);
}

main();
