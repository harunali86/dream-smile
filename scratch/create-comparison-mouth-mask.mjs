import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';
const ARTIFACTS_DIR = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts';

async function main() {
    console.log('==================================================');
    console.log('📊 CREATING SIDE-BY-SIDE VISUAL COMPARISON (MOUTH MASK)');
    console.log('==================================================\n');

    const inputPath = path.join(BASE_DIR, 'public/demo-result.jpg');
    const resultPath = path.join(BASE_DIR, 'public/flux_result_512.webp');
    const sideBySidePath = path.join(BASE_DIR, 'public/comparison-mouth-mask.png');

    try {
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Input missing at ${inputPath}`);
        }
        if (!fs.existsSync(resultPath)) {
            throw new Error(`Result missing at ${resultPath}`);
        }

        // Resize both to 512x512
        const inputBuf = await sharp(inputPath).resize(512, 512, { fit: 'fill' }).png().toBuffer();
        const resultBuf = await sharp(resultPath).resize(512, 512, { fit: 'fill' }).png().toBuffer();

        // Create a blank 1024x512 canvas
        const sideBySide = await sharp({
            create: {
                width: 1024,
                height: 512,
                channels: 3,
                background: { r: 0, g: 0, b: 0 }
            }
        })
        .composite([
            { input: inputBuf, left: 0, top: 0 },
            { input: resultBuf, left: 512, top: 0 }
        ])
        .png()
        .toBuffer();

        fs.writeFileSync(sideBySidePath, sideBySide);
        console.log(`🎉 Side-by-side comparison saved to: ${sideBySidePath}`);

        // Ensure target artifacts folder exists and copy files there
        if (!fs.existsSync(ARTIFACTS_DIR)) {
            fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
        }

        fs.copyFileSync(resultPath, path.join(ARTIFACTS_DIR, 'experiment-mouth-mask-result.webp'));
        fs.copyFileSync(sideBySidePath, path.join(ARTIFACTS_DIR, 'experiment-mouth-mask-side-by-side.png'));
        
        console.log('✅ Copied files to conversation artifacts directory.');

        // Compute pixel difference details
        const rawInput = await sharp(inputBuf).raw().toBuffer();
        const rawResult = await sharp(resultBuf).raw().toBuffer();
        let diffPixels = 0;
        let totalDiff = 0;

        for (let i = 0; i < rawInput.length; i += 4) {
            const rDiff = Math.abs(rawInput[i] - rawResult[i]);
            const gDiff = Math.abs(rawInput[i+1] - rawResult[i+1]);
            const bDiff = Math.abs(rawInput[i+2] - rawResult[i+2]);
            const maxDiff = Math.max(rDiff, gDiff, bDiff);

            if (maxDiff > 10) { // threshold of 10 to ignore tiny JPEG/WebP artifacts
                diffPixels++;
                totalDiff += (rDiff + gDiff + bDiff) / 3;
            }
        }

        const pct = ((diffPixels / (512 * 512)) * 100).toFixed(2);
        console.log(`📊 Total pixels changed (excluding minor compression noise): ${diffPixels} / 262144 (${pct}%)`);
        
    } catch (err) {
        console.error('❌ Error:', err.message || err);
    }
}

main();
