import sharp from 'sharp';
import fs from 'fs';

const origPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/input.jpg';
const compPath = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts/latest_final_composite.webp';

async function main() {
    if (!fs.existsSync(origPath) || !fs.existsSync(compPath)) {
        console.error('One or both images do not exist!');
        process.exit(1);
    }

    const orig = sharp(origPath);
    const comp = sharp(compPath);

    const origMeta = await orig.metadata();
    const compMeta = await comp.metadata();

    console.log(`Original: ${origMeta.width}x${origMeta.height}`);
    console.log(`Composite: ${compMeta.width}x${compMeta.height}`);

    // Ensure we read them both in RGBA raw format resized to original size if they differ,
    // or just raw format if they are the same size.
    const width = origMeta.width;
    const height = origMeta.height;

    const rOrig = await orig.ensureAlpha().raw().toBuffer();
    const rComp = await comp.resize(width, height).ensureAlpha().raw().toBuffer();

    let diffBytes = 0;
    let maxDiff = 0;
    let totalDiff = 0;

    for (let i = 0; i < rOrig.length; i++) {
        const d = Math.abs(rOrig[i] - rComp[i]);
        if (d > 0) {
            diffBytes++;
            totalDiff += d;
            if (d > maxDiff) maxDiff = d;
        }
    }

    const totalPixels = width * height;
    console.log(`Different bytes: ${diffBytes} / ${rOrig.length} (${((diffBytes/rOrig.length)*100).toFixed(4)}%)`);
    console.log(`Max byte difference: ${maxDiff}`);
    console.log(`Average byte difference: ${(totalDiff / rOrig.length).toFixed(4)}`);
}

main().catch(console.error);
