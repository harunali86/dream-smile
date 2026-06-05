import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import dns from 'node:dns';

// Intercept DNS resolution for Modal domains to force IPv4
if (!globalThis.__dns_modal_intercepted__) {
    const originalLookup = dns.lookup;
    // @ts-ignore
    dns.lookup = function(hostname, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        if (hostname && typeof hostname === 'string' && hostname.endsWith('.modal.run')) {
            if (typeof options === 'number') {
                options = { family: 4 };
            } else if (options) {
                options.family = 4;
            } else {
                options = { family: 4 };
            }
        }
        return originalLookup.call(dns, hostname, options, callback);
    };
    globalThis.__dns_modal_intercepted__ = true;
}

const ENDPOINT = 'https://harunshaikh270599--dreamsmile-flux-fluxinpaint-inpaint.modal.run';
const BASE_DIR = '/home/harun/block/dreamsmile-ai';

async function main() {
    console.log('==================================================');
    console.log('🧪 RUNNING EXPERIMENT: DIRECT IMAGE INPAINTING (NO MASK)');
    console.log('==================================================\n');

    const inputImagePath = path.join(BASE_DIR, 'public/demo-result.jpg');
    const outputWebp = path.join(BASE_DIR, 'public/test-no-mask-result.webp');
    const outputPng = path.join(BASE_DIR, 'public/test-no-mask-result.png');

    try {
        console.log('🖼️  Step 1: Preparing 512x512 image...');
        const imgBuffer = await sharp(inputImagePath)
            .resize(512, 512, { fit: 'fill' })
            .jpeg({ quality: 95 })
            .toBuffer();
        const imgB64 = imgBuffer.toString('base64');

        console.log('🎭 Step 2: Creating a 100% white mask (all pixels selected for editing)...');
        const svgMask = `
        <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
            <rect width="512" height="512" fill="white" />
        </svg>
        `;
        const maskBuffer = await sharp(Buffer.from(svgMask))
            .png()
            .toBuffer();
        const maskB64 = maskBuffer.toString('base64');

        console.log('📡 Step 3: Triggering serverless FLUX.1 Fill GPU inference...');
        const startTime = Date.now();
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: imgB64,
                mask: maskB64,
                prompt: 'perfect natural bright smiling white teeth, porcelain veneers, photorealistic dental aesthetics',
                guidance_scale: 30.0,
                num_inference_steps: 28,
                width: 512,
                height: 512,
                seed: 42
            })
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`⏱️  Request took ${elapsed}s`);

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} - ${await response.text()}`);
        }

        const result = await response.json();
        if (result.success) {
            console.log('💾 Saving outputs...');
            const outBuffer = Buffer.from(result.image, 'base64');
            fs.writeFileSync(outputWebp, outBuffer);
            await sharp(outBuffer).png().toFile(outputPng);
            console.log(`🎉 WebP saved to: ${outputWebp}`);
            console.log(`🎉 PNG saved to: ${outputPng}`);
        } else {
            console.error('❌ Modal pipeline error:', result.error);
        }
    } catch (err) {
        console.error('❌ Failed:', err.message || err);
    }
}

main();
