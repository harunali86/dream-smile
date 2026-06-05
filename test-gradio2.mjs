import { Client } from '@gradio/client';
import fs from 'fs';
import sharp from 'sharp';

const imagePath = '/home/harun/.gemini/antigravity/brain/3ff4d116-6e20-4c36-a4d2-eab99735b6ca/media__1770733156023.jpg';
const imageBuffer = fs.readFileSync(imagePath);
const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
const maskPng = await sharp(imageBuffer).greyscale().threshold(128).png().toBuffer();
const maskBlob = new Blob([maskPng], { type: 'image/png' });

console.log('Connecting...');
const client = await Client.connect('diffusers/stable-diffusion-xl-inpainting');
console.log('Connected. Calling predict...');

try {
    const result = await client.predict('/predict', {
        input_image: { background: imageBlob, layers: [maskBlob], composite: null },
        prompt: 'perfect white teeth, dental veneers, photorealistic, 8k',
        negative_prompt: 'cartoon, blurry, deformed, ugly',
        guidance_scale: 10,
        steps: 20,
        strength: 0.8,
        scheduler: 'DPMSolverMultistepScheduler',
    });
    console.log('\n--- SUCCESS ---');
    console.log('Data:', JSON.stringify(result.data).substring(0, 500));
    if (Array.isArray(result.data) && result.data[0]) {
        const item = result.data[0];
        console.log('URL:', item.url || item.path || item);
    }
} catch (e) {
    console.error('FAILED:', e.message);
}
