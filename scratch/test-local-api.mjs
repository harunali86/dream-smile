import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const API_ENDPOINT = 'http://localhost:3001/api/v1/generate';
const BASE_DIR = '/home/harun/block/dreamsmile-ai';

async function main() {
    console.log('==================================================');
    console.log('🧪 TESTING LOCAL NEXT.JS API: /api/v1/generate');
    console.log('==================================================\n');

    const inputImagePath = path.join(BASE_DIR, 'public/demo-result.jpg');
    if (!fs.existsSync(inputImagePath)) {
        console.error(`❌ Input image not found at ${inputImagePath}`);
        process.exit(1);
    }

    try {
        console.log('🖼️  Step 1: Resizing & prepping input image to 512x512...');
        const imgBuffer = await sharp(inputImagePath)
            .resize(512, 512, { fit: 'fill' })
            .jpeg({ quality: 95 })
            .toBuffer();
        const imgDataUrl = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;

        console.log('🎭 Step 2: Creating a 512x512 mask with mouth region...');
        // Create a raw RGBA pixel buffer (matches frontend Canvas output format)
        // White pixels with alpha=255 = mask area, black with alpha=0 = no mask
        const W = 512, H = 512;
        const maskPixels = Buffer.alloc(W * H * 4, 0); // all transparent black
        // Paint a rectangular "mouth" region white with full alpha
        for (let y = 220; y < 350; y++) {
            for (let x = 136; x < 376; x++) {
                const idx = (y * W + x) * 4;
                maskPixels[idx]     = 255; // R
                maskPixels[idx + 1] = 255; // G
                maskPixels[idx + 2] = 255; // B
                maskPixels[idx + 3] = 255; // A
            }
        }
        const maskBuffer = await sharp(maskPixels, { raw: { width: W, height: H, channels: 4 } })
            .png()
            .toBuffer();
        const maskDataUrl = `data:image/png;base64,${maskBuffer.toString('base64')}`;

        console.log('\n📡 Step 3: Sending POST request to local Next.js dev server...');
        console.log(`🔗 Target URL: ${API_ENDPOINT}`);

        const startTime = Date.now();
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Optional: We can add x-forwarded-for to test rate limiting behaviors
                'x-forwarded-for': `127.0.0.1-${Date.now()}`
            },
            body: JSON.stringify({
                image_url: imgDataUrl,
                mask_url: maskDataUrl,
                veneer_style: 'hollywood'
            })
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`⏱️  Request took ${elapsed}s`);
        console.log(`📡 Response Status: ${response.status} ${response.statusText}`);

        const result = await response.json();
        console.log('\n📦 Response Body:');
        console.log(JSON.stringify(result, null, 2));

        if (result.success) {
            console.log('\n✅ Success! Next.js endpoint completed successfully.');
            if (result.data && result.data.imageUrl) {
                const base64Data = result.data.imageUrl.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                const outPath = path.join(BASE_DIR, 'public/test-local-output.webp');
                fs.writeFileSync(outPath, buffer);
                console.log(`💾 Saved output image to ${outPath}`);
            }
        } else {
            console.error('\n❌ Next.js endpoint failed with error:', result.error);
        }

    } catch (err) {
        console.error('\n❌ Test execution failed:', err.message || err);
    }
    console.log('\n==================================================');
}

main();
