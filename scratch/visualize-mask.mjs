import sharp from 'sharp';
import path from 'path';

const DEBUG_DIR = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-07-03T11-51-16-192Z';

async function main() {
    const maskPath = path.join(DEBUG_DIR, '03-modal-full-mask.png');
    const maskImg = sharp(maskPath);
    const maskMeta = await maskImg.metadata();

    const { data: maskRaw } = await maskImg.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const GRID_SIZE = 40;
    const stepY = Math.floor(maskMeta.height / GRID_SIZE);
    const stepX = Math.floor(maskMeta.width / GRID_SIZE);

    let grid = '';
    for (let gy = 0; gy < GRID_SIZE; gy++) {
        let row = '';
        for (let gx = 0; gx < GRID_SIZE; gx++) {
            const x = gx * stepX;
            const y = gy * stepY;
            const idx = (y * maskMeta.width + x) * 4;
            const r = maskRaw[idx];
            if (r > 128) {
                row += '█';
            } else {
                row += '.';
            }
        }
        grid += row + '\n';
    }
    console.log(grid);
}

main().catch(console.error);
