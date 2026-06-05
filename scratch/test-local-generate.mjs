import fs from 'fs';
import path from 'path';

const localEndpoint = 'http://localhost:3001/api/v1/generate';
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

    console.log('Sending request to local Next.js generate API...');
    const startTime = Date.now();
    const response = await fetch(localEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: `data:image/png;base64,${imageB64}`,
        mask_url: `data:image/png;base64,${maskB64}`,
        veneer_style: 'hollywood'
      })
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Local Request completed in ${elapsed}s`);
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    const result = await response.json();
    console.log('Success:', result.success);
    console.log('Data:', result.data ? { ...result.data, imageUrl: result.data.imageUrl ? result.data.imageUrl.substring(0, 100) + '...' : null } : null);
    if (!result.success) {
      console.error('Error:', JSON.stringify(result.error || result, null, 2));
    } else {
      console.log('Output imageUrl length:', result.data?.imageUrl?.length);
    }
  } catch (err) {
    console.error('Local fetch caught error:', err);
  }
}

test();
