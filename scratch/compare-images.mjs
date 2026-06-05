import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';

async function compareImages() {
    console.log('==================================================');
    console.log('📊 IMAGE COMPARE TOOL: INPUT vs LOCAL vs MODAL');
    console.log('==================================================\n');

    const inputPath = path.join(BASE_DIR, 'public/demo-result.jpg');
    const localPath = path.join(BASE_DIR, 'public/test-local-output.webp');
    const modalPath = path.join(BASE_DIR, 'public/flux_result_512.webp');

    if (!fs.existsSync(inputPath)) {
        console.error(`❌ Input image missing at ${inputPath}`);
        return;
    }
    if (!fs.existsSync(localPath)) {
        console.error(`❌ Local API output image missing at ${localPath}`);
        return;
    }
    if (!fs.existsSync(modalPath)) {
        console.error(`❌ Modal direct output image missing at ${modalPath}`);
        return;
    }

    try {
        // Load raw buffers (RGBA, 512x512)
        const size = 512;
        const inputBuf = await sharp(inputPath).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
        const localBuf = await sharp(localPath).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
        const modalBuf = await sharp(modalPath).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer();

        console.log(`🖼️ Loaded all images as 512x512 RGBA buffers (length: ${inputBuf.length} bytes)\n`);

        const results = [
            { name: 'Local API Output vs Original Input', buf1: localBuf, buf2: inputBuf },
            { name: 'Modal Direct Output vs Original Input', buf1: modalBuf, buf2: inputBuf },
            { name: 'Local API Output vs Modal Direct Output', buf1: localBuf, buf2: modalBuf }
        ];

        for (const r of results) {
            let diffPixels = 0;
            let totalDiff = 0;
            const totalPixels = size * size;

            for (let i = 0; i < r.buf1.length; i += 4) {
                const rDiff = Math.abs(r.buf1[i] - r.buf2[i]);
                const gDiff = Math.abs(r.buf1[i+1] - r.buf2[i+1]);
                const bDiff = Math.abs(r.buf1[i+2] - r.buf2[i+2]);
                const aDiff = Math.abs(r.buf1[i+3] - r.buf2[i+3]);

                const maxColorDiff = Math.max(rDiff, gDiff, bDiff);
                if (maxColorDiff > 0) {
                    diffPixels++;
                    totalDiff += (rDiff*rDiff + gDiff*gDiff + bDiff*bDiff) / 3;
                }
            }

            const pctChanged = ((diffPixels / totalPixels) * 100).toFixed(2);
            const mse = (totalDiff / totalPixels).toFixed(2);
            
            console.log(`👉 Comparison: ${r.name}`);
            console.log(`   - Different pixels: ${diffPixels} / ${totalPixels} (${pctChanged}%)`);
            console.log(`   - Mean Squared Error (color channels): ${mse}`);
            if (diffPixels === 0) {
                console.log(`   - Result: ⚠️ 100% IDENTICAL PIXELS! No changes were made.`);
            } else if (mse < 2.0) {
                console.log(`   - Result: ⚠️ Extremely tiny differences (likely minor compression artifacts). Almost identical!`);
            } else {
                console.log(`   - Result: ✅ VISUALLY DISTINCT! The image was changed.`);
            }
            console.log('');
        }
    } catch (err) {
        console.error('❌ Error during comparison:', err.message || err);
    }
}

compareImages();
