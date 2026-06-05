import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const dumpDir = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-06-04T13-10-25-249Z';

async function analyzeMask(maskPath) {
    if (!fs.existsSync(maskPath)) {
        console.log(`Mask file ${maskPath} does not exist`);
        return;
    }
    const meta = await sharp(maskPath).metadata();
    const buf = await sharp(maskPath).raw().toBuffer();
    
    let whitePixels = 0;
    let blackPixels = 0;
    let otherPixels = 0;
    
    const channels = meta.channels || 3;
    for (let i = 0; i < buf.length; i += channels) {
        // Since it's grayscale, we can look at the first channel
        const val = buf[i];
        if (val === 0) {
            blackPixels++;
        } else if (val === 255) {
            whitePixels++;
        } else {
            otherPixels++;
        }
    }
    console.log(`Mask [${path.basename(maskPath)}]:`);
    console.log(`  Dimensions: ${meta.width}x${meta.height}`);
    console.log(`  Black pixels (0): ${blackPixels}`);
    console.log(`  White pixels (255): ${whitePixels}`);
    console.log(`  Other pixels (1-254): ${otherPixels}`);
    console.log(`  Total pixels: ${buf.length / channels}`);
}

async function compareImages(img1Path, img2Path, label) {
    if (!fs.existsSync(img1Path) || !fs.existsSync(img2Path)) {
        console.log(`Files missing for comparison: ${img1Path} or ${img2Path}`);
        return;
    }
    const meta1 = await sharp(img1Path).metadata();
    const meta2 = await sharp(img2Path).metadata();

    const w = meta1.width;
    const h = meta1.height;
    
    // Resize img2 to match img1 if they differ, but let's check
    let img1Buf = await sharp(img1Path).resize(w, h).ensureAlpha().raw().toBuffer();
    let img2Buf = await sharp(img2Path).resize(w, h).ensureAlpha().raw().toBuffer();

    let diffPixels = 0;
    let totalDiff = 0;
    for (let i = 0; i < img1Buf.length; i += 4) {
        const rDiff = Math.abs(img1Buf[i] - img2Buf[i]);
        const gDiff = Math.abs(img1Buf[i+1] - img2Buf[i+1]);
        const bDiff = Math.abs(img1Buf[i+2] - img2Buf[i+2]);
        const diff = (rDiff + gDiff + bDiff) / 3;
        if (diff > 2) {
            diffPixels++;
            totalDiff += diff;
        }
    }

    console.log(`Comparison [${label}]:`);
    console.log(`  Total pixels checked: ${img1Buf.length / 4}`);
    console.log(`  Different pixels (diff > 2): ${diffPixels} (${((diffPixels / (img1Buf.length / 4)) * 100).toFixed(2)}%)`);
    console.log(`  Average difference among diff pixels: ${diffPixels > 0 ? (totalDiff / diffPixels).toFixed(2) : 0}`);
}

async function main() {
    await analyzeMask(path.join(dumpDir, '03-modal-full-mask.png'));
    console.log('');
    await compareImages(
        path.join(dumpDir, '01-modal-full-input.png'),
        path.join(dumpDir, '04-flux-modal-output.webp'),
        'Input vs Flux-Modal-Output (Original run)'
    );
    console.log('');
    await compareImages(
        path.join(dumpDir, '01-modal-full-input.png'),
        path.join(dumpDir, '04-test-direct-modal-output.webp'),
        'Input vs Test-Direct-Modal-Output (Direct Node request)'
    );
    console.log('');
    await compareImages(
        path.join(dumpDir, '04-flux-modal-output.webp'),
        path.join(dumpDir, '04-test-direct-modal-output.webp'),
        'Flux-Modal-Output vs Test-Direct-Modal-Output'
    );
}

main().catch(console.error);
