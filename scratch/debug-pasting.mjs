import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';
const DUMP_DIR = path.join(BASE_DIR, 'debug-dumps/2026-06-01T05-06-53-150Z');

// We need the exact original cropMeta used.
// Let's deduce cropMeta from the aspect ratio and checking dimensions.
// In check-pasting-result.mjs, the mouth region is: Y: [220, 350], X: [136, 376] (Height = 130, Width = 240)
// The full face size is 512x512 (resize fit: fill was done in check-pasting-result, but let's check original face size).
// Let's load the metadata of the files.

async function main() {
    console.log('--- PASTING PIPELINE DIAGNOSTIC ---');

    const originalFacePath = path.join(BASE_DIR, 'public/demo-result.jpg');
    const roiOutputPath = path.join(DUMP_DIR, '04-flux-roi-output.webp');
    const roiMaskPath = path.join(DUMP_DIR, '03-modal-roi-mask.png');

    const origMeta = await sharp(originalFacePath).metadata();
    const roiMeta = await sharp(roiOutputPath).metadata();
    const maskMeta = await sharp(roiMaskPath).metadata();

    console.log(`Original Face: ${origMeta.width}x${origMeta.height}, channels: ${origMeta.channels}`);
    console.log(`ROI Output: ${roiMeta.width}x${roiMeta.height}, channels: ${roiMeta.channels}`);
    console.log(`ROI Mask: ${maskMeta.width}x${maskMeta.height}, channels: ${maskMeta.channels}`);

    // Read mask and analyze its channels/pixels
    const maskImg = sharp(roiMaskPath);
    const maskMeta2 = await maskImg.metadata();
    console.log(`Mask metadata channels: ${maskMeta2.channels}`);

    // Replicate pasteMaskedRoiBack channel extraction logic
    let binaryAlpha;
    if (maskMeta2.channels === 4 || maskMeta2.channels === 2) {
        binaryAlpha = await maskImg
            .ensureAlpha()
            .extractChannel(maskMeta2.channels === 2 ? 1 : 3)
            .raw()
            .toBuffer();
    } else {
        binaryAlpha = await maskImg
            .greyscale()
            .raw()
            .toBuffer();
    }

    let nonZeroCount = 0;
    let minAlpha = 255;
    let maxAlpha = 0;
    for (let i = 0; i < binaryAlpha.length; i++) {
        if (binaryAlpha[i] > 0) nonZeroCount++;
        if (binaryAlpha[i] < minAlpha) minAlpha = binaryAlpha[i];
        if (binaryAlpha[i] > maxAlpha) maxAlpha = binaryAlpha[i];
    }

    console.log(`\n🔍 Extracted Mask Alpha Channel Analysis:`);
    console.log(`   - Total pixels in buffer: ${binaryAlpha.length}`);
    console.log(`   - Non-zero pixels count: ${nonZeroCount} (${((nonZeroCount/binaryAlpha.length)*100).toFixed(2)}%)`);
    console.log(`   - Alpha value range: [${minAlpha}, ${maxAlpha}]`);

    // Let's also print some sample values
    console.log(`   - First 10 pixels:`, Array.from(binaryAlpha.slice(0, 10)));
}

main().catch(err => console.error(err));
