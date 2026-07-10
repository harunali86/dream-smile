import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Parse data URL helper
function parseDataUrl(dataUrl) {
    const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (!matches) {
        throw new Error('Invalid data URL');
    }
    return {
        mime: matches[1],
        buffer: Buffer.from(matches[2], 'base64')
    };
}

function toDataUrl(mime, buffer) {
    return `data:${mime};base64,${buffer.toString('base64')}`;
}

function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function chroma(r, g, b) {
    const rY = 0.299 * r + 0.587 * g + 0.114 * b;
    const cr = (r - rY) * 0.713;
    const cb = (b - rY) * 0.564;
    return Math.sqrt(cr * cr + cb * cb);
}

// Replicate sanitization and logic from lib/gradioAdapter.ts
async function sanitizeMask(maskDataUrl, width, height) {
    const raw = parseDataUrl(maskDataUrl).buffer;
    const alpha = await sharp(raw).ensureAlpha().resize(width, height).extractChannel(3).raw().toBuffer();
    let alphaMin = 255;
    let alphaMax = 0;
    for (let i = 0; i < alpha.length; i++) {
        if (alpha[i] < alphaMin) alphaMin = alpha[i];
        if (alpha[i] > alphaMax) alphaMax = alpha[i];
    }
    const alphaRange = alphaMax - alphaMin;

    let maskChannel;
    if (alphaRange < 30) {
        maskChannel = await sharp(raw).resize(width, height).greyscale().threshold(128).extractChannel(0).raw().toBuffer();
    } else {
        maskChannel = await sharp(alpha, { raw: { width, height, channels: 1 } }).threshold(18).greyscale().extractChannel(0).raw().toBuffer();
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

function buildAdaptiveThresholdedAlpha(baseAlpha, analysis, width, height, variant = 'primary') {
    let pipeline = sharp(baseAlpha, { raw: { width, height, channels: 1 } });
    const defectHeavy = Math.max(analysis.defects.misalignment, analysis.defects.gaps, analysis.defects.chips);

    if (analysis.mode === 'reconstruct') {
        pipeline = pipeline.dilate(defectHeavy > 0.56 ? 2 : 1);
    } else if (analysis.context === 'teeth_only' && defectHeavy > 0.48) {
        pipeline = pipeline.dilate(1);
    } else if (analysis.mode === 'restore' && analysis.context !== 'face' && defectHeavy > 0.5) {
        pipeline = pipeline.dilate(1);
    } else if (analysis.mode === 'refine' || analysis.context === 'face') {
        pipeline = pipeline.erode(1);
    }

    if (variant === 'tight') {
        pipeline = pipeline.erode(1);
    } else if (variant === 'loose' && analysis.mode === 'reconstruct' && defectHeavy > 0.72) {
        pipeline = pipeline.dilate(1);
    }

    const blur = variant === 'tight' ? 0.3 : variant === 'loose' ? 0.42 : 0.34;
    const threshold = variant === 'loose' ? 24 : 28;
    return pipeline.blur(blur).threshold(threshold).grayscale().extractChannel(0);
}

async function applyLipSafeMaskCleanup(alphaMask, originalRaw, width, height) {
    const cleaned = Buffer.from(alphaMask);
    let originalCount = 0;
    for (let j = 0; j < cleaned.length; j++) {
        if (cleaned[j] >= 12) originalCount++;
    }

    let lipRemoved = 0;
    for (let j = 0; j < cleaned.length; j++) {
        if (cleaned[j] < 12) continue;
        const i = j * 4;
        const r = originalRaw[i];
        const g = originalRaw[i + 1];
        const b = originalRaw[i + 2];

        const lum = luminance(r, g, b);
        const chr = chroma(r, g, b);
        const isReddish = r > g + 14 && r > b + 14 && (g / (r + 0.001) < 0.75);
        const toothLike = lum > 50 && (g / (r + 0.001) >= 0.72) && chr < 80;
        const cavityLike = lum < 102 && chr < 45 && !isReddish;

        if (isReddish && !toothLike && !cavityLike) {
            cleaned[j] = 0;
            lipRemoved++;
        }
    }

    let survivingCount = 0;
    for (let j = 0; j < cleaned.length; j++) {
        if (cleaned[j] >= 12) survivingCount++;
    }

    console.log(`[applyLipSafeMaskCleanup] originalCount=${originalCount}, survivingCount=${survivingCount}, lipRemoved=${lipRemoved}`);

    const survivalRatio = originalCount > 0 ? survivingCount / originalCount : 1;
    if (survivalRatio < 0.05) {
        return sharp(alphaMask, { raw: { width, height, channels: 1 } }).blur(0.3).threshold(28).grayscale().extractChannel(0).raw().toBuffer();
    }
    return sharp(cleaned, { raw: { width, height, channels: 1 } }).blur(0.3).threshold(28).grayscale().extractChannel(0).raw().toBuffer();
}

function getTargetCoveragePct(context) {
    if (context === 'teeth_only') return { min: 1.6, ideal: 8.8, max: 80 };
    if (context === 'mouth_closeup') return { min: 0.7, ideal: 4.6, max: 50 };
    return { min: 0.08, ideal: 1.2, max: 9.5 };
}

function scoreCoverageFit(coveragePct, target) {
    if (coveragePct < target.min || coveragePct > target.max) {
        return -1000;
    }
    const distance = Math.abs(coveragePct - target.ideal);
    return 100 - distance * 9.5;
}

async function main() {
    const inputImagePath = '/home/harun/block/dreamsmile-ai/public/demo-result.jpg';
    
    // Construct mock mask identical to test-local-api.mjs
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

    // Mock analysis data (which route.ts generates)
    // We will extract these metrics using a real run of analyzeMouthRegion or simply simulate typical values.
    // Wait, let's use the actual values. In the debug logs of route/imageService, they are printed or we can mock them.
    const analysis = {
        mode: 'restore',
        context: 'mouth_closeup',
        defects: { misalignment: 0.1, gaps: 0.2, chips: 0.1, stains: 0.3 },
    };

    const imageBuffer = await sharp(inputImagePath).resize(512, 512, { fit: 'fill' }).toBuffer();
    const imageDataUrl = toDataUrl('image/jpeg', imageBuffer);

    const width = 512, height = 512;
    const sanitized = await sanitizeMask(maskDataUrl, width, height);
    const alphaBase = await sharp(sanitized).ensureAlpha().resize(width, height).extractChannel(3).raw().toBuffer();
    const originalRaw = await sharp(imageBuffer).ensureAlpha().resize(width, height).raw().toBuffer();
    
    const targetCoverage = getTargetCoveragePct(analysis.context);
    console.log('Target Coverage:', targetCoverage);

    const variants = ['tight', 'primary'];
    for (const variant of variants) {
        console.log(`\n--- VARIANT: ${variant} ---`);
        const alphaAdapted = await buildAdaptiveThresholdedAlpha(alphaBase, analysis, width, height, variant).raw().toBuffer();
        
        let adaptedCount = 0;
        for (let i = 0; i < alphaAdapted.length; i++) {
            if (alphaAdapted[i] > 0) adaptedCount++;
        }
        console.log(`alphaAdapted count = ${adaptedCount}`);

        const alphaLipSafe = await applyLipSafeMaskCleanup(alphaAdapted, originalRaw, width, height);
        
        let covered = 0;
        for (let i = 0; i < alphaLipSafe.length; i++) {
            if (alphaLipSafe[i] > 0) covered += 1;
        }
        const coverage = (covered / (width * height)) * 100;
        console.log(`coverage = ${coverage.toFixed(3)}%`);

        const score = scoreCoverageFit(coverage, targetCoverage);
        console.log(`scoreCoverageFit = ${score}`);
    }
}

main().catch(console.error);
