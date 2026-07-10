import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const artifactsDir = '/home/harun/.gemini/antigravity/brain/99d6af72-1fb8-4c07-b586-f5ba0d6acf54/artifacts';

async function compositeInpaintedResult(
    originalImageBuf,
    generatedBuf,
    flatMaskBuf,
    w,
    h
) {
    const alphaMaskBuf = await sharp(flatMaskBuf)
        .greyscale()
        .resize(w, h, { fit: 'fill' })
        .blur(3)
        .extractChannel(0)
        .raw()
        .toBuffer();

    const upscaledGeneratedBuf = await sharp(generatedBuf)
        .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
        .ensureAlpha()
        .raw()
        .toBuffer();

    const rgbaBuffer = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        rgbaBuffer[i * 4] = upscaledGeneratedBuf[i * 4];
        rgbaBuffer[i * 4 + 1] = upscaledGeneratedBuf[i * 4 + 1];
        rgbaBuffer[i * 4 + 2] = upscaledGeneratedBuf[i * 4 + 2];
        rgbaBuffer[i * 4 + 3] = alphaMaskBuf[i];
    }

    const maskedGeneratedImg = await sharp(rgbaBuffer, {
        raw: { width: w, height: h, channels: 4 }
    })
    .png()
    .toBuffer();

    return await sharp(originalImageBuf)
        .composite([{ input: maskedGeneratedImg, blend: 'over' }])
        .webp({ quality: 95 })
        .toBuffer();
}

async function run() {
    try {
        const originalImageBuf = await fs.readFile(path.join(artifactsDir, '01-modal-full-input.png'));
        const generatedBuf = await fs.readFile(path.join(artifactsDir, '04-flux-modal-output.webp'));
        const flatMaskBuf = await fs.readFile(path.join(artifactsDir, '03-modal-full-mask.png'));

        const meta = await sharp(originalImageBuf).metadata();
        const w = meta.width;
        const h = meta.height;

        console.log(`Original image: ${w}x${h}`);

        const resultBuf = await compositeInpaintedResult(
            originalImageBuf,
            generatedBuf,
            flatMaskBuf,
            w,
            h
        );

        const outPath = path.join(artifactsDir, 'test-composited-feathered.webp');
        await fs.writeFile(outPath, resultBuf);
        console.log(`Successfully generated blended output at: ${outPath}`);
    } catch (err) {
        console.error('Error running test-blend:', err);
    }
}

run();
