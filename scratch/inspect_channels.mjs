import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const DEBUG_DIR = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-07-03T11-51-16-192Z';

async function main() {
    let flatMaskBuf;
    const maskPath = path.join(DEBUG_DIR, '03-modal-full-mask.png');
    if (fs.existsSync(maskPath)) {
        flatMaskBuf = fs.readFileSync(maskPath);
        console.log('Using real mask from debug dump.');
    } else {
        console.log('Debug dump not found, using dummy mask buffer.');
        const mockPixels = Buffer.alloc(512 * 512 * 4, 0);
        for (let i = 0; i < mockPixels.length; i += 4) {
            mockPixels[i] = 255;
            mockPixels[i+1] = 255;
            mockPixels[i+2] = 255;
            mockPixels[i+3] = 255;
        }
        flatMaskBuf = await sharp(mockPixels, { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer();
    }

    const w = 512;
    const h = 512;

    // Step 1: Erode the mask (ensuring 1-channel using extractChannel)
    const erodedMaskBuf = await sharp(flatMaskBuf)
        .greyscale()
        .resize(w, h, { fit: 'fill' })
        .threshold(200)
        .extractChannel(0)
        .raw()
        .toBuffer();

    console.log('erodedMaskBuf length:', erodedMaskBuf.length, 'Expected for 1 channel:', w * h);

    // Step 2: Manual 2px erosion
    const eroded = Buffer.alloc(w * h);
    const erosionRadius = 2;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let allWhite = true;
            for (let dy = -erosionRadius; dy <= erosionRadius && allWhite; dy++) {
                for (let dx = -erosionRadius; dx <= erosionRadius && allWhite; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
                        allWhite = false;
                    } else {
                        const index = ny * w + nx;
                        if (index >= erodedMaskBuf.length) {
                            allWhite = false;
                        } else if (erodedMaskBuf[index] < 128) {
                            allWhite = false;
                        }
                    }
                }
            }
            eroded[y * w + x] = allWhite ? 255 : 0;
        }
    }

    // Step 3: Apply stronger Gaussian blur (ensuring 1-channel using extractChannel)
    const alphaMaskBuf = await sharp(eroded, { raw: { width: w, height: h, channels: 1 } })
        .blur(6)
        .extractChannel(0)
        .raw()
        .toBuffer();

    console.log('alphaMaskBuf length:', alphaMaskBuf.length, 'Expected for 1 channel:', w * h);
}

main().catch(console.error);
