/**
 * DEFINITIVE test: Create RGBA mask without node-canvas dependency.
 * Uses sharp (if available) or creates mask from raw RGBA buffer.
 * 
 * From the Space's app.py:
 *   mask = input_image["layers"][0].getchannel("A").convert("L")
 * The Space uses ALPHA CHANNEL of layer as mask.
 */
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

// Robust fetch helper with automatic retries for flaky networks
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



const HF_SPACE = 'diffusers/stable-diffusion-xl-inpainting';

// Load test image
const imagePath = '/home/harun/block/dreamsmile-ai/public/demo-result.jpg';
const imageBuffer = fs.readFileSync(imagePath);

// Create a simple 512x512 RGBA PNG mask manually
// We'll create a minimal PNG with bottom-half white+opaque, top-half transparent
// Using sharp would be cleaner but let's use the simplest approach

// Approach: Create a clean mask as RGBA data, then build PNG
const W = 512, H = 512;
const pixels = Buffer.alloc(W * H * 4, 0); // All transparent initially (RGBA = 0,0,0,0)

// Fill bottom 40% with opaque white (dental/mouth area)
const startY = Math.floor(H * 0.55);
const endY = Math.floor(H * 0.95);
const startX = Math.floor(W * 0.15);
const endX = Math.floor(W * 0.85);

for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
        const idx = (y * W + x) * 4;
        pixels[idx] = 255;     // R
        pixels[idx + 1] = 255; // G
        pixels[idx + 2] = 255; // B
        pixels[idx + 3] = 255; // A = opaque
    }
}

// Create PNG using zlib
import zlib from 'zlib';

function createPNG(width, height, rgbaBuffer) {
    // PNG signature
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8;  // bit depth
    ihdrData[9] = 6;  // color type: RGBA
    ihdrData[10] = 0; // compression
    ihdrData[11] = 0; // filter
    ihdrData[12] = 0; // interlace
    const ihdr = createChunk('IHDR', ihdrData);

    // IDAT chunk (image data)
    // Add filter byte (0 = None) at the start of each row
    const rawData = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) {
        rawData[y * (width * 4 + 1)] = 0; // filter byte
        rgbaBuffer.copy(rawData, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    const compressed = zlib.deflateSync(rawData);
    const idat = createChunk('IDAT', compressed);

    // IEND chunk
    const iend = createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) {
        crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

const maskPNG = createPNG(W, H, pixels);
fs.writeFileSync('./test-mask.png', maskPNG);
console.log('Mask PNG created:', maskPNG.length, 'bytes, saved to ./test-mask.png');

// Create blobs
const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
const maskBlob = new Blob([maskPNG], { type: 'image/png' });

console.log('Connecting to', HF_SPACE);
let client;
try {
    for (let i = 0; i < 3; i++) {
        try {
            const connectOptions = {};
            if (process.env.HF_TOKEN) {
                console.log('Using HF_TOKEN for connection...');
                connectOptions.token = process.env.HF_TOKEN;
            }
            client = await Client.connect(HF_SPACE, connectOptions);
            break;
        } catch (err) {
            console.warn(`[CONNECT RETRY ${i + 1}/3] failed:`, err.message || err);
            if (i === 2) throw err;
            await new Promise(r => setTimeout(r, 3000));
        }
    }
    console.log('Connected. Calling predict...');

    const result = await client.predict('/predict', {
        input_image: {
            background: imageBlob,
            layers: [maskBlob],
            composite: null,
        },
        prompt: 'perfect beautiful straight white teeth, dental porcelain veneers, photorealistic, studio dental photography',
        negative_prompt: 'ugly, deformed, blurry, broken teeth, missing teeth, yellow teeth, damaged',
        guidance_scale: 15,
        steps: 30,
        strength: 0.99,
        scheduler: 'EulerDiscreteScheduler',
    });

    console.log('\n--- RESULT ---');
    const data = result.data;

    // The Space returns [init_image, output_image]
    // From app.py: return init_image, output.images[0]
    let items = data;
    if (Array.isArray(data) && data.length === 1 && Array.isArray(data[0])) {
        items = data[0];
    }

    if (Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item && item.url) {
                const resp = await fetchWithRetry(item.url);
                const buf = Buffer.from(await resp.arrayBuffer());
                const path = `./test-result-${i}.webp`;
                fs.writeFileSync(path, buf);
                console.log(`Result ${i} saved: ${path} (${buf.length} bytes)`);
            }
        }
    } else {
        console.log('Unexpected format:', JSON.stringify(data).substring(0, 500));
    }
} catch (e) {
    console.error('FAILED:', e);
}

