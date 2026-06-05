import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const dumpDir = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-06-01T18-28-46-436Z';

async function compareImages(file1, file2) {
    const p1 = path.join(dumpDir, file1);
    const p2 = path.join(dumpDir, file2);
    if (!fs.existsSync(p1) || !fs.existsSync(p2)) {
        console.log(`One or both files do not exist: ${file1}, ${file2}`);
        return;
    }

    const img1 = sharp(p1);
    const img2 = sharp(p2);

    const meta1 = await img1.metadata();
    const meta2 = await img2.metadata();

    console.log(`--- Comparing ${file1} (${meta1.width}x${meta1.height}) and ${file2} (${meta2.width}x${meta2.height}) ---`);

    const r1 = await img1.resize(meta1.width, meta1.height).raw().toBuffer();
    const r2 = await img2.resize(meta1.width, meta1.height).raw().toBuffer();

    let diffPixels = 0;
    let maxDiff = 0;
    let totalDiff = 0;

    const minLen = Math.min(r1.length, r2.length);
    for (let i = 0; i < minLen; i++) {
        const d = Math.abs(r1[i] - r2[i]);
        if (d > 0) {
            diffPixels++;
            totalDiff += d;
            if (d > maxDiff) maxDiff = d;
        }
    }

    console.log(`Different bytes: ${diffPixels} / ${minLen} (${((diffPixels/minLen)*100).toFixed(4)}%)`);
    console.log(`Max difference: ${maxDiff}`);
    console.log(`Average difference per byte: ${(totalDiff / minLen).toFixed(4)}`);
}

async function run() {
    await compareImages('01-modal-roi-input.png', '04-flux-roi-output.webp');
    await compareImages('01-modal-roi-input.png', '05-final-composite.webp');
    await compareImages('01-modal-roi-input.png', '02-modal-roi-prepared.png');
    await compareImages('01-modal-roi-input.png', 'debug-composed.webp');
    await compareImages('04-flux-roi-output.webp', '05-final-composite.webp');

    console.log('\n--- Mask Analysis ---');
    for (const maskFile of ['03-modal-roi-mask.png', '03b-modal-flat-mask.png']) {
        const p = path.join(dumpDir, maskFile);
        if (!fs.existsSync(p)) {
            console.log(`Mask file does not exist: ${maskFile}`);
            continue;
        }
        const img = sharp(p);
        const meta = await img.metadata();
        console.log(`${maskFile}: channels=${meta.channels}, size=${meta.width}x${meta.height}`);
        const raw = await img.raw().toBuffer();
        let nonZero = 0;
        for (let i = 0; i < raw.length; i += meta.channels) {
            // For 03b-modal-flat-mask, look at RGB values (specifically red at raw[i])
            // For others, look at alpha if channels === 4
            const val = (maskFile === '03b-modal-flat-mask.png') ? raw[i] : (meta.channels === 4 ? raw[i + 3] : raw[i]);
            if (val > 0) nonZero++;
        }
        console.log(`  Active pixels in mask: ${nonZero} / ${meta.width * meta.height} (${((nonZero/(meta.width * meta.height))*100).toFixed(4)}%)`);
    }
}

run().catch(console.error);
