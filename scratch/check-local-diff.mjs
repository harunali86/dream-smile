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

    const meta1 = await sharp(img1Path).metadata();
    const w = 512;
    const h = 512;

    let img1Buf = await sharp(img1Path).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    let img2Buf = await sharp(img2Path).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();

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

    console.log(`Local API Output Comparison:`);
    console.log(`  Total pixels checked: ${img1Buf.length / 4}`);
    console.log(`  Different pixels (diff > 2): ${diffPixels} (${((diffPixels / (img1Buf.length / 4)) * 100).toFixed(2)}%)`);
    console.log(`  Average difference among diff pixels: ${diffPixels > 0 ? (totalDiff / diffPixels).toFixed(2) : 0}`);
}

main().catch(console.error);
