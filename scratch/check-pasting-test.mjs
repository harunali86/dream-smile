import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';
const ORIGINAL_FACE_PATH = path.join(BASE_DIR, 'public/demo-result.jpg');
const COMPOSITE_PATH = path.join(BASE_DIR, 'public/test-local-output.webp');

async function main() {
    try {
        const origBuf = await sharp(ORIGINAL_FACE_PATH).resize(512, 512, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
        const compBuf = await sharp(COMPOSITE_PATH).resize(512, 512, { fit: 'fill' }).ensureAlpha().raw().toBuffer();

        let regionDiffCount = 0;
        let maxRegionDiff = 0;
        let sumDiff = 0;

        // Compare pixels in the specific mouth region Y: [220, 350], X: [136, 376]
        for (let y = 220; y < 350; y++) {
            for (let x = 136; x < 376; x++) {
                const idx = (y * 512 + x) * 4;
                const rDiff = Math.abs(origBuf[idx] - compBuf[idx]);
                const gDiff = Math.abs(origBuf[idx+1] - compBuf[idx+1]);
                const bDiff = Math.abs(origBuf[idx+2] - compBuf[idx+2]);
                const diff = (rDiff + gDiff + bDiff) / 3;
                if (diff > 2) { // filter out webp compression noise
                    regionDiffCount++;
                    sumDiff += diff;
                    if (diff > maxRegionDiff) maxRegionDiff = diff;
                }
            }
        }

        const regionTotal = (350 - 220) * (376 - 136);
        console.log(`\n📊 MOUTH REGION COMPARISON RESULT:`);
        console.log(`   - Different pixels: ${regionDiffCount} / ${regionTotal} (${((regionDiffCount/regionTotal)*100).toFixed(2)}%)`);
        console.log(`   - Max pixel intensity difference: ${maxRegionDiff.toFixed(1)}`);
        console.log(`   - Mean difference intensity: ${(sumDiff / (regionDiffCount || 1)).toFixed(1)}`);
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

main();
