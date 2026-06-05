import fs from 'fs';
import path from 'path';

const endpoint = 'https://harunshaikh270599--dreamsmile-flux-fluxinpaint-inpaint.modal.run';
const dumpDir = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-06-04T12-13-59-341Z';

async function test() {
  try {
    const inputPath = path.join(dumpDir, '01-modal-full-input.png');
    const maskPath = path.join(dumpDir, '03-modal-full-mask.png');
    
    if (!fs.existsSync(inputPath) || !fs.existsSync(maskPath)) {
      console.error('Missing debug files.');
      return;
    }

    const imageB64 = fs.readFileSync(inputPath).toString('base64');
    const maskB64 = fs.readFileSync(maskPath).toString('base64');

    console.log('Sending request to Modal GPU endpoint...');
    const startTime = Date.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: imageB64,
        mask: maskB64,
        prompt: 'Photorealistic dental inpainting.',
        guidance_scale: 20,
        num_inference_steps: 20,
        width: 512,
        height: 512,
        seed: 42
      })
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Request completed in ${elapsed}s`);
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    const result = await response.json();
    console.log('Success:', result.success);
    if (!result.success) {
      console.error('Error:', result.error);
    } else {
      console.log('Image length:', result.image?.length);
    }
  } catch (err) {
    console.error('Fetch caught error:', err);
  }
}

test();
