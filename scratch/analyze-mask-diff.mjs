import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';

async function main() {
    const img1Path = path.join(BASE_DIR, 'public/demo-result.jpg');
    const img2Path = path.join(BASE_DIR, 'public/test-local-output.webp');

    if (!fs.existsSync(img1Path) || !fs.existsSync(img2Path)) {
        console.log('Files missing');
        return;
    }

    const w = 512;
    const h = 512;

    let img1Buf = await sharp(img1Path).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    let img2Buf = await sharp(img2Path).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();

    let insideDiffSum = 0;
    let insidePixels = 0;
    let outsideDiffSum = 0;
    let outsidePixels = 0;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const rDiff = Math.abs(img1Buf[idx] - img2Buf[idx]);
            const gDiff = Math.abs(img1Buf[idx+1] - img2Buf[idx+1]);
            const bDiff = Math.abs(img1Buf[idx+2] - img2Buf[idx+2]);
            const diff = (rDiff + gDiff + bDiff) / 3;

            // Check if we are inside the mask rectangle (y: 220-350, x: 136-376)
            const isInside = (y >= 220 && y < 350 && x >= 136 && x < 376);
            if (isInside) {
                insideDiffSum += diff;
                insidePixels++;
            } else {
                outsideDiffSum += diff;
                outsidePixels++;
            }
        }
    }

    console.log(`Region Analysis:`);
    console.log(`  Inside mask average difference: ${(insideDiffSum / insidePixels).toFixed(2)} (on ${insidePixels} pixels)`);
    console.log(`  Outside mask average difference: ${(outsideDiffSum / outsidePixels).toFixed(2)} (on ${outsidePixels} pixels)`);
}

main().catch(console.error);
