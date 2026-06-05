/**
 * End-to-end test with correct parameter names.
 */
import { Client } from '@gradio/client';
import fs from 'fs';
import sharp from 'sharp';

const HF_SPACE = 'diffusers/stable-diffusion-xl-inpainting';
const imagePath = '/home/harun/.gemini/antigravity/brain/3ff4d116-6e20-4c36-a4d2-eab99735b6ca/media__1770733156023.jpg';
const imageBuffer = fs.readFileSync(imagePath);
const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
const maskPng = await sharp(imageBuffer).greyscale().threshold(128).png().toBuffer();
const maskBlob = new Blob([maskPng], { type: 'image/png' });

console.log('Image:', imageBuffer.length, 'bytes');
console.log('Connecting to:', HF_SPACE);

try {
    const client = await Client.connect(HF_SPACE);
    console.log('Connected. Calling predict...');

    const result = await client.predict('/predict', {
        input_image: {
            background: imageBlob,
            layers: [maskBlob],
            composite: null,
        },
        prompt: 'perfect white teeth, dental veneers, photorealistic, 8k',
        negative_prompt: 'cartoon, blurry, deformed, ugly',
        guidance_scale: 10,
        steps: 20,
        strength: 0.8,
        scheduler: 'DPMSolverMultistep',
    });

    console.log('\n--- SUCCESS ---');
    console.log('Data:', JSON.stringify(result.data).substring(0, 500));

    if (Array.isArray(result.data)) {
        const item = result.data[0];
        if (item && typeof item === 'object') {
            console.log('Keys:', Object.keys(item));
            console.log('URL:', item.url);
        }
    }
} catch (error) {
    console.error('\n--- FAILED ---');
    console.error('Error:', error.message);
}
