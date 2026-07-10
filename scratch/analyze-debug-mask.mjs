import sharp from 'sharp';
import path from 'path';

const DEBUG_DIR = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-07-03T11-51-16-192Z';

async function main() {
    const maskPath = path.join(DEBUG_DIR, '03-modal-full-mask.png');
    const img = sharp(maskPath);
    const meta = await img.metadata();
    const w = meta.width;
    const h = meta.height;

    const { data } = await img.greyscale().raw().toBuffer({ resolveWithObject: true });

    let whiteCount = 0;
    let blackCount = 0;
    let otherCount = 0;

    // We can also print a rough ASCII map of the mask to see where the white pixels are.
    const gridW = 40;
    const gridH = 40;
    const ascii = [];

    for (let gy = 0; gy < gridH; gy++) {
        let row = '';
        for (let gx = 0; gx < gridW; gx++) {
            const x = Math.floor((gx / gridW) * w);
            const y = Math.floor((gy / gridH) * h);
            const val = data[y * w + x];
            if (val > 128) {
                row += '█';
            } else {
                row += '.';
            }
        }
        ascii.push(row);
    }

    for (let i = 0; i < data.length; i++) {
        if (data[i] > 128) whiteCount++;
        else blackCount++;
    }

    console.log(`Mask dimensions: ${w}x${h}`);
    console.log(`Total pixels: ${w * h}`);
    console.log(`White pixels (to edit): ${whiteCount} (${((whiteCount / (w * h)) * 100).toFixed(2)}%)`);
    console.log(`Black pixels (to keep): ${blackCount} (${((blackCount / (w * h)) * 100).toFixed(2)}%)`);
    console.log('\nASCII visualization of the mask:');
    console.log(ascii.join('\n'));
}

main().catch(console.error);
