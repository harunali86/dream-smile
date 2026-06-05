import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const dumpDir = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-06-05T06-56-29-666Z';

async function run() {
    const inputPath = path.join(dumpDir, '01-modal-full-input.png');
    const maskPath = path.join(dumpDir, '03-modal-full-mask.png');

    console.log('Analyzing input:', inputPath);
    const inputMeta = await sharp(inputPath).metadata();
    console.log(`Input size: ${inputMeta.width}x${inputMeta.height}`);

    console.log('Analyzing mask:', maskPath);
    const maskMeta = await sharp(maskPath).metadata();
    console.log(`Mask size: ${maskMeta.width}x${maskMeta.height}, channels: ${maskMeta.channels}`);

    const { data: maskBuffer } = await sharp(maskPath)
        .raw()
        .toBuffer({ resolveWithObject: true });

    let covered = 0;
    let minX = maskMeta.width;
    let maxX = -1;
    let minY = maskMeta.height;
    let maxY = -1;

    for (let y = 0; y < maskMeta.height; y++) {
        for (let x = 0; x < maskMeta.width; x++) {
            const idx = (y * maskMeta.width + x) * (maskMeta.channels || 3);
            // In 3-channel grayscale, white is > 128
            const val = maskBuffer[idx];
            if (val > 128) {
                covered++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    const pct = (covered / (maskMeta.width * maskMeta.height)) * 100;
    console.log(`\nResults:`);
    console.log(`Covered pixels: ${covered} (${pct.toFixed(2)}%)`);
    if (covered > 0) {
        console.log(`Bounds: X [${minX}, ${maxX}] (width ${maxX - minX + 1}), Y [${minY}, ${maxY}] (height ${maxY - minY + 1})`);
        const centerY = (minY + maxY) / 2;
        console.log(`Center Y: ${centerY.toFixed(2)} (${(centerY / maskMeta.height * 100).toFixed(2)}% of height)`);
        
        // Let's run the spatial check simulation
        const w = maskMeta.width;
        const h = maskMeta.height;
        const maskW = maxX - minX + 1;
        const maskH = maxY - minY + 1;
        
        console.log(`\nSpatial check checks:`);
        console.log(`- centerY (${centerY.toFixed(2)}) >= h * 0.28 (${(h * 0.28).toFixed(2)}): ${centerY >= h * 0.28}`);
        console.log(`- centerY (${centerY.toFixed(2)}) <= h * 0.82 (${(h * 0.82).toFixed(2)}): ${centerY <= h * 0.82}`);
        console.log(`- maskW (${maskW}) >= w * 0.08 (${(w * 0.08).toFixed(2)}): ${maskW >= w * 0.08}`);
        console.log(`- maskH (${maskH}) >= h * 0.018 (${(h * 0.018).toFixed(2)}): ${maskH >= h * 0.018}`);
        console.log(`- count (${covered}) >= w * h * 0.0009 (${(w * h * 0.0009).toFixed(2)}): ${covered >= w * h * 0.0009}`);
    }
}

run().catch(console.error);
