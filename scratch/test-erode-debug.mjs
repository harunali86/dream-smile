import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';
const DUMP_DIR = path.join(BASE_DIR, 'debug-dumps/2026-06-01T05-06-53-150Z');
const MASK_PATH = path.join(DUMP_DIR, '03-modal-roi-mask.png');

async function run() {
    const mask = fs.readFileSync(MASK_PATH);
    const meta = await sharp(mask).metadata();

    const binaryAlpha = await sharp(mask)
        .ensureAlpha()
        .extractChannel(3)
        .threshold(18)
        .raw()
        .toBuffer();

    console.log('binaryAlpha.length:', binaryAlpha.length);

    // Test 1: greyscale()
    const bufGreyscale = await sharp(binaryAlpha, {
        raw: { width: meta.width, height: meta.height, channels: 1 }
    })
        .erode(1)
        .greyscale()
        .raw()
        .toBuffer();
    console.log('Test 1 (greyscale):', bufGreyscale.length);

    // Test 2: toColourSpace('b-w')
    const bufBW = await sharp(binaryAlpha, {
        raw: { width: meta.width, height: meta.height, channels: 1 }
    })
        .erode(1)
        .toColourSpace('b-w')
        .raw()
        .toBuffer();
    console.log('Test 2 (toColourSpace b-w):', bufBW.length);

    // Test 3: extractChannel(0)
    const bufExtract = await sharp(binaryAlpha, {
        raw: { width: meta.width, height: meta.height, channels: 1 }
    })
        .erode(1)
        .extractChannel(0)
        .raw()
        .toBuffer();
    console.log('Test 3 (extractChannel 0):', bufExtract.length);
}

run().catch(console.error);
