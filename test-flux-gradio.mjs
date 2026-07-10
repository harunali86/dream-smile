import { Client } from '@gradio/client';
import fs from 'fs';

// Global Fetch Interceptor with automatic retries
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

const HF_SPACE = 'black-forest-labs/FLUX.1-Fill-dev';

// Load test image
const imagePath = '/home/harun/block/dreamsmile-ai/public/demo-result.jpg';
const imageBuffer = fs.readFileSync(imagePath);

// Create simple white mask buffer
const W = 512, H = 512;
const pixels = Buffer.alloc(W * H * 4, 0);
for (let y = 200; y < 400; y++) {
    for (let x = 100; x < 400; x++) {
        const idx = (y * W + x) * 4;
        pixels[idx] = 255;
        pixels[idx+1] = 255;
        pixels[idx+2] = 255;
        pixels[idx+3] = 255; // opaque
    }
}

// Minimal PNG helper
import zlib from 'zlib';
function createPNG(width, height, rgbaBuffer) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8;
    ihdrData[9] = 6;
    ihdrData[10] = 0;
    ihdrData[11] = 0;
    ihdrData[12] = 0;
    const ihdr = createChunk('IHDR', ihdrData);

    const rawData = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) {
        rawData[y * (width * 4 + 1)] = 0;
        rgbaBuffer.copy(rawData, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    const compressed = zlib.deflateSync(rawData);
    const idat = createChunk('IDAT', compressed);
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
const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
const maskBlob = new Blob([maskPNG], { type: 'image/png' });

async function run() {
    console.log('Connecting to', HF_SPACE);
    try {
        const connectOptions = {};
        if (process.env.HF_TOKEN) {
            console.log('Using HF_TOKEN for connection...');
            connectOptions.token = process.env.HF_TOKEN;
        }
        const client = await Client.connect(HF_SPACE, connectOptions);
        console.log('Connected. Config:', JSON.stringify(client.config).substring(0, 500));
        
        console.log('Running prediction...');
        const response = await client.predict('/infer', {
            edit_images: {
                background: imageBlob,
                layers: [maskBlob],
                composite: null
            },
            prompt: 'beautiful white veneers teeth smile, highly detailed dental work',
            seed: 0,
            randomize_seed: true,
            width: 1024,
            height: 1024,
            guidance_scale: 30,
            num_inference_steps: 28
        });

        console.log('Prediction success!');
        console.log('Response structure:', JSON.stringify(response, null, 2));
    } catch (err) {
        console.error('Connection/Execution failed:', err);
    }
}

run();
