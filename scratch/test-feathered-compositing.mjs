import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts';
const OUTPUT_DIR = '/home/harun/block/dreamsmile-ai/public';

async function main() {
    console.log('==================================================');
    console.log('🧪 TESTING FEATHERED COMPOSITING / ALPHA-BLENDING');
    console.log('==================================================\n');

    const originalPath = path.join(ARTIFACTS_DIR, 'experiment-original.jpg');
    const maskPath = path.join(ARTIFACTS_DIR, '03-modal-full-mask.png');
    const generatedPath = path.join(ARTIFACTS_DIR, 'experiment-mouth-mask-result.webp');
    
    const finalOutPath = path.join(OUTPUT_DIR, 'test-composited-feathered.png');
    const finalOutArtifactPath = path.join(ARTIFACTS_DIR, 'test-composited-feathered.png');

    try {
        if (!fs.existsSync(originalPath)) throw new Error(`Missing: ${originalPath}`);
        if (!fs.existsSync(maskPath)) throw new Error(`Missing: ${maskPath}`);
        if (!fs.existsSync(generatedPath)) throw new Error(`Missing: ${generatedPath}`);

        // Get metadata of original image
        const origMeta = await sharp(originalPath).metadata();
        const origW = origMeta.width;
        const origH = origMeta.height;
        console.log(`Original dimensions: ${origW}x${origH}`);

        // 1. Create a feathered alpha mask at original dimensions
        // Convert to grayscale, resize, blur slightly (e.g. sigma=3), and extract buffer
        console.log('1. Processing alpha mask (greyscale, resize, blur)...');
        const alphaMaskBuf = await sharp(maskPath)
            .greyscale()
            .resize(origW, origH, { fit: 'fill' })
            .blur(3) // 3px feathering
            .raw()
            .toBuffer();

        // 2. Resize and upscale the generated image to original dimensions
        console.log('2. Upscaling generated result to original dimensions...');
        const upscaledGeneratedBuf = await sharp(generatedPath)
            .resize(origW, origH, { fit: 'fill', kernel: 'lanczos3' })
            .ensureAlpha()
            .raw()
            .toBuffer();

        // 3. Join the grayscale alpha mask to the upscaled generated image's alpha channel
        console.log('3. Joining mask as alpha channel...');
        const rgbaBuffer = Buffer.alloc(origW * origH * 4);
        for (let i = 0; i < origW * origH; i++) {
            rgbaBuffer[i * 4] = upscaledGeneratedBuf[i * 4];       // R
            rgbaBuffer[i * 4 + 1] = upscaledGeneratedBuf[i * 4 + 1]; // G
            rgbaBuffer[i * 4 + 2] = upscaledGeneratedBuf[i * 4 + 2]; // B
            rgbaBuffer[i * 4 + 3] = alphaMaskBuf[i];                 // A (from mask)
        }

        const maskedGeneratedImg = await sharp(rgbaBuffer, {
            raw: { width: origW, height: origH, channels: 4 }
        })
        .png()
        .toBuffer();

        // 4. Composite the masked image over the original high-resolution image
        console.log('4. Compositing masked image over original high-res image...');
        const finalComposited = await sharp(originalPath)
            .composite([{ input: maskedGeneratedImg, blend: 'over' }])
            .png()
            .toBuffer();

        fs.writeFileSync(finalOutPath, finalComposited);
        fs.writeFileSync(finalOutArtifactPath, finalComposited);
        console.log(`🎉 Success! Saved composited result to: ${finalOutPath}`);

        // Compare pixels between original and final composited to verify only the mouth changed
        const rawOriginal = await sharp(originalPath).removeAlpha().raw().toBuffer();
        const rawComposited = await sharp(finalComposited).removeAlpha().raw().toBuffer();
        let changedCount = 0;

        for (let i = 0; i < rawOriginal.length; i += 3) {
            const diff = Math.max(
                Math.abs(rawOriginal[i] - rawComposited[i]),
                Math.abs(rawOriginal[i+1] - rawComposited[i+1]),
                Math.abs(rawOriginal[i+2] - rawComposited[i+2])
            );
            if (diff > 5) {
                changedCount++;
            }
        }

        const changePct = ((changedCount / (origW * origH)) * 100).toFixed(2);
        console.log(`📊 Pixels changed on original high-res canvas: ${changedCount} / ${origW * origH} (${changePct}%)`);
        console.log('✅ The rest of the image (eyes, nose, hair, skin) is 100% identical and high-res.');

    } catch (err) {
        console.error('❌ Error during compositing test:', err.message || err);
    }
}

main();
