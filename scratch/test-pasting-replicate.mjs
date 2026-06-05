import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';
const ORIGINAL_FACE_PATH = path.join(BASE_DIR, 'public/demo-result.jpg');
const DUMP_DIR = path.join(BASE_DIR, 'debug-dumps/2026-06-01T05-06-53-150Z');
const ROI_OUTPUT_PATH = path.join(DUMP_DIR, '04-flux-roi-output.webp');

// Helper to parse data url
function parseDataUrl(dataUrl) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid data URL');
    return {
        mime: match[1],
        buffer: Buffer.from(match[2], 'base64'),
    };
}

function toDataUrl(mime, buffer) {
    return `data:${mime};base64,${buffer.toString('base64')}`;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

// Replicate sanitizeMask from lib/gradioAdapter.ts
async function sanitizeMask(maskDataUrl, width, height) {
    const raw = parseDataUrl(maskDataUrl).buffer;
    const alpha = await sharp(raw)
        .ensureAlpha()
        .resize(width, height)
        .extractChannel(3)
        .raw()
        .toBuffer();

    let alphaMin = 255, alphaMax = 0;
    for (let i = 0; i < alpha.length; i++) {
        if (alpha[i] < alphaMin) alphaMin = alpha[i];
        if (alpha[i] > alphaMax) alphaMax = alpha[i];
    }
    const alphaRange = alphaMax - alphaMin;

    let maskChannel;
    if (alphaRange < 30) {
        maskChannel = await sharp(raw)
            .resize(width, height)
            .greyscale()
            .threshold(128)
            .extractChannel(0)
            .raw()
            .toBuffer();
    } else {
        maskChannel = await sharp(Buffer.from(alpha), { raw: { width, height, channels: 1 } })
            .threshold(18)
            .greyscale()
            .extractChannel(0)
            .raw()
            .toBuffer();
    }

    const maskRaw = Buffer.alloc(width * height * 4, 0);
    for (let i = 0, j = 0; i < maskRaw.length; i += 4, j += 1) {
        const a = maskChannel[j] > 0 ? 255 : 0;
        maskRaw[i] = 255;
        maskRaw[i + 1] = 255;
        maskRaw[i + 2] = 255;
        maskRaw[i + 3] = a;
    }

    return sharp(maskRaw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function getMaskBounds(maskPng, width, height) {
    const raw = await sharp(maskPng).ensureAlpha().extractChannel(3).raw().toBuffer();
    let minX = width, maxX = 0, minY = height, maxY = 0;
    let found = false;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (raw[y * width + x] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
    }
    return found ? { minX, maxX, minY, maxY } : null;
}

// Replicate cropToMouthRoi
async function cropToMouthRoi(imageDataUrl, maskDataUrl) {
    const image = parseDataUrl(imageDataUrl).buffer;
    const img = sharp(image).ensureAlpha();
    const meta = await img.metadata();
    const width = meta.width;
    const height = meta.height;

    const maskPng = await sanitizeMask(maskDataUrl, width, height);
    const bounds = await getMaskBounds(maskPng, width, height);
    if (!bounds) throw new Error('Empty mask bounds');

    const bw = bounds.maxX - bounds.minX + 1;
    const bh = bounds.maxY - bounds.minY + 1;
    const maskCx = (bounds.minX + bounds.maxX) / 2;
    let maskCy = (bounds.minY + bounds.maxY) / 2;

    const padXFactor = 0.72; // reconstruct mode
    const padYFactor = 0.88;
    const minRoiWidth = Math.max(96, Math.round(width * 0.34));
    const minRoiHeight = Math.max(96, Math.round(minRoiWidth * 0.62));
    const targetRoiWidth = Math.max(bw + Math.round(bw * padXFactor * 2), minRoiWidth);
    const targetRoiHeight = Math.max(bh + Math.round(bh * padYFactor * 2), minRoiHeight, Math.round(targetRoiWidth * 0.56));

    const roiWidthTarget = Math.min(width, targetRoiWidth);
    const roiHeightTarget = Math.min(height, targetRoiHeight);

    const left = clamp(Math.round(maskCx - roiWidthTarget / 2), 0, width - roiWidthTarget);
    const top = clamp(Math.round(maskCy - roiHeightTarget / 2), 0, height - roiHeightTarget);
    const right = left + roiWidthTarget - 1;
    const bottom = top + roiHeightTarget - 1;

    const roiWidth = right - left + 1;
    const roiHeight = bottom - top + 1;

    const baseImageCrop = await img.extract({ left, top, width: roiWidth, height: roiHeight }).png().toBuffer();
    const baseMaskCropRaw = await sharp(maskPng).extract({ left, top, width: roiWidth, height: roiHeight }).png().toBuffer();

    const targetLongSide = 896;
    const currentLongSide = Math.max(roiWidth, roiHeight);
    const scale = Math.min(2.6, Math.max(1, targetLongSide / currentLongSide));
    const requestWidth = Math.max(64, Math.round((roiWidth * scale) / 8) * 8);
    const requestHeight = Math.max(64, Math.round((roiHeight * scale) / 8) * 8);

    const originalMaskCrop = await sharp(baseMaskCropRaw)
        .resize(requestWidth, requestHeight, { fit: 'fill', kernel: 'nearest' })
        .threshold(18)
        .png()
        .toBuffer();

    return {
        originalMaskDataUrl: toDataUrl('image/png', originalMaskCrop),
        meta: { left, top, width: roiWidth, height: roiHeight, requestWidth, requestHeight }
    };
}

async function run() {
    console.log('1. Loading input image and creating mask...');
    const inputBuf = await sharp(ORIGINAL_FACE_PATH).resize(512, 512, { fit: 'fill' }).jpeg().toBuffer();
    const imgDataUrl = toDataUrl('image/jpeg', inputBuf);

    // Create same 512x512 rectangular mask
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
    const maskBuffer = await sharp(maskPixels, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    const maskDataUrl = toDataUrl('image/png', maskBuffer);

    console.log('2. Running cropToMouthRoi...');
    const roiInput = await cropToMouthRoi(imgDataUrl, maskDataUrl);
    console.log(`   - Crop Meta: left=${roiInput.meta.left}, top=${roiInput.meta.top}, width=${roiInput.meta.width}, height=${roiInput.meta.height}`);
    console.log(`   - Scale Dimensions: requestWidth=${roiInput.meta.requestWidth}, requestHeight=${roiInput.meta.requestHeight}`);

    // Replicate pasteMaskedRoiBack step-by-step
    console.log('\n3. Replicating pasteMaskedRoiBack...');
    const cropMeta = roiInput.meta;
    const roi = fs.readFileSync(ROI_OUTPUT_PATH); // output is 896x624
    const mask = parseDataUrl(roiInput.originalMaskDataUrl).buffer;

    const maskMeta = await sharp(mask).metadata();
    console.log(`   - originalMaskDataUrl Metadata: channels=${maskMeta.channels}, format=${maskMeta.format}, hasAlpha=${maskMeta.hasAlpha}`);

    const resizedRoi = await sharp(roi)
        .ensureAlpha()
        .resize(cropMeta.width, cropMeta.height, { fit: 'fill', kernel: 'lanczos3' })
        .png()
        .toBuffer();

    console.log('   - Resizing mask to crop size and extracting alpha channel...');
    const binaryAlpha = await sharp(mask)
        .ensureAlpha()
        .resize(cropMeta.width, cropMeta.height, { fit: 'fill', kernel: 'nearest' })
        .extractChannel(3)
        .threshold(18)
        .raw()
        .toBuffer();

    // Print stats of binaryAlpha
    let countOpaque = 0, countTransparent = 0;
    for (let i = 0; i < binaryAlpha.length; i++) {
        if (binaryAlpha[i] === 255) countOpaque++;
        else if (binaryAlpha[i] === 0) countTransparent++;
    }
    console.log(`   - binaryAlpha stats: opaque=${countOpaque}, transparent=${countTransparent}, total=${binaryAlpha.length}`);

    // Applying guards
    const guardY = Math.max(6, Math.round(cropMeta.height * 0.035));
    const guardX = Math.max(4, Math.round(cropMeta.width * 0.012));
    for (let y = 0; y < cropMeta.height; y++) {
        for (let x = 0; x < cropMeta.width; x++) {
            if (y < guardY || y >= cropMeta.height - guardY || x < guardX || x >= cropMeta.width - guardX) {
                binaryAlpha[y * cropMeta.width + x] = 0;
            }
        }
    }

    // Feathering
    const featherAlpha = await sharp(binaryAlpha, {
        raw: { width: cropMeta.width, height: cropMeta.height, channels: 1 },
    })
        .erode(1)
        .blur(1.2)
        .greyscale()
        .raw()
        .toBuffer();

    for (let i = 0; i < featherAlpha.length; i++) {
        featherAlpha[i] = Math.min(featherAlpha[i], binaryAlpha[i]);
    }

    let countFeatherActive = 0, sumFeather = 0;
    for (let i = 0; i < featherAlpha.length; i++) {
        if (featherAlpha[i] > 0) countFeatherActive++;
        sumFeather += featherAlpha[i];
    }
    console.log(`   - featherAlpha stats: active pixels (val>0)=${countFeatherActive}, average alpha=${(sumFeather / featherAlpha.length).toFixed(2)}`);

    const roiRaw = await sharp(resizedRoi).removeAlpha().raw().toBuffer();
    const maskedRaw = Buffer.alloc(cropMeta.width * cropMeta.height * 4);
    for (let p = 0, rgb = 0, rgba = 0; p < featherAlpha.length; p++, rgb += 3, rgba += 4) {
        maskedRaw[rgba] = roiRaw[rgb];
        maskedRaw[rgba + 1] = roiRaw[rgb + 1];
        maskedRaw[rgba + 2] = roiRaw[rgb + 2];
        maskedRaw[rgba + 3] = featherAlpha[p];
    }

    let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
    for (let i = 0; i < maskedRaw.length; i += 4) {
        sumR += maskedRaw[i];
        sumG += maskedRaw[i+1];
        sumB += maskedRaw[i+2];
        sumA += maskedRaw[i+3];
    }
    const totalPixels = cropMeta.width * cropMeta.height;
    console.log(`   - maskedRaw average: R=${(sumR/totalPixels).toFixed(1)}, G=${(sumG/totalPixels).toFixed(1)}, B=${(sumB/totalPixels).toFixed(1)}, A=${(sumA/totalPixels).toFixed(1)}`);
}

run().catch(console.error);
