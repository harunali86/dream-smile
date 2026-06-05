import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';
const DUMP_DIR = path.join(BASE_DIR, 'debug-dumps/2026-06-01T05-06-53-150Z');
const ORIGINAL_FACE_PATH = path.join(BASE_DIR, 'public/demo-result.jpg');
const COMPOSITE_PATH = path.join(DUMP_DIR, '05-final-composite.webp');
const ROI_INPUT_PATH = path.join(DUMP_DIR, '01-modal-roi-input.png');
const ROI_OUTPUT_PATH = path.join(DUMP_DIR, '04-flux-roi-output.webp');
const ROI_MASK_PATH = path.join(DUMP_DIR, '03-modal-roi-mask.png');

async function main() {
    console.log('==================================================');
    console.log('🧪 DETAILED PIXEL COMPARISON');
    console.log('==================================================\n');

    // 1. Verify existence
    const files = [ORIGINAL_FACE_PATH, COMPOSITE_PATH, ROI_INPUT_PATH, ROI_OUTPUT_PATH, ROI_MASK_PATH];
    for (const file of files) {
        if (!fs.existsSync(file)) {
            console.error(`❌ File not found: ${file}`);
            return;
        }
    }

    try {
        // 2. Load images
        const origMeta = await sharp(ORIGINAL_FACE_PATH).metadata();
        const compMeta = await sharp(COMPOSITE_PATH).metadata();
        const roiInMeta = await sharp(ROI_INPUT_PATH).metadata();
        const roiOutMeta = await sharp(ROI_OUTPUT_PATH).metadata();
        const maskMeta = await sharp(ROI_MASK_PATH).metadata();

        console.log(`Original Face: ${origMeta.width}x${origMeta.height}`);
        console.log(`Composite Face: ${compMeta.width}x${compMeta.height}`);
        console.log(`ROI Input: ${roiInMeta.width}x${roiInMeta.height}`);
        console.log(`ROI Output: ${roiOutMeta.width}x${roiOutMeta.height}`);
        console.log(`ROI Mask: ${maskMeta.width}x${maskMeta.height}\n`);

        // Read raw buffers of the 512x512 faces
        const origBuf = await sharp(ORIGINAL_FACE_PATH).resize(512, 512, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
        const compBuf = await sharp(COMPOSITE_PATH).resize(512, 512, { fit: 'fill' }).ensureAlpha().raw().toBuffer();

        // Find the coordinates where Composite differs from Original Face
        let totalDiff = 0;
        let diffPixels = [];
        let minX = 512, maxX = 0, minY = 512, maxY = 0;

        for (let y = 0; y < 512; y++) {
            for (let x = 0; x < 512; x++) {
                const idx = (y * 512 + x) * 4;
                const rDiff = Math.abs(origBuf[idx] - compBuf[idx]);
                const gDiff = Math.abs(origBuf[idx+1] - compBuf[idx+1]);
                const bDiff = Math.abs(origBuf[idx+2] - compBuf[idx+2]);

                if (rDiff > 0 || gDiff > 0 || bDiff > 0) {
                    totalDiff++;
                    diffPixels.push({ x, y, rDiff, gDiff, bDiff });
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        console.log(`🔍 Diff analysis (Composite vs Original Face):`);
        console.log(`   - Different pixels: ${totalDiff} / 262144 (${((totalDiff/262144)*100).toFixed(4)}%)`);
        if (totalDiff > 0) {
            console.log(`   - Bounding box of diffs: X [${minX}, ${maxX}] (width ${maxX - minX + 1}), Y [${minY}, ${maxY}] (height ${maxY - minY + 1})`);
            
            // Print a sample of some differences
            console.log(`   - Sample diff pixels (first 5):`);
            for (let i = 0; i < Math.min(5, diffPixels.length); i++) {
                const p = diffPixels[i];
                const idx = (p.y * 512 + p.x) * 4;
                console.log(`     at (${p.x}, ${p.y}): Original [${origBuf[idx]}, ${origBuf[idx+1]}, ${origBuf[idx+2]}] vs Composite [${compBuf[idx]}, ${compBuf[idx+1]}, ${compBuf[idx+2]}]`);
            }
        } else {
            console.log(`   - No differences found between original face and composite!`);
        }
        console.log('');

        // Let's analyze the crop region specifically:
        // We know from test-local-api.mjs that the mask region was: Y: [220, 350], X: [136, 376]
        // Let's compare pixels in this specific region
        console.log(`🔍 Analyzing the client-specified mask region Y: [220, 350], X: [136, 376]:`);
        let regionDiffCount = 0;
        let maxRegionDiff = 0;
        for (let y = 220; y < 350; y++) {
            for (let x = 136; x < 376; x++) {
                const idx = (y * 512 + x) * 4;
                const rDiff = Math.abs(origBuf[idx] - compBuf[idx]);
                const gDiff = Math.abs(origBuf[idx+1] - compBuf[idx+1]);
                const bDiff = Math.abs(origBuf[idx+2] - compBuf[idx+2]);
                const diff = (rDiff + gDiff + bDiff) / 3;
                if (diff > 0) {
                    regionDiffCount++;
                    if (diff > maxRegionDiff) maxRegionDiff = diff;
                }
            }
        }
        const regionTotal = (350 - 220) * (376 - 136);
        console.log(`   - Mask region size: ${regionTotal} pixels`);
        console.log(`   - Different pixels in mask region: ${regionDiffCount} (${((regionDiffCount/regionTotal)*100).toFixed(2)}%)`);
        console.log(`   - Max pixel intensity diff: ${maxRegionDiff.toFixed(1)}`);
        console.log('');

        // Compare ROI output (04-flux-roi-output.webp) with ROI input (01-modal-roi-input.png)
        // ROI output is 896x632.
        const roiInBuf = await sharp(ROI_INPUT_PATH).ensureAlpha().raw().toBuffer();
        const roiOutBuf = await sharp(ROI_OUTPUT_PATH).ensureAlpha().raw().toBuffer();
        const roiMaskBuf = await sharp(ROI_MASK_PATH).ensureAlpha().raw().toBuffer();

        let roiTotalDiff = 0;
        let maskActiveCount = 0;
        let roiDiffInMask = 0;

        for (let i = 0; i < roiInBuf.length; i += 4) {
            const rDiff = Math.abs(roiInBuf[i] - roiOutBuf[i]);
            const gDiff = Math.abs(roiInBuf[i+1] - roiOutBuf[i+1]);
            const bDiff = Math.abs(roiInBuf[i+2] - roiOutBuf[i+2]);
            const aMask = roiMaskBuf[i+3]; // alpha of 03-modal-roi-mask

            if (rDiff > 0 || gDiff > 0 || bDiff > 0) {
                roiTotalDiff++;
                if (aMask > 0) {
                    roiDiffInMask++;
                }
            }
            if (aMask > 0) {
                maskActiveCount++;
            }
        }

        console.log(`🔍 ROI Analysis (896x632):`);
        console.log(`   - Total pixels: ${roiInBuf.length/4}`);
        console.log(`   - Differing pixels in entire ROI: ${roiTotalDiff} (${((roiTotalDiff/(roiInBuf.length/4))*100).toFixed(2)}%)`);
        console.log(`   - Active pixels in ROI mask: ${maskActiveCount} (${((maskActiveCount/(roiInBuf.length/4))*100).toFixed(2)}%)`);
        console.log(`   - Differing pixels inside mask: ${roiDiffInMask} (${((roiDiffInMask/maskActiveCount)*100).toFixed(2)}% of mask area)`);

    } catch (err) {
        console.error('❌ Error during pixel comparison:', err.message || err);
    }
    console.log('\n==================================================');
}

main();
