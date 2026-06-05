const sharp = require('sharp');
const fs = require('fs');

const basePath = '/home/harun/.gemini/antigravity/brain/b879e353-47d0-45d1-b9ed-1a49ee12a795/';
const inputPath = basePath + 'latest_input.png';
const maskPath = basePath + 'latest_mask.png';
const outputPath = basePath + 'latest_output.webp';

async function run() {
    try {
        console.log('--- Loading images ---');
        const inputMeta = await sharp(inputPath).metadata();
        const maskMeta = await sharp(maskPath).metadata();
        const outputMeta = await sharp(outputPath).metadata();

        console.log(`Input size: ${inputMeta.width}x${inputMeta.height}, channels: ${inputMeta.channels}`);
        console.log(`Mask size: ${maskMeta.width}x${maskMeta.height}, channels: ${maskMeta.channels}`);
        console.log(`Output size: ${outputMeta.width}x${outputMeta.height}, channels: ${outputMeta.channels}`);

        // 1. Analyze mask pixels
        const { data: maskBuffer } = await sharp(maskPath)
            .raw()
            .toBuffer({ resolveWithObject: true });

        let whiteCount = 0;
        let blackCount = 0;
        const totalPixels = maskMeta.width * maskMeta.height;
        const channels = maskMeta.channels || 4;

        for (let i = 0; i < maskBuffer.length; i += channels) {
            const r = maskBuffer[i];
            const g = maskBuffer[i+1];
            const b = maskBuffer[i+2];
            const a = channels === 4 ? maskBuffer[i+3] : 255;
            // Check if the pixel color is white-ish
            if (r > 128 && g > 128 && b > 128 && a > 128) {
                whiteCount++;
            } else {
                blackCount++;
            }
        }

        console.log('\n--- Mask Analysis ---');
        console.log(`Total pixels: ${totalPixels}`);
        console.log(`White/Opaque (Masked area): ${whiteCount} (${((whiteCount/totalPixels)*100).toFixed(2)}%)`);
        console.log(`Black/Transparent (Unmasked area): ${blackCount} (${((blackCount/totalPixels)*100).toFixed(2)}%)`);

        // 2. Analyze differences between input and output
        const targetW = 512;
        const targetH = 512;

        const inputResized = await sharp(inputPath)
            .resize(targetW, targetH, { fit: 'fill' })
            .raw()
            .toBuffer();

        const outputResized = await sharp(outputPath)
            .resize(targetW, targetH, { fit: 'fill' })
            .raw()
            .toBuffer();

        let diffSum = 0;
        let maxDiff = 0;
        let changedPixels = 0;

        for (let i = 0; i < inputResized.length; i += 4) {
            const diffR = Math.abs(inputResized[i] - outputResized[i]);
            const diffG = Math.abs(inputResized[i+1] - outputResized[i+1]);
            const diffB = Math.abs(inputResized[i+2] - outputResized[i+2]);
            const pixelDiff = (diffR + diffG + diffB) / 3;

            diffSum += pixelDiff;
            if (pixelDiff > maxDiff) maxDiff = pixelDiff;
            if (pixelDiff > 2) changedPixels++;
        }

        const avgDiff = diffSum / (targetW * targetH);
        console.log('\n--- Input vs Output Comparison ---');
        console.log(`Average pixel diff (0-255): ${avgDiff.toFixed(4)}`);
        console.log(`Max pixel diff (0-255): ${maxDiff}`);
        console.log(`Percentage of pixels changed (>2 threshold): ${((changedPixels / (targetW * targetH)) * 100).toFixed(2)}%`);

    } catch (err) {
        console.error('Error running script:', err);
    }
}

run();
