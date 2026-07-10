import sharp from 'sharp';
import path from 'path';

const DEBUG_DIR = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-07-03T11-51-16-192Z';

async function getDiff(img1Path, img2Path) {
    const img1 = sharp(img1Path);
    const img2 = sharp(img2Path);

    const m1 = await img1.metadata();
    const m2 = await img2.metadata();

    const w = m1.width;
    const h = m1.height;

    const { data: d1 } = await img1.resize(w, h).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data: d2 } = await img2.resize(w, h).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    let diffPixels = 0;
    let maxDiff = 0;
    let totalDiff = 0;

    for (let i = 0; i < d1.length; i += 4) {
        const dr = Math.abs(d1[i] - d2[i]);
        const dg = Math.abs(d1[i+1] - d2[i+1]);
        const db = Math.abs(d1[i+2] - d2[i+2]);
        const pixelDiff = dr + dg + db;

        if (pixelDiff > 0) {
            diffPixels++;
            if (pixelDiff > maxDiff) maxDiff = pixelDiff;
            totalDiff += pixelDiff;
        }
    }

    return {
        diffPixels,
        pct: (diffPixels / (w * h)) * 100,
        maxDiff,
        avgDiff: diffPixels > 0 ? totalDiff / (diffPixels * 3) : 0
    };
}

async function main() {
    const input = path.join(DEBUG_DIR, '01-modal-full-input.png');
    const output = path.join(DEBUG_DIR, '04-flux-modal-output.webp');
    const composite = path.join(DEBUG_DIR, '05-final-composite.webp');

    console.log('Calculating differences...');
    
    const diffModel = await getDiff(input, output);
    console.log('\nDifference between [01-input] and [04-model-output]:');
    console.log(`- Changed pixels: ${diffModel.diffPixels} (${diffModel.pct.toFixed(2)}%)`);
    console.log(`- Max pixel channel difference: ${diffModel.maxDiff}`);
    console.log(`- Average channel diff in changed pixels: ${diffModel.avgDiff.toFixed(2)}`);

    const diffComposite = await getDiff(input, composite);
    console.log('\nDifference between [01-input] and [05-final-composite]:');
    console.log(`- Changed pixels: ${diffComposite.diffPixels} (${diffComposite.pct.toFixed(2)}%)`);
    console.log(`- Max pixel channel difference: ${diffComposite.maxDiff}`);
    console.log(`- Average channel diff in changed pixels: ${diffComposite.avgDiff.toFixed(2)}`);
}

main().catch(console.error);
