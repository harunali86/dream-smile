import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';

async function calculateMaskedDifference(origPath, sweepPath) {
    // Load original and resize to 256x256
    const orig = await sharp(origPath)
        .resize(256, 256, { fit: 'fill' })
        .raw()
        .toBuffer();

    // Sweep output is already 256x256
    const sweep = await sharp(sweepPath)
        .raw()
        .toBuffer();
    
    // Mask region: x=68 to 188, y=110 to 175 in a 256x256 image
    let totalDiff = 0;
    let maskPixels = 0;

    for (let y = 110; y < 175; y++) {
        for (let x = 68; x < 188; x++) {
            const idx = (y * 256 + x) * 3; // RGB channels
            const rDiff = Math.abs(orig[idx] - sweep[idx]);
            const gDiff = Math.abs(orig[idx + 1] - sweep[idx + 1]);
            const bDiff = Math.abs(orig[idx + 2] - sweep[idx + 2]);
            
            totalDiff += (rDiff + gDiff + bDiff) / 3;
            maskPixels++;
        }
    }

    return totalDiff / maskPixels;
}

async function main() {
    console.log('==================================================');
    console.log('📊 DREAMSMILE AI: SWEEP COMPARISON ANALYSIS');
    console.log('==================================================\n');

    const origPath = path.join(BASE_DIR, 'public/demo-result.jpg');
    const scales = [30.0, 15.0, 7.0, 3.5, 1.5];

    console.log('Calculating Mean Absolute Error (MAE) inside the mask region (0-255 scale):\n');
    
    for (const scale of scales) {
        const sweepPath = path.join(BASE_DIR, `public/test-modal-sweep-${scale}.webp`);
        if (!fs.existsSync(sweepPath)) {
            console.log(`⚠️  File not found for scale ${scale}`);
            continue;
        }

        const mae = await calculateMaskedDifference(origPath, sweepPath);
        
        let visualStyle = 'Unknown';
        if (scale >= 15.0) {
            visualStyle = 'Highly Stylized / Painting (Unnatural)';
        } else if (scale >= 5.0 && scale < 15.0) {
            visualStyle = 'Balanced / Clean Veneers (Ideal Sweet Spot)';
        } else {
            visualStyle = 'Subtle Whitening / High Fidelity (Original Match)';
        }

        console.log(`👉 Guidance Scale: ${scale.toFixed(1)}`);
        console.log(`   └─ Mean Pixel Change in Mask: ${mae.toFixed(2)}`);
        console.log(`   └─ Predicted Visual Style   : ${visualStyle}`);
        console.log('--------------------------------------------------');
    }
}

main();
