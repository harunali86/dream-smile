import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const folder = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-06-04T13-10-25-249Z';

async function analyze() {
    const inputPath = path.join(folder, '01-modal-full-input.png');
    const maskPath = path.join(folder, '03-modal-full-mask.png');
    const outputPath = path.join(folder, '04-flux-modal-output.webp');
    const compositePath = path.join(folder, '05-final-composite.webp');

    if (!fs.existsSync(inputPath) || !fs.existsSync(maskPath) || !fs.existsSync(outputPath) || !fs.existsSync(compositePath)) {
        console.log('Some files are missing');
        return;
    }

    const meta = await sharp(inputPath).metadata();
    const w = meta.width;
    const h = meta.height;

    const inputBuf = await sharp(inputPath).ensureAlpha().raw().toBuffer();
    const maskBuf = await sharp(maskPath).raw().toBuffer();
    const outputBuf = await sharp(outputPath).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    const compositeBuf = await sharp(compositePath).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();

    let insideDiffSum = 0;
    let insidePixels = 0;
    let outsideDiffSum = 0;
    let outsidePixels = 0;

    let insideCompDiffSum = 0;
    let insideCompPixels = 0;
    let outsideCompDiffSum = 0;
    let outsideCompPixels = 0;

    const channels = 3; // mask is png, channels could be 3 or 4. Let's inspect meta
    const maskMeta = await sharp(maskPath).metadata();
    const maskChannels = maskMeta.channels || 3;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const maskIdx = (y * w + x) * maskChannels;

            const isWhite = maskBuf[maskIdx] > 127; // threshold at 127 for white in mask

            // Input vs Output (returned from model)
            const rDiff = Math.abs(inputBuf[idx] - outputBuf[idx]);
            const gDiff = Math.abs(inputBuf[idx+1] - outputBuf[idx+1]);
            const bDiff = Math.abs(inputBuf[idx+2] - outputBuf[idx+2]);
            const diff = (rDiff + gDiff + bDiff) / 3;

            // Input vs Composite
            const rCompDiff = Math.abs(inputBuf[idx] - compositeBuf[idx]);
            const gCompDiff = Math.abs(inputBuf[idx+1] - compositeBuf[idx+1]);
            const bCompDiff = Math.abs(inputBuf[idx+2] - compositeBuf[idx+2]);
            const compDiff = (rCompDiff + gCompDiff + bCompDiff) / 3;

            if (isWhite) {
                insideDiffSum += diff;
                insidePixels++;

                insideCompDiffSum += compDiff;
                insideCompPixels++;
            } else {
                outsideDiffSum += diff;
                outsidePixels++;

                outsideCompDiffSum += compDiff;
                outsideCompPixels++;
            }
        }
    }

    console.log(`Folder Run Analysis:`);
    console.log(`  Mask White Pixels (Inpaint target): ${insidePixels} / ${w*h}`);
    console.log(`  Input vs Output (Model output):`);
    console.log(`    Inside Mask average diff: ${(insideDiffSum / insidePixels).toFixed(2)}`);
    console.log(`    Outside Mask average diff: ${(outsideDiffSum / outsidePixels).toFixed(2)}`);
    console.log(`  Input vs Composite (Final composite):`);
    console.log(`    Inside Mask average diff: ${(insideCompDiffSum / insideCompPixels).toFixed(2)}`);
    console.log(`    Outside Mask average diff: ${(outsideCompDiffSum / outsideCompPixels).toFixed(2)}`);
}

analyze().catch(console.error);
