const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BASE_DIR = __dirname;

async function main() {
    const originalPath = path.join(BASE_DIR, 'public/demo-result.jpg');
    const resultPath = path.join(BASE_DIR, 'public/flux_result_512.webp');

    if (!fs.existsSync(originalPath) || !fs.existsSync(resultPath)) {
        console.log("Files missing:", originalPath, resultPath);
        return;
    }

    const origBuffer = await sharp(originalPath)
        .resize(512, 512, { fit: 'fill' })
        .raw()
        .toBuffer();

    const resBuffer = await sharp(resultPath)
        .raw()
        .toBuffer();

    if (origBuffer.length !== resBuffer.length) {
        console.log(`Dimensions mismatch or length mismatch: orig=${origBuffer.length}, res=${resBuffer.length}`);
        return;
    }

    let diffCount = 0;
    let totalDiff = 0;
    for (let i = 0; i < origBuffer.length; i++) {
        const diff = Math.abs(origBuffer[i] - resBuffer[i]);
        if (diff > 0) {
            diffCount++;
            totalDiff += diff;
        }
    }

    console.log(`Total values checked (channels): ${origBuffer.length}`);
    console.log(`Different values: ${diffCount}`);
    console.log(`Average difference: ${(totalDiff / origBuffer.length).toFixed(4)}`);
}

main();
