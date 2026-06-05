const sharp = require('sharp');
const fs = require('fs');

const DUMP_DIR = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-06-01T05-06-53-150Z';

async function inspect(filename) {
    const filePath = `${DUMP_DIR}/${filename}`;
    if (!fs.existsSync(filePath)) {
        console.error(`File does not exist: ${filePath}`);
        return;
    }

    const img = sharp(filePath);
    const meta = await img.metadata();
    console.log(`\n=== Inspecting ${filename} ===`);
    console.log(`Dimensions: ${meta.width}x${meta.height}, channels: ${meta.channels}`);

    const stats = await img.stats();
    stats.channels.forEach((ch, idx) => {
        console.log(`Channel ${idx}: min=${ch.min}, max=${ch.max}, mean=${ch.mean.toFixed(2)}`);
    });
}

async function main() {
    await inspect('03-modal-roi-mask.png');
    await inspect('03b-modal-flat-mask.png');
}
main();
