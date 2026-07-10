import sharp from 'sharp';
import path from 'path';

const IMG_PATH = '/home/harun/block/dreamsmile-ai/public/demo-result.jpg';

async function main() {
    const img = sharp(IMG_PATH).resize(512, 512, { fit: 'fill' });
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // Let's inspect row 235 (which is through the middle of the mouth/teeth)
    const y = 235;
    console.log(`Analyzing row ${y} across columns 136 to 376:`);
    for (let x = 136; x < 376; x += 8) {
        const idx = (y * 512 + x) * 4;
        const r = data[idx];
        const g = data[idx+1];
        const b = data[idx+2];
        console.log(`x=${x}: RGB=(${r}, ${g}, ${b})`);
    }
}

main().catch(console.error);
