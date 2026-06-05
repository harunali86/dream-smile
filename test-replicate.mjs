/**
 * Quick test: Call Replicate API directly to diagnose the error.
 * Run: node test-replicate.mjs
 */
import Replicate from 'replicate';
import fs from 'fs';

const token = process.env.REPLICATE_API_TOKEN || '';
console.log('Token:', token ? token.substring(0, 10) + '...' : 'none');

const replicate = new Replicate({ auth: token });

// Use a small test image (1x1 white pixel as base64)
// We just want to see if the API call works, not the quality
const testImageB64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

console.log('\n--- Testing Replicate API ---');
console.log('Model: black-forest-labs/flux-fill-dev');

try {
    const output = await replicate.run('black-forest-labs/flux-fill-dev', {
        input: {
            prompt: 'perfect white teeth, dental veneers',
            image: testImageB64,
            mask: testImageB64,
            num_inference_steps: 4,  // Low for speed
            guidance_scale: 10,
            strength: 0.8,
            output_format: 'jpg',
        },
    });

    console.log('\n--- SUCCESS ---');
    console.log('Output type:', typeof output);
    console.log('Output:', output);
    if (output && typeof output === 'object') {
        console.log('String:', String(output));
        console.log('Keys:', Object.keys(output));
    }
} catch (error) {
    console.error('\n--- FAILED ---');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error status:', error.status);
    console.error('Error response:', error.response);
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2).substring(0, 1000));
}
