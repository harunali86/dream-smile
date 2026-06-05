import sharp from 'sharp';

function parseDataUrl(dataUrl) {
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error('Invalid data URI');
    }
    return {
        mimeType: matches[1],
        buffer: Buffer.from(matches[2], 'base64'),
    };
}

async function sanitizeMask(maskDataUrl, width, height) {
    const raw = parseDataUrl(maskDataUrl).buffer;

    const alpha = await sharp(raw)
        .ensureAlpha()
        .resize(width, height)
        .extractChannel(3)
        .raw()
        .toBuffer();

    let alphaMin = 255;
    let alphaMax = 0;
    const sampleSize = Math.min(alpha.length, 20000);
    const step = Math.max(1, Math.floor(alpha.length / sampleSize));
    for (let i = 0; i < alpha.length; i += step) {
        if (alpha[i] < alphaMin) alphaMin = alpha[i];
        if (alpha[i] > alphaMax) alphaMax = alpha[i];
    }
    const alphaRange = alphaMax - alphaMin;

    console.log(`[debug] alphaMin=${alphaMin}, alphaMax=${alphaMax}, alphaRange=${alphaRange}`);

    let maskChannel;
    if (alphaRange < 30) {
        console.log('[debug] Uniform alpha range, using grayscale fallback');
        maskChannel = await sharp(raw)
            .resize(width, height)
            .greyscale()
            .extractChannel(0)
            .threshold(128)
            .raw()
            .toBuffer();
    } else {
        console.log('[debug] Non-uniform alpha range, using alpha channel directly');
        maskChannel = await sharp(Buffer.from(alpha), { raw: { width, height, channels: 1 } })
            .threshold(18)
            .raw()
            .toBuffer();
    }

    let covered = 0;
    for (let j = 0; j < maskChannel.length; j++) {
        if (maskChannel[j] > 0) covered += 1;
    }
    console.log(`[debug] covered pixels = ${covered} out of ${width * height} (${((covered / (width * height)) * 100).toFixed(2)}%)`);
}

async function main() {
    const W = 512, H = 512;
    const maskPixels = Buffer.alloc(W * H * 4, 0);
    for (let y = 220; y < 350; y++) {
        for (let x = 136; x < 376; x++) {
            const idx = (y * W + x) * 4;
            maskPixels[idx]     = 255;
            maskPixels[idx + 1] = 255;
            maskPixels[idx + 2] = 255;
            maskPixels[idx + 3] = 255;
        }
    }
    const maskBuffer = await sharp(maskPixels, { raw: { width: W, height: H, channels: 4 } })
        .png()
        .toBuffer();
    const maskDataUrl = `data:image/png;base64,${maskBuffer.toString('base64')}`;

    await sanitizeMask(maskDataUrl, W, H);
}

main().catch(console.error);
