import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts';

async function main() {
    const originalPath = path.join(ARTIFACTS_DIR, 'experiment-original.jpg');
    const maskPath = path.join(ARTIFACTS_DIR, '03-modal-full-mask.png');
    const compositedPath = path.join(ARTIFACTS_DIR, 'test-composited-feathered.png');

    try {
        const origMeta = await sharp(originalPath).metadata();
        const origW = origMeta.width;
        const origH = origMeta.height;

        const maskBuf = await sharp(maskPath)
            .greyscale()
            .resize(origW, origH, { fit: 'fill' })
            .raw()
            .toBuffer();

        let zeroCount = 0;
        let nonZeroCount = 0;
        let sum = 0;
        let min = 255;
        let max = 0;

        for (let i = 0; i < maskBuf.length; i++) {
            const val = maskBuf[i];
            sum += val;
            if (val === 0) {
                zeroCount++;
            } else {
                nonZeroCount++;
            }
            if (val < min) min = val;
            if (val > max) max = val;
        }

        console.log(`Mask statistics:`);
        console.log(`- Total pixels: ${maskBuf.length}`);
        console.log(`- Zero (black) pixels: ${zeroCount} (${((zeroCount/maskBuf.length)*100).toFixed(2)}%)`);
        console.log(`- Non-zero pixels: ${nonZeroCount} (${((nonZeroCount/maskBuf.length)*100).toFixed(2)}%)`);
        console.log(`- Min value: ${min}`);
        console.log(`- Max value: ${max}`);
        console.log(`- Average value: ${(sum / maskBuf.length).toFixed(2)}`);

        // Check difference between original and composited
        const originalBuf = await sharp(originalPath).removeAlpha().raw().toBuffer();
        const compositedBuf = await sharp(compositedPath).removeAlpha().raw().toBuffer();

        let diffs = [];
        for (let i = 0; i < originalBuf.length; i += 3) {
            const rDiff = Math.abs(originalBuf[i] - compositedBuf[i]);
            const gDiff = Math.abs(originalBuf[i+1] - compositedBuf[i+1]);
            const bDiff = Math.abs(originalBuf[i+2] - compositedBuf[i+2]);
            const maxDiff = Math.max(rDiff, gDiff, bDiff);
            if (maxDiff > 5) {
                diffs.push({ idx: i/3, diff: maxDiff, orig: [originalBuf[i], originalBuf[i+1], originalBuf[i+2]], comp: [compositedBuf[i], compositedBuf[i+1], compositedBuf[i+2]] });
            }
        }

        console.log(`\nDiff samples (first 5 differences):`);
        console.log(diffs.slice(0, 5));

    } catch (err) {
        console.error('Error:', err);
    }
}

main();
