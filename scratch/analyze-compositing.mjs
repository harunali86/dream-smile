import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const DUMP_DIR = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-06-01T14-10-08-684Z';

async function run() {
    const fullImg = sharp(path.join(DUMP_DIR, '05-final-composite.webp'));
    const roiInput = sharp(path.join(DUMP_DIR, '01-modal-roi-input.png'));
    const roiOutput = sharp(path.join(DUMP_DIR, '04-flux-roi-output.webp'));
    const maskImg = sharp(path.join(DUMP_DIR, '03-modal-roi-mask.png'));

    const fullMeta = await fullImg.metadata();
    const roiInMeta = await roiInput.metadata();
    const roiOutMeta = await roiOutput.metadata();
    const maskMeta = await maskImg.metadata();

    console.log(`Full image dimensions: ${fullMeta.width}x${fullMeta.height}`);
    console.log(`ROI Input dimensions: ${roiInMeta.width}x${roiInMeta.height}`);
    console.log(`ROI Output dimensions: ${roiOutMeta.width}x${roiOutMeta.height}`);
    console.log(`Mask dimensions: ${maskMeta.width}x${maskMeta.height}`);

    const fullRaw = await fullImg.raw().toBuffer();
    const roiInRaw = await roiInput.raw().toBuffer();
    const roiOutRaw = await roiOutput.raw().toBuffer();
    const maskRaw = await maskImg.raw().toBuffer();

    // Since roiInput is cropped from original and resized to requestWidth x requestHeight (896x504),
    // and fullImage has size 1000x616, let's find the crop coordinates by matching the resized ROI input to the full image.
    // However, wait! The pasteMaskedRoiBack function resizes the generated ROI (896x496) to cropMeta.width x cropMeta.height,
    // and pastes it. So the cropMeta width/height is the actual original crop size (which might be different from 896x504).
    // Let's find the bounding box in the full image that differs from some default or has the teeth mask shape.
    // Wait, let's scan the full image for where it differs from the original. Since we don't have the original full image,
    // let's look at the mask.
    // Wait, the mask 03-modal-roi-mask.png has size 896x504.
    // Let's print out the pixel statistics.
    let nonZeroMask = 0;
    for (let i = 0; i < maskRaw.length; i += maskMeta.channels) {
        const val = maskMeta.channels === 4 ? maskRaw[i + 3] : maskRaw[i];
        if (val > 0) nonZeroMask++;
    }
    console.log(`Mask active pixels: ${nonZeroMask}`);
}

run().catch(console.error);
