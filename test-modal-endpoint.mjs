import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import dns from 'node:dns';

// Intercept DNS resolution for Modal domains to force IPv4 and prevent ETIMEDOUT errors
if (!globalThis.__dns_modal_intercepted__) {
    const originalLookup = dns.lookup;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
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
    console.log('🚀 DREAMSMILE AI: HIGH-EFFICIENCY 512x512 FLUX TEST');
    console.log('==================================================\n');

    const inputImagePath = path.join(BASE_DIR, 'public/demo-result.jpg');
    const outputImagePathWebp = path.join(BASE_DIR, 'public/flux_result_512.webp');
    const outputImagePathPng = path.join(BASE_DIR, 'public/flux_result_512.png');

    if (!fs.existsSync(inputImagePath)) {
        console.error(`❌ Input image not found at ${inputImagePath}`);
        process.exit(1);
    }

    try {
        console.log('🖼️  Step 1: Resizing & prepping input image to 512x512 (Native FLUX size)...');
        const imgBuffer = await sharp(inputImagePath)
            .resize(512, 512, { fit: 'fill' })
            .jpeg({ quality: 95 })
            .toBuffer();
        const imgB64 = imgBuffer.toString('base64');

        console.log('🎭 Step 2: Creating a 512x512 mask with scaled mouth-aligned white region...');
        // Create 512x512 black mask with scaled white mouth region (exact 2x coordinates)
        const svgMask = `
        <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
            <rect width="512" height="512" fill="black" />
            <rect x="136" y="220" width="240" height="130" fill="white" />
        </svg>
        `;
        const maskBuffer = await sharp(Buffer.from(svgMask))
            .png()
            .toBuffer();
        const maskB64 = maskBuffer.toString('base64');

        // Save the 512x512 mask so it can be inspected/rendered
        fs.writeFileSync(path.join(BASE_DIR, 'public/test-mask-512.png'), maskBuffer);
        console.log('💾 Test mask saved to public/test-mask-512.png');

        console.log('\n📡 Step 3: Triggering serverless FLUX.1 Fill GPU inference on Modal (512x512, 28 steps)...');
        console.log(`🔗 Target URL: ${ENDPOINT}`);

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
                num_inference_steps: 28, // Scaled up steps for high-fidelity convergence
                width: 512,
                height: 512,
                seed: 42
            })
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`⏱️  Request roundtrip took ${elapsed}s`);

        if (!response.ok) {
            throw new Error(`HTTP Error status ${response.status}: ${await response.text()}`);
        }

        const result = await response.json();

        if (result.success) {
            console.log('\n✅ Success! Modal returned high-fidelity base64 image data.');
            const outBuffer = Buffer.from(result.image, 'base64');
            fs.writeFileSync(outputImagePathWebp, outBuffer);
            console.log(`🎉 Inpainting output successfully saved to: ${outputImagePathWebp}`);
            
            console.log('⚡ Step 4: Converting WebP output to PNG for perfect artifact rendering...');
            await sharp(outBuffer)
                .png()
                .toFile(outputImagePathPng);
            console.log(`🎉 PNG output successfully saved to: ${outputImagePathPng}`);
            console.log(`📊 Parameters: ${result.width}x${result.height} | Seed used: ${result.seed}`);
        } else {
            console.error(`❌ Modal internal pipeline returned failure:`, result.error);
        }

    } catch (err) {
        console.error('\n❌ Execution failed:', err.message || err);
    }
    console.log('\n==================================================');
}

main();
