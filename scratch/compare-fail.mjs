import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts';

async function main() {
    const inputPath = path.join(ARTIFACTS_DIR, 'fail-01-input.png');
    const outputPath = path.join(ARTIFACTS_DIR, 'fail-05-composite.webp');

    if (!fs.existsSync(inputPath) || !fs.existsSync(outputPath)) {
        console.log("❌ Files missing in artifacts folder:", { inputPath, outputPath });
        return;
    }

    const inputMeta = await sharp(inputPath).metadata();
    const outputPathParsed = path.join(ARTIFACTS_DIR, 'fail-05-composite.webp');
    const outputMeta = await sharp(outputPathParsed).metadata();

    console.log(`Input Dimensions: ${inputMeta.width}x${inputMeta.height}`);
    console.log(`Output Dimensions: ${outputMeta.width}x${outputMeta.height}`);

    const w = inputMeta.width;
    const h = inputMeta.height;

    const inputRaw = await sharp(inputPath)
        .raw()
        .toBuffer();

    const outputRaw = await sharp(outputPathParsed)
        .resize(w, h, { fit: 'fill' })
        .raw()
        .toBuffer();

    let diffCount = 0;
    let totalDiff = 0;

    for (let i = 0; i < inputRaw.length; i++) {
        const diff = Math.abs(inputRaw[i] - outputRaw[i]);
        if (diff > 0) {
            diffCount++;
            totalDiff += diff;
        }
    }

    console.log(`Total values checked: ${inputRaw.length}`);
    console.log(`Different bytes: ${diffCount} (${((diffCount / inputRaw.length) * 100).toFixed(4)}%)`);
    if (diffCount > 0) {
        console.log(`Average byte difference: ${totalDiff / diffCount}`);
    } else {
        console.log(`✅ 100% IDENTICAL: The output is mathematically identical to the input.`);
    }
}

main();
