import fs from 'fs';
import path from 'path';

const dumpDir = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-06-04T13-10-25-249Z';
const endpoint = 'https://harunshaikh270599--dreamsmile-flux-fluxinpaint-inpaint.modal.run';

async function test() {
  try {
    const inputPath = path.join(dumpDir, '01-modal-full-input.png');
    const maskPath = path.join(dumpDir, '03-modal-full-mask.png');
    
    if (!fs.existsSync(inputPath) || !fs.existsSync(maskPath)) {
      console.error('Missing debug files at:', dumpDir);
      return;
    }

    const imageB64 = fs.readFileSync(inputPath).toString('base64');
    const maskB64 = fs.readFileSync(maskPath).toString('base64');

    console.log('Sending request directly to Modal GPU...');
    const startTime = Date.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: imageB64,
        mask: maskB64,
        prompt: 'Photorealistic dental inpainting. Align, restore, and whiten teeth strictly within the masked region. Do not modify the shape of the mouth, lips, or surrounding face. Apply subtle, realistic veneer improvements while keeping existing expression unchanged.',
        guidance_scale: 15,
        num_inference_steps: 24,
        width: 512,
        height: 512,
        seed: 42
      })
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Modal request completed in ${elapsed}s`);
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.error('Error response:', await response.text());
      return;
    }

    const result = await response.json();
    console.log('Success:', result.success);
    if (!result.success) {
      console.error('Error details:', result.error);
    } else {
      console.log('Output image length:', result.image?.length);
      fs.writeFileSync(path.join(dumpDir, '04-test-direct-modal-output.webp'), Buffer.from(result.image, 'base64'));
      console.log('Wrote output to 04-test-direct-modal-output.webp');
    }
  } catch (err) {
    console.error('Direct fetch caught error:', err);
  }
}

test();
