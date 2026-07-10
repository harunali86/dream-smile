import sharp from 'sharp';
import path from 'path';

const DEBUG_DIR = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-07-03T11-51-16-192Z';

async function main() {
    const inputPath = path.join(DEBUG_DIR, '01-modal-full-input.png');
    const maskPath = path.join(DEBUG_DIR, '03-modal-full-mask.png');
    const compositePath = path.join(DEBUG_DIR, '05-final-composite.webp');

    const alphaMaskBuf = await sharp(maskPath)
        .greyscale()
        .resize(512, 512, { fit: 'fill' })
        .blur(3)
        .extractChannel(0)
        .raw()
        .toBuffer();

    const inputImg = sharp(inputPath);
    const { data: inpData } = await inputImg.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const compositeImg = sharp(compositePath);
    const { data: compData } = await compositeImg.resize(512, 512, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    let diffs = [];
    for (let i = 0; i < alphaMaskBuf.length; i++) {
        const alpha = alphaMaskBuf[i];
        if (alpha > 0) {
            const idx = i * 4;
            const diff = Math.abs(compData[idx] - inpData[idx]) + 
                         Math.abs(compData[idx+1] - inpData[idx+1]) + 
                         Math.abs(compData[idx+2] - inpData[idx+2]);
            diffs.push(diff);
        }
    }

    diffs.sort((a, b) => a - b);
    const sum = diffs.reduce((s, x) => s + x, 0);
    const avg = sum / diffs.length;
    const median = diffs[Math.floor(diffs.length / 2)];
    const max = diffs[diffs.length - 1];

    console.log(`Opaque pixels diff analysis:`);
    console.log(`- Count of opaque pixels: ${diffs.length}`);
    console.log(`- Average channel sum difference: ${avg.toFixed(2)}`);
    console.log(`- Median channel sum difference: ${median}`);
    console.log(`- Max channel sum difference: ${max}`);
    console.log(`- 90th percentile: ${diffs[Math.floor(diffs.length * 0.9)]}`);
    console.log(`- 95th percentile: ${diffs[Math.floor(diffs.length * 0.95)]}`);
    console.log(`- 99th percentile: ${diffs[Math.floor(diffs.length * 0.99)]}`);
}

main().catch(console.error);
