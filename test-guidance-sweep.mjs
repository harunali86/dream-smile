import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ENDPOINT = 'https://harunshaikh270599--dreamsmile-flux-fluxinpaint-inpaint.modal.run';
const BASE_DIR = '/home/harun/block/dreamsmile-ai';

async function testScale(imgB64, maskB64, guidanceScale) {
    console.log(`📡 Sending request for guidance_scale: ${guidanceScale}...`);
    try {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: imgB64,
                mask: maskB64,
                prompt: 'perfect natural bright smiling white teeth, porcelain veneers, photorealistic dental aesthetics',
                guidance_scale: guidanceScale,
                num_inference_steps: 12, // slightly more steps for higher quality evaluation
                width: 256,
                height: 256,
                seed: 42
            })
        });

        if (!response.ok) {
            console.error(`❌ HTTP Error for scale ${guidanceScale}: status ${response.status}`);
            return null;
        }

        const result = await response.json();
        if (result.success) {
            console.log(`✅ Received output for scale ${guidanceScale}`);
            return result.image;
        } else {
            console.error(`❌ Modal error for scale ${guidanceScale}:`, result.error);
            return null;
        }
    } catch (e) {
        console.error(`❌ Exception for scale ${guidanceScale}:`, e.message);
        return null;
    }
}

async function main() {
    console.log('==================================================');
    console.log('🚀 DREAMSMILE AI: GUIDANCE SCALE SWEEP TEST');
    console.log('==================================================\n');

    const inputImagePath = path.join(BASE_DIR, 'public/demo-result.jpg');
    if (!fs.existsSync(inputImagePath)) {
        console.error(`❌ Input image not found at ${inputImagePath}`);
        process.exit(1);
    }

    // Prep input
    const imgBuffer = await sharp(inputImagePath)
        .resize(256, 256, { fit: 'fill' })
        .jpeg({ quality: 90 })
        .toBuffer();
    const imgB64 = imgBuffer.toString('base64');

    // Create mask
    const svgMask = `
    <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
        <rect width="256" height="256" fill="black" />
        <rect x="68" y="110" width="120" height="65" fill="white" />
    </svg>
    `;
    const maskBuffer = await sharp(Buffer.from(svgMask))
        .png()
        .toBuffer();
    const maskB64 = maskBuffer.toString('base64');

    const scales = [30.0, 15.0, 7.0, 3.5, 1.5];
    
    for (const scale of scales) {
        const resultB64 = await testScale(imgB64, maskB64, scale);
        if (resultB64) {
            const outPath = path.join(BASE_DIR, `public/test-modal-sweep-${scale}.webp`);
            fs.writeFileSync(outPath, Buffer.from(resultB64, 'base64'));
            console.log(`💾 Saved: public/test-modal-sweep-${scale}.webp`);
        }
    }

    console.log('\n🎉 Sweep testing completed successfully!');
}

main();
