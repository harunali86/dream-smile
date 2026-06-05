import { Client } from '@gradio/client';
import fs from 'fs';

// Global Fetch Interceptor with automatic retries for resilient Gradio requests
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    const maxRetries = 5;
    const delay = 2000;
    for (let i = 0; i < maxRetries; i++) {
        console.log(`[FETCH START] ${url.toString()} (Attempt ${i + 1}/${maxRetries})`);
        try {
            const res = await originalFetch(url, options);
            console.log(`[FETCH SUCCESS] ${url.toString()} -> Status: ${res.status}`);
            return res;
        } catch (err) {
            console.warn(`[FETCH FAIL] ${url.toString()} (Attempt ${i + 1}/${maxRetries}) -> Error:`, err.message || err);
            if (i === maxRetries - 1) {
                console.error(`[FETCH FATAL] All ${maxRetries} attempts failed for ${url.toString()}`);
                throw err;
            }
            await new Promise(res => setTimeout(res, delay));
        }
    }
};

async function fetchWithRetry(url, options = {}, retries = 5, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            const resp = await fetch(url, options);
            if (resp.ok) return resp;
            throw new Error(`HTTP Status ${resp.status}`);
        } catch (err) {
            console.warn(`[RETRY ${i + 1}/${retries}] Fetch failed for ${url.toString()}:`, err.message || err);
            if (i === retries - 1) throw err;
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

async function main() {
    const HF_TOKEN = process.env.HF_TOKEN || '';
    const HF_SPACE = 'black-forest-labs/FLUX.1-Fill-dev';

    // Load test image and test mask
    const imagePath = '/home/harun/block/dreamsmile-ai/public/demo-result.jpg';
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Read the mask we generated in the previous test-definitive run if it exists, or create a simple one
    let maskBuffer;
    if (fs.existsSync('./test-mask.png')) {
        maskBuffer = fs.readFileSync('./test-mask.png');
        console.log('Loaded existing test-mask.png');
    } else {
        console.error('test-mask.png not found! Run test-definitive.mjs first or generate one.');
        return;
    }

    const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
    const maskBlob = new Blob([maskBuffer], { type: 'image/png' });

    try {
        console.log(`Connecting to Space: ${HF_SPACE}...`);
        const client = await Client.connect(HF_SPACE, { token: HF_TOKEN });
        console.log("Connected. Triggering inference...");

        const result = await client.predict('/infer', {
            edit_images: {
                background: imageBlob,
                layers: [maskBlob],
                composite: null,
            },
            prompt: 'perfect beautiful straight white teeth, dental porcelain veneers, photorealistic, studio dental photography',
            seed: 42,
            randomize_seed: false,
            width: 512,
            height: 512,
            guidance_scale: 30,
            num_inference_steps: 20
        });

        console.log('\n--- RESULT ---');
        console.log(JSON.stringify(result, null, 2));

        const data = result.data;
        if (Array.isArray(data) && data[0] && data[0].url) {
            const fileUrl = data[0].url;
            console.log(`Inference successful! Downloading result from: ${fileUrl}`);
            const resp = await fetchWithRetry(fileUrl);
            const buf = Buffer.from(await resp.arrayBuffer());
            const path = './test-flux-result.webp';
            fs.writeFileSync(path, buf);
            console.log(`FLUX Fill result saved to: ${path} (${buf.length} bytes)`);
        } else {
            console.log("Unexpected format received:", JSON.stringify(result));
        }
    } catch (err) {
        console.error("FLUX Inference failed:", err);
    }
}

main();
