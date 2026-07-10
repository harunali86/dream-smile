import sharp from 'sharp';
import path from 'path';

const DEBUG_DIR = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-07-03T11-51-16-192Z';

function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function chroma(r, g, b) {
    const rY = 0.299 * r + 0.587 * g + 0.114 * b;
    const cr = (r - rY) * 0.713;
    const cb = (b - rY) * 0.564;
    return Math.sqrt(cr * cr + cb * cb);
}

async function main() {
    const inputPath = path.join(DEBUG_DIR, '01-modal-full-input.png');
    const inputImg = sharp(inputPath);
    const meta = await inputImg.metadata();

    const { data: raw } = await inputImg.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const GRID_SIZE = 40;
    const stepY = Math.floor(meta.height / GRID_SIZE);
    const stepX = Math.floor(meta.width / GRID_SIZE);

    let grid = '';
    for (let gy = 0; gy < GRID_SIZE; gy++) {
        let row = '';
        for (let gx = 0; gx < GRID_SIZE; gx++) {
            const x = gx * stepX;
            const y = gy * stepY;
            const idx = (y * meta.width + x) * 4;
            const r = raw[idx];
            const g = raw[idx+1];
            const b = raw[idx+2];

            const isReddish = r > g + 14 && r > b + 14 && (g / (r + 0.001) < 0.75);
            const lum = luminance(r, g, b);
            const chr = chroma(r, g, b);
            const toothLike = lum > 50 && (g / (r + 0.001) >= 0.72) && chr < 80;
            const cavityLike = lum < 102 && chr < 45 && !isReddish;

            // Display code:
            // T = toothLike
            // R = reddish
            // C = cavityLike
            // . = other
            let char = '.';
            if (isReddish) char = 'R';
            else if (toothLike) char = 'T';
            else if (cavityLike) char = 'C';
            
            row += char;
        }
        grid += row + '\n';
    }
    console.log(grid);
}

main().catch(console.error);
