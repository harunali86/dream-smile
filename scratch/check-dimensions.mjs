import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const DUMP_DIR = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-06-01T05-06-53-150Z';

async function main() {
    const files = fs.readdirSync(DUMP_DIR);
    for (const file of files) {
        if (file.endsWith('.png') || file.endsWith('.webp') || file.endsWith('.jpg')) {
            const filePath = path.join(DUMP_DIR, file);
            const meta = await sharp(filePath).metadata();
            console.log(`File: ${file} | Width: ${meta.width} | Height: ${meta.height} | Format: ${meta.format} | Channels: ${meta.channels}`);
        }
    }
}
main();
