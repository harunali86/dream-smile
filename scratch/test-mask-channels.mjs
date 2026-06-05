import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const DUMP_DIR = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-06-01T05-06-53-150Z';

async function main() {
    console.log('==================================================');
    console.log('🧪 MASK CHANNEL INSPECTOR');
    console.log('==================================================\n');

    const maskPath = path.join(DUMP_DIR, '03-modal-roi-mask.png');
    if (!fs.existsSync(maskPath)) {
        console.error(`❌ Mask not found at ${maskPath}`);
        return;
    }

    try {
        const img = sharp(maskPath);
        const meta = await img.metadata();
        console.log(`📏 Metadata for 03-modal-roi-mask.png:`);
        console.log(`   - Format: ${meta.format}`);
        console.log(`   - Dimensions: ${meta.width}x${meta.height}`);
        console.log(`   - Channels: ${meta.channels}`);
        console.log(`   - Has alpha: ${meta.hasAlpha}`);

        const rawBuffer = await img.ensureAlpha().raw().toBuffer();
        console.log(`\nAnalyzing raw alpha channel (channel 3):`);
        let opaqueCount = 0;
        let transparentCount = 0;
        let otherCount = 0;

        for (let i = 0; i < rawBuffer.length; i += 4) {
            const r = rawBuffer[i];
            const g = rawBuffer[i+1];
            const b = rawBuffer[i+2];
            const a = rawBuffer[i+3];

            if (a === 255) opaqueCount++;
            else if (a === 0) transparentCount++;
            else otherCount++;
        }

        console.log(`   - Fully opaque (alpha=255) pixels: ${opaqueCount}`);
        console.log(`   - Fully transparent (alpha=0) pixels: ${transparentCount}`);
        console.log(`   - Partially transparent (0 < alpha < 255) pixels: ${otherCount}`);

        // Replicate binaryAlpha pipeline step:
        const binaryAlpha = await sharp(maskPath)
            .ensureAlpha()
            .extractChannel(3)
            .threshold(18)
            .raw()
            .toBuffer();

        let binaryOpaque = 0;
        let binaryTransparent = 0;
        for (let i = 0; i < binaryAlpha.length; i++) {
            if (binaryAlpha[i] === 255) binaryOpaque++;
            else if (binaryAlpha[i] === 0) binaryTransparent++;
        }
        console.log(`\nReplicated binaryAlpha step:`);
        console.log(`   - Total pixels in binaryAlpha: ${binaryAlpha.length}`);
        console.log(`   - Opaque (255) pixels: ${binaryOpaque} (${((binaryOpaque/binaryAlpha.length)*100).toFixed(2)}%)`);
        console.log(`   - Transparent (0) pixels: ${binaryTransparent} (${((binaryTransparent/binaryAlpha.length)*100).toFixed(2)}%)`);

    } catch (err) {
        console.error('❌ Error:', err.message || err);
    }
}

main();
