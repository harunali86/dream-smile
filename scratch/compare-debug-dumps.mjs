import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const DUMP_DIR = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-06-01T05-06-53-150Z';

async function main() {
    console.log('==================================================');
    console.log('🔍 PIPELINE STEP COMPARISON: DEBUG DUMPS');
    console.log('==================================================\n');

    const roiInputPath = path.join(DUMP_DIR, '01-modal-roi-input.png');
    const roiOutputPath = path.join(DUMP_DIR, '04-flux-roi-output.webp');
    const compositePath = path.join(DUMP_DIR, '05-final-composite.webp');

    if (!fs.existsSync(roiInputPath) || !fs.existsSync(roiOutputPath) || !fs.existsSync(compositePath)) {
        console.error('❌ One or more debug dump files are missing.');
        return;
    }

    try {
        const metadataInput = await sharp(roiInputPath).metadata();
        const metadataOutput = await sharp(roiOutputPath).metadata();
        const metadataComp = await sharp(compositePath).metadata();

        console.log(`📏 01-modal-roi-input.png: ${metadataInput.width}x${metadataInput.height}`);
        console.log(`📏 04-flux-roi-output.webp: ${metadataOutput.width}x${metadataOutput.height}`);
        console.log(`📏 05-final-composite.webp: ${metadataComp.width}x${metadataComp.height}\n`);

        // Read raw pixels
        const inputBuf = await sharp(roiInputPath).ensureAlpha().raw().toBuffer();
        const outputBuf = await sharp(roiOutputPath).resize(metadataInput.width, metadataInput.height).ensureAlpha().raw().toBuffer();
        const compBuf = await sharp(compositePath).resize(metadataInput.width, metadataInput.height).ensureAlpha().raw().toBuffer();

        // 1. Compare ROI input vs ROI output (Did the model change the teeth?)
        let diffModel = 0;
        let totalDiffModel = 0;
        for (let i = 0; i < inputBuf.length; i += 4) {
            const rDiff = Math.abs(inputBuf[i] - outputBuf[i]);
            const gDiff = Math.abs(inputBuf[i+1] - outputBuf[i+1]);
            const bDiff = Math.abs(inputBuf[i+2] - outputBuf[i+2]);
            if (rDiff > 0 || gDiff > 0 || bDiff > 0) {
                diffModel++;
                totalDiffModel += (rDiff*rDiff + gDiff*gDiff + bDiff*bDiff) / 3;
            }
        }
        const pctModel = ((diffModel / (inputBuf.length/4)) * 100).toFixed(2);
        const mseModel = (totalDiffModel / (inputBuf.length/4)).toFixed(2);
        console.log(`👉 ROI Input vs Flux Model ROI Output:`);
        console.log(`   - Different pixels: ${diffModel} / ${inputBuf.length/4} (${pctModel}%)`);
        console.log(`   - Mean Squared Error: ${mseModel}`);
        if (diffModel === 0 || mseModel < 2.0) {
            console.log(`   - Analysis: ⚠️ The Modal GPU output is identical to the input! The model itself returned unmodified teeth.`);
        } else {
            console.log(`   - Analysis: ✅ The Modal GPU output changed the teeth successfully!`);
        }
        console.log('');

        // Compare 05-final-composite.webp with original face to see if the composite is actually identical
        const originalFacePath = '/home/harun/block/dreamsmile-ai/public/demo-result.jpg';
        const origBuf = await sharp(originalFacePath).resize(512, 512, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
        const compBufResized = await sharp(compositePath).resize(512, 512, { fit: 'fill' }).ensureAlpha().raw().toBuffer();

        let diffComp = 0;
        let totalComp = 0;
        for (let i = 0; i < origBuf.length; i += 4) {
            const rDiff = Math.abs(origBuf[i] - compBufResized[i]);
            const gDiff = Math.abs(origBuf[i+1] - compBufResized[i+1]);
            const bDiff = Math.abs(origBuf[i+2] - compBufResized[i+2]);
            if (rDiff > 0 || gDiff > 0 || bDiff > 0) {
                diffComp++;
                totalComp += (rDiff*rDiff + gDiff*gDiff + bDiff*bDiff) / 3;
            }
        }
        const pctComp = ((diffComp / (origBuf.length/4)) * 100).toFixed(2);
        const mseComp = (totalComp / (origBuf.length/4)).toFixed(2);
        console.log(`👉 Original Face vs 05-final-composite.webp:`);
        console.log(`   - Different pixels: ${diffComp} / ${origBuf.length/4} (${pctComp}%)`);
        console.log(`   - Mean Squared Error: ${mseComp}`);
        if (diffComp === 0 || mseComp < 2.0) {
            console.log(`   - Analysis: ⚠️ The final composite is identical to the original face! Blending discarded all changes.`);
        } else {
            console.log(`   - Analysis: ✅ The final composite is visually different from the original face!`);
        }
        console.log('');

    } catch (err) {
        console.error('❌ Error:', err.message || err);
    }
}

main();
