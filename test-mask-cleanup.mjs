import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';

function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function chroma(r, g, b) {
    return Math.max(r, g, b) - Math.min(r, g, b);
}

function isLikelyLipColor(r, g, b, lum) {
    return lum > 50 && r > g + 15 && r > b + 22;
}

// Old cleanup bounds
async function oldCleanup(alphaMask, originalRaw, width, height) {
    const cleaned = Buffer.from(alphaMask);
    let lipPixelsMatched = 0;
    let cleanedCount = 0;

    for (let j = 0; j < cleaned.length; j++) {
        if (cleaned[j] < 12) continue;
        const i = j * 4;
        const r = originalRaw[i];
        const g = originalRaw[i + 1];
        const b = originalRaw[i + 2];

        const lum = luminance(r, g, b);
        const chr = chroma(r, g, b);

        // Old limits
        const lipLike = (lum > 65 && r > g + 14 && r > b + 22) && chr > 14;
        const toothLike = lum >= 56 && lum <= 230 && chr < 98;
        const cavityLike = lum < 102 && chr < 96;

        if (lipLike) {
            lipPixelsMatched++;
            if (!toothLike && !cavityLike) {
                cleaned[j] = 0;
                cleanedCount++;
            }
        }
    }
    return { buffer: cleaned, lipPixelsMatched, cleanedCount };
}

// New cleanup bounds
async function newCleanup(alphaMask, originalRaw, width, height) {
    const cleaned = Buffer.from(alphaMask);
    let lipPixelsMatched = 0;
    let cleanedCount = 0;

    for (let j = 0; j < cleaned.length; j++) {
        if (cleaned[j] < 12) continue;
        const i = j * 4;
        const r = originalRaw[i];
        const g = originalRaw[i + 1];
        const b = originalRaw[i + 2];

        const lum = luminance(r, g, b);
        const chr = chroma(r, g, b);

        // Relaxed chroma limit for lips to protect low-chroma gums (chr > 55)
        const lipLike = isLikelyLipColor(r, g, b, lum) && chr > 55;
        const toothLike = lum >= 56 && lum <= 230 && chr < 45; // Tightened
        const cavityLike = lum < 102 && chr < 40;  // Tightened

        if (lipLike) {
            lipPixelsMatched++;
            if (!toothLike && !cavityLike) {
                cleaned[j] = 0;
                cleanedCount++;
            }
        }
    }
    return { buffer: cleaned, lipPixelsMatched, cleanedCount };
}

async function runTest() {
    const imgPath = path.join(BASE_DIR, 'public/demo-result.jpg');
    const meta = await sharp(imgPath).metadata();
    const W = meta.width;
    const H = meta.height;

    console.log(`Image details: ${W}x${H}`);

    // Create a 4-channel raw buffer of image
    const originalRaw = await sharp(imgPath).ensureAlpha().raw().toBuffer();

    // Create a simple SVG mask matching the center mouth area
    const svgMask = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${W}" height="${H}" fill="black" />
        <rect x="${Math.floor(W * 0.2)}" y="${Math.floor(H * 0.4)}" width="${Math.floor(W * 0.6)}" height="${Math.floor(H * 0.35)}" fill="white" />
    </svg>
    `;

    const alphaMask = await sharp(Buffer.from(svgMask))
        .ensureAlpha()
        .extractChannel(3)
        .raw() // Fix: extract as RAW 1-channel buffer
        .toBuffer();

    const oldRes = await oldCleanup(alphaMask, originalRaw, W, H);
    const newRes = await newCleanup(alphaMask, originalRaw, W, H);

    console.log('==================================================');
    console.log('📈 MASK CLEANUP COMPARISON RESULTS');
    console.log('==================================================');
    console.log(`OLD CLEANUP:`);
    console.log(`  └─ Total pixels identified as lip-like : ${oldRes.lipPixelsMatched}`);
    console.log(`  └─ Pixels successfully cleaned (removed): ${oldRes.cleanedCount}`);
    console.log(`  └─ Success Rate (Cleaned / Lip-like)    : ${oldRes.lipPixelsMatched > 0 ? ((oldRes.cleanedCount / oldRes.lipPixelsMatched) * 100).toFixed(2) : 0}%`);
    console.log('--------------------------------------------------');
    console.log(`NEW CLEANUP:`);
    console.log(`  └─ Total pixels identified as lip-like : ${newRes.lipPixelsMatched}`);
    console.log(`  └─ Pixels successfully cleaned (removed): ${newRes.cleanedCount}`);
    console.log(`  └─ Success Rate (Cleaned / Lip-like)    : ${newRes.lipPixelsMatched > 0 ? ((newRes.cleanedCount / newRes.lipPixelsMatched) * 100).toFixed(2) : 0}%`);
    console.log('==================================================');

    // Save cleaned masks so we can inspect them
    await sharp(oldRes.buffer, { raw: { width: W, height: H, channels: 1 } })
        .png()
        .toFile(path.join(BASE_DIR, 'public/cleaned-mask-old.png'));

    await sharp(newRes.buffer, { raw: { width: W, height: H, channels: 1 } })
        .png()
        .toFile(path.join(BASE_DIR, 'public/cleaned-mask-new.png'));

    console.log('💾 Cleaned masks saved to public/cleaned-mask-old.png and public/cleaned-mask-new.png');
}

runTest().catch(console.error);
