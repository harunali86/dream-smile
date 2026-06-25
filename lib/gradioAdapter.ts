/**
 * Cloudflare Workers AI Adapter — SD v1.5 Inpainting
 *
 * Free-tier friendly provider path for demo mode.
 * Uses provider-first generation and deterministic cavity fallback for reliability.
 */
import sharp from 'sharp';
import { Client } from '@gradio/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns';

// Intercept DNS resolution for Modal domains to force IPv4 and prevent ETIMEDOUT errors
if (!(globalThis as any).__dns_modal_intercepted__) {
    const originalLookup = dns.lookup;
    // @ts-ignore
    dns.lookup = function(hostname, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        if (hostname && typeof hostname === 'string' && hostname.endsWith('.modal.run')) {
            if (typeof options === 'number') {
                options = { family: 4 };
            } else if (options) {
                options.family = 4;
            } else {
                options = { family: 4 };
            }
        }
        return (originalLookup as any).call(dns, hostname, options, callback);
    };
    (globalThis as any).__dns_modal_intercepted__ = true;
}

// Resilient Global Fetch Interceptor with automatic retries for flaky Hugging Face / Gradio networks
if (!(globalThis as any).__hf_fetch_intercepted__) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any, options: any) => {
        const maxRetries = 5;
        const delay = 2000;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const res = await originalFetch(url, options);
                return res;
            } catch (err: any) {
                console.warn(`[HF-FETCH RETRY ${i + 1}/${maxRetries}] ${url.toString()} -> Error:`, err.message || err);
                if (i === maxRetries - 1) {
                    throw err;
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        return originalFetch(url, options);
    };
    (globalThis as any).__hf_fetch_intercepted__ = true;
}


const MIN_WEAK_DARK_LIFT = 2.4;

const MAX_PROVIDER_CALLS_PER_REQUEST = 6;
const CF_MODEL = '@cf/runwayml/stable-diffusion-v1-5-inpainting';

// ModelsLab API Configuration Constants (Fallback Path)
const MODELSLAB_BASE_URL = 'https://modelslab.com/api/v6';
const MODELSLAB_B64_TO_URL_PATH = '/image_editing/base64_to_url';
const MODELSLAB_INPAINT_PATH = '/image_editing/inpaint';
const MODELSLAB_FETCH_PATH = '/image_editing/fetch';

// FLUX.1-Fill-dev via HuggingFace Space (free ZeroGPU)
const FLUX_HF_SPACE = 'black-forest-labs/FLUX.1-Fill-dev';

const MIN_RESCUE_TOOTH_GAIN: Record<AnalysisMode, number> = {
    reconstruct: 0.56,
    restore: 0.48,
    refine: 0.42,
};

type PayloadVariant = 'mask_array';

type AnalysisMode = 'reconstruct' | 'restore' | 'refine';
type MouthContext = 'face' | 'mouth_closeup' | 'teeth_only';

interface AttemptConfig {
    steps: number;
    guidance: number;
    strength: number;
    edgeBlend: number;
    coreThreshold: number;
    seed: number;
    boost: string;
}

interface MouthAnalysis {
    coveragePct: number;
    meanLum: number;
    darkPct: number;
    brightPct: number;
    mode: AnalysisMode;
    context: MouthContext;
    defects: DefectScores;
    targetDarkLift: number;
    targetDiffMin: number;
    targetDiffMax: number;
    maxAcceptableDiff: number;
    maxRescueDiff: number;
    maxArchDrift: number;
}

interface MaskMetrics {
    maskedDiff: number;
    darkLift: number;
    toothGain: number;
    archDrift: number;
    outsideDiffPct: number;
}

interface DefectScores {
    misalignment: number;
    gaps: number;
    chips: number;
    stains: number;
}

export interface GenerateInput {
    prompt: string;
    negativePrompt: string;
    imageBase64: string;
    maskBase64: string;
}

export interface GenerateOutput {
    imageUrl: string;
    provider: string;
    isDemo: boolean;
    debug?: string;
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        throw new Error('Invalid data URL format.');
    }

    return {
        mime: match[1],
        buffer: Buffer.from(match[2], 'base64'),
    };
}

function toDataUrl(mime: string, buffer: Buffer): string {
    return `data:${mime};base64,${buffer.toString('base64')}`;
}

function stripDataUrlHeader(dataUrl: string): string {
    const idx = dataUrl.indexOf(',');
    return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeDebugImage(name: string, dataUrl: string): Promise<void> {
    if (process.env.DREAMSMILE_DEBUG_DUMPS !== 'true') return;

    const parsed = parseDataUrl(dataUrl);
    const debugRoot = path.join(process.cwd(), 'debug-dumps');
    const dir =
        (globalThis as any).__dreamsmile_debug_dir__ ??
        path.join(debugRoot, new Date().toISOString().replace(/[:.]/g, '-'));
    (globalThis as any).__dreamsmile_debug_dir__ = dir;
    await fs.mkdir(dir, { recursive: true });

    const ext = parsed.mime === 'image/webp' ? 'webp' : parsed.mime === 'image/jpeg' ? 'jpg' : 'png';
    await fs.writeFile(path.join(dir, `${name}.${ext}`), parsed.buffer);
}

async function compositeInpaintedResult(
    originalImageBuf: Buffer,
    generatedBuf: Buffer,
    flatMaskBuf: Buffer,
    w: number,
    h: number
): Promise<Buffer> {
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

function detectImageMime(buffer: Buffer): string {
    if (buffer.length >= 12) {
        // RIFF....WEBP
        if (
            buffer.toString('ascii', 0, 4) === 'RIFF' &&
            buffer.toString('ascii', 8, 12) === 'WEBP'
        ) {
            return 'image/webp';
        }
    }

    if (buffer.length >= 8) {
        // PNG
        const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        let isPng = true;
        for (let i = 0; i < pngSig.length; i++) {
            if (buffer[i] !== pngSig[i]) {
                isPng = false;
                break;
            }
        }
        if (isPng) return 'image/png';
    }

    if (buffer.length >= 3) {
        // JPEG
        if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
            return 'image/jpeg';
        }
    }

    return 'application/octet-stream';
}

async function sanitizeMask(
    maskDataUrl: string,
    width: number,
    height: number
): Promise<Buffer> {
    const raw = parseDataUrl(maskDataUrl).buffer;
    console.log(`[sanitizeMask] debug: raw buffer length = ${raw.length}, target size = ${width}x${height}`);

    // Extract alpha channel first
    const alpha = await sharp(raw)
        .ensureAlpha()
        .resize(width, height)
        .extractChannel(3)
        .raw()
        .toBuffer();

    // Check if alpha is uniform (all opaque or all transparent).
    // If uniform, the mask intent is encoded as white-vs-black RGB, not alpha.
    let alphaMin = 255;
    let alphaMax = 0;
    const sampleSize = Math.min(alpha.length, 20000);
    const step = Math.max(1, Math.floor(alpha.length / sampleSize));
    for (let i = 0; i < alpha.length; i += step) {
        if (alpha[i] < alphaMin) alphaMin = alpha[i];
        if (alpha[i] > alphaMax) alphaMax = alpha[i];
    }
    const alphaRange = alphaMax - alphaMin;
    console.log(`[sanitizeMask] debug: alphaMin=${alphaMin}, alphaMax=${alphaMax}, alphaRange=${alphaRange}`);

    let alphaCovered = 0;
    for (let i = 0; i < alpha.length; i++) {
        if (alpha[i] > 0) alphaCovered++;
    }
    console.log(`[sanitizeMask] debug: alpha length = ${alpha.length}, alpha > 0 count = ${alphaCovered}`);

    let maskChannel: Buffer;
    if (alphaRange < 30) {
        // Alpha is uniform (e.g. fully opaque PNG with white-on-black mask)
        // → Use grayscale luminance as the mask signal
        console.log(`[sanitizeMask] Uniform alpha detected (range=${alphaRange}), using luminance fallback`);
        maskChannel = await sharp(raw)
            .resize(width, height)
            .greyscale()
            .threshold(128)
            .extractChannel(0)
            .raw()
            .toBuffer();
    } else {
        // Alpha has meaningful variation → use it directly
        console.log(`[sanitizeMask] Non-uniform alpha range detected, using alpha directly`);
        maskChannel = await sharp(Buffer.from(alpha), { raw: { width, height, channels: 1 } })
            .threshold(18)
            .greyscale()
            .extractChannel(0)
            .raw()
            .toBuffer();
    }

    let maskChannelCovered = 0;
    for (let i = 0; i < maskChannel.length; i++) {
        if (maskChannel[i] > 0) maskChannelCovered++;
    }
    console.log(`[sanitizeMask] debug: maskChannel length = ${maskChannel.length}, maskChannel > 0 count = ${maskChannelCovered}`);

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

function classifyMouthContext(
    coveragePct: number,
    maskWidthPct: number,
    maskHeightPct: number
): MouthContext {
    if (coveragePct >= 14 || (maskWidthPct >= 56 && maskHeightPct >= 26)) {
        return 'teeth_only';
    }
    if (coveragePct >= 5 || maskWidthPct >= 38 || maskHeightPct >= 17) {
        return 'mouth_closeup';
    }
    return 'face';
}

function buildAdaptiveThresholdedAlpha(
    baseAlpha: Buffer,
    analysis: MouthAnalysis,
    width: number,
    height: number,
    variant: 'primary' | 'tight' | 'loose' = 'primary'
){
    let pipeline = sharp(baseAlpha, { raw: { width, height, channels: 1 } });
    const defectHeavy =
        Math.max(analysis.defects.misalignment, analysis.defects.gaps, analysis.defects.chips);

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

async function applyLipSafeMaskCleanup(
    alphaMask: Buffer,
    originalRaw: Buffer,
    width: number,
    height: number
): Promise<Buffer> {
    const cleaned = Buffer.from(alphaMask);

    // Count original mask pixels before cleanup
    let originalCount = 0;
    for (let j = 0; j < cleaned.length; j++) {
        if (cleaned[j] >= 12) originalCount++;
    }

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
        }
    }

    // Count surviving mask pixels after lip removal
    let survivingCount = 0;
    for (let j = 0; j < cleaned.length; j++) {
        if (cleaned[j] >= 12) survivingCount++;
    }

    // If lip cleanup removed more than 95% of the mask, it was too aggressive.
    // Return the original mask to prevent collapsing to near-zero coverage.
    const survivalRatio = originalCount > 0 ? survivingCount / originalCount : 1;
    if (survivalRatio < 0.05) {
        console.warn(
            `[LipSafe] Cleanup too aggressive: ${originalCount}→${survivingCount} px ` +
            `(${(survivalRatio * 100).toFixed(1)}% survived). Returning original mask.`
        );
        return sharp(alphaMask, { raw: { width, height, channels: 1 } })
            .blur(0.3)
            .threshold(28)
            .grayscale()
            .extractChannel(0)
            .raw()
            .toBuffer();
    }

    // Only apply light smoothing, NO erosion — erosion was destroying valid mask pixels
    return sharp(cleaned, { raw: { width, height, channels: 1 } })
        .blur(0.3)
        .threshold(28)
        .grayscale()
        .extractChannel(0)
        .raw()
        .toBuffer();
}

function getTargetCoveragePct(context: MouthContext): { min: number; ideal: number; max: number } {
    if (context === 'teeth_only') {
        return { min: 1.6, ideal: 8.8, max: 80 };
    }
    if (context === 'mouth_closeup') {
        return { min: 0.7, ideal: 4.6, max: 50 };
    }
    return { min: 0.08, ideal: 1.2, max: 9.5 };
}

function scoreCoverageFit(coveragePct: number, target: { min: number; ideal: number; max: number }): number {
    if (coveragePct < target.min || coveragePct > target.max) {
        return -1000;
    }
    const distance = Math.abs(coveragePct - target.ideal);
    return 100 - distance * 9.5;
}

async function adaptMaskForAnalysis(
    imageDataUrl: string,
    maskDataUrl: string,
    analysis: MouthAnalysis
): Promise<string> {
    const image = parseDataUrl(imageDataUrl).buffer;
    const meta = await sharp(image).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) return maskDataUrl;

    const sanitized = await sanitizeMask(maskDataUrl, width, height);
    const alphaBase = await sharp(sanitized)
        .ensureAlpha()
        .resize(width, height)
        .extractChannel(3)
        .raw()
        .toBuffer();

    const originalRaw = await sharp(image).ensureAlpha().resize(width, height).raw().toBuffer();
    const targetCoverage = getTargetCoveragePct(analysis.context);
    const variants: Array<'tight' | 'primary' | 'loose'> = ['tight', 'primary'];
    if (analysis.mode === 'reconstruct' && analysis.defects.gaps > 0.64) {
        variants.push('loose');
    }

    let bestMask: Buffer | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const variant of variants) {
        const alphaAdapted = await buildAdaptiveThresholdedAlpha(alphaBase, analysis, width, height, variant).raw().toBuffer();
        const alphaLipSafe = await applyLipSafeMaskCleanup(alphaAdapted, originalRaw, width, height);

        let covered = 0;
        for (let i = 0; i < alphaLipSafe.length; i++) {
            if (alphaLipSafe[i] > 0) covered += 1;
        }

        const coverage = (covered / (width * height)) * 100;
        if (coverage < 0.03 || coverage > targetCoverage.max * 1.1) {
            continue;
        }

        let score = scoreCoverageFit(coverage, targetCoverage);
        if (variant === 'tight') {
            score += 6 + analysis.defects.stains * 5 - analysis.defects.gaps * 6;
        } else if (variant === 'loose') {
            score -= 8;
            score += analysis.defects.gaps * 4 + analysis.defects.chips * 3;
        }

        if (score > bestScore) {
            bestScore = score;
            bestMask = alphaLipSafe;
        }
    }

    if (!bestMask) return maskDataUrl;

    const out = Buffer.alloc(width * height * 4, 0);
    for (let i = 0, j = 0; i < out.length; i += 4, j += 1) {
        const a = bestMask[j] > 0 ? 255 : 0;
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
        out[i + 3] = a;
    }

    const adapted = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
    return toDataUrl('image/png', adapted);
}

async function computeMaskCoveragePct(maskDataUrl: string): Promise<number> {
    try {
        const raw = parseDataUrl(maskDataUrl).buffer;
        const meta = await sharp(raw).metadata();
        const width = meta.width ?? 0;
        const height = meta.height ?? 0;
        if (!width || !height) return 0;

        // Use sanitizeMask for reliable mask interpretation (handles both alpha and luminance masks)
        const sanitized = await sanitizeMask(maskDataUrl, width, height);
        const alpha = await sharp(sanitized).ensureAlpha().extractChannel(3).raw().toBuffer();
        let covered = 0;
        for (let i = 0; i < alpha.length; i++) {
            if (alpha[i] > 0) covered += 1;
        }
        const pct = (covered / (width * height)) * 100;
        console.log(`[computeMaskCoveragePct] debug: covered=${covered}, total=${width * height}, pct=${pct.toFixed(2)}%`);
        return pct;
    } catch (err) {
        console.error('[computeMaskCoveragePct] error:', err);
        return 0;
    }
}

async function getMaskBounds(
    maskBuffer: Buffer,
    width: number,
    height: number
): Promise<{ minX: number; minY: number; maxX: number; maxY: number } | null> {
    const maskRaw = await sharp(maskBuffer).ensureAlpha().resize(width, height).raw().toBuffer();

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4 + 3;
            if (maskRaw[idx] < 20) continue;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }

    if (maxX < minX || maxY < minY) return null;
    return { minX, minY, maxX, maxY };
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function clamp01(n: number): number {
    return clamp(n, 0, 1);
}

function stdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
    const variance =
        values.reduce((acc, v) => {
            const d = v - mean;
            return acc + d * d;
        }, 0) / values.length;
    return Math.sqrt(variance);
}

function buildDefectInstruction(defects: DefectScores): string {
    const weighted = [
        {
            kind: 'misalignment',
            score: defects.misalignment,
            text: 'Priority alignment correction: straighten visible tooth axes and preserve natural smile arc continuity.',
        },
        {
            kind: 'gaps',
            score: defects.gaps,
            text: 'Priority gap correction: close dark interdental voids with realistic contact points and natural spacing.',
        },
        {
            kind: 'chips',
            score: defects.chips,
            text: 'Priority chip correction: reconstruct broken incisal edges with anatomically plausible contour.',
        },
        {
            kind: 'stains',
            score: defects.stains,
            text: 'Priority stain correction: remove yellow-brown discoloration while keeping enamel translucency.',
        },
    ].sort((a, b) => b.score - a.score);

    const active = weighted.filter((item) => item.score >= 0.2);
    if (active.length === 0) {
        return 'Maintain realistic tooth anatomy and natural micro-variation across all visible teeth.';
    }

    const top = active[0];
    const intensity =
        top.score >= 0.66 ? 'High priority' : top.score >= 0.46 ? 'Medium priority' : 'Low priority';

    return [
        `${intensity} dental correction: focus first on ${top.kind}.`,
        ...active.slice(0, 3).map((item) => item.text),
    ].join(' ');
}

// Retired: cropToMouthRoi and pasteMaskedRoiBack are no longer used since the inpainting pipeline runs globally on the full image.

function luminance(r: number, g: number, b: number): number {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function chroma(r: number, g: number, b: number): number {
    return Math.max(r, g, b) - Math.min(r, g, b);
}

function isLikelyLipColor(r: number, g: number, b: number, lum: number): boolean {
    // Red-dominant, moderately bright tones are usually lips/inner lip tissue.
    return lum > 50 && r > g + 15 && r > b + 22;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function getDefectPeak(defects: DefectScores): number {
    return Math.max(
        defects.misalignment * 1.05,
        defects.gaps * 1.18,
        defects.chips * 1.12,
        defects.stains * 0.82
    );
}

function getModelAttempts(mode: AnalysisMode): AttemptConfig[] {
    if (mode === 'reconstruct') {
        return [
            {
                steps: 18,
                guidance: 10.8,
                strength: 0.96,
                edgeBlend: 0.8,
                coreThreshold: 72,
                seed: 1337,
                boost: 'Reconstruct missing teeth and damaged enamel within existing cavity using realistic tooth anatomy and natural occlusion.',
            },
            {
                steps: 20,
                guidance: 12.2,
                strength: 1.0,
                edgeBlend: 0.84,
                coreThreshold: 80,
                seed: 2244,
                boost: 'Create complete upper visible dental arch with proportional tooth widths, incisal edges, and realistic translucency.',
            },
            {
                steps: 20,
                guidance: 13.0,
                strength: 1.0,
                edgeBlend: 0.88,
                coreThreshold: 88,
                seed: 3377,
                boost: 'Finalize lifelike veneer-ready reconstruction: fill visible gaps, remove broken fragments, and keep lips/gums unchanged.',
            },
        ];
    }

    if (mode === 'restore') {
        return [
            {
                steps: 16,
                guidance: 5.4,
                strength: 0.56,
                edgeBlend: 0.64,
                coreThreshold: 174,
                seed: 4411,
                boost: 'Repair chips, close visible gaps, and align teeth while preserving natural mouth geometry.',
            },
            {
                steps: 18,
                guidance: 6.0,
                strength: 0.64,
                edgeBlend: 0.68,
                coreThreshold: 178,
                seed: 5522,
                boost: 'Improve tooth symmetry and enamel quality for veneer simulation without changing lips or jaw.',
            },
            {
                steps: 20,
                guidance: 6.3,
                strength: 0.7,
                edgeBlend: 0.72,
                coreThreshold: 182,
                seed: 6633,
                boost: 'Refine dental restoration details with realistic texture and contour continuity.',
            },
        ];
    }

    // refine
    return [
        {
            steps: 14,
            guidance: 4.8,
            strength: 0.42,
            edgeBlend: 0.5,
            coreThreshold: 186,
            seed: 7744,
            boost: 'Subtle veneer enhancement only: improve tone, polish, and fine alignment with high realism.',
        },
        {
            steps: 16,
            guidance: 5.2,
            strength: 0.48,
            edgeBlend: 0.52,
            coreThreshold: 190,
            seed: 8855,
            boost: 'Natural whitening and micro-correction while keeping tooth identity and facial expression.',
        },
        {
            steps: 18,
            guidance: 5.6,
            strength: 0.54,
            edgeBlend: 0.56,
            coreThreshold: 194,
            seed: 9966,
            boost: 'Finalize realistic porcelain-like veneer finish with subtle translucency and edge detail.',
        },
    ];
}

function pickTrialSafeAttempt(mode: AnalysisMode, analysis: MouthAnalysis): AttemptConfig {
    const attempts = getModelAttempts(mode);
    const defectPeak = getDefectPeak(analysis.defects);
    if (attempts.length === 0) {
        return {
            steps: 20,
            guidance: 6.0,
            strength: 0.65,
            edgeBlend: 0.68,
            coreThreshold: 180,
            seed: 2244,
            boost: 'Repair and align visible teeth inside cavity while preserving lips and face geometry.',
        };
    }

    if (mode === 'reconstruct') {
        // Severe darkness / tiny cavity generally needs the strongest single shot.
        if (
            analysis.darkPct > 28 ||
            analysis.coveragePct < 1.6 ||
            analysis.context === 'teeth_only' ||
            defectPeak >= 0.58
        ) {
            return attempts[Math.min(attempts.length - 1, 2)];
        }
        return attempts[Math.min(attempts.length - 1, 1)];
    }

    if (mode === 'restore') {
        // Moderate restoration: prefer balanced middle preset.
        if (analysis.context === 'teeth_only' || defectPeak >= 0.46) {
            return attempts[Math.min(attempts.length - 1, 2)];
        }
        return attempts[Math.min(attempts.length - 1, 1)];
    }

    // Refine mode should stay conservative to avoid over-editing.
    if (defectPeak >= 0.34) {
        return attempts[Math.min(attempts.length - 1, 1)];
    }
    return attempts[0];
}

async function preprocessRoiForInference(
    roiImageDataUrl: string,
    analysis: MouthAnalysis
): Promise<string> {
    const parsed = parseDataUrl(roiImageDataUrl);
    const defectPeak = getDefectPeak(analysis.defects);
    const needsStrongStructure = analysis.mode === 'reconstruct' || defectPeak >= 0.52;

    const brightnessBase = analysis.meanLum < 112 ? 1.07 : analysis.meanLum < 132 ? 1.04 : 1.01;
    const brightness = clamp(brightnessBase + defectPeak * 0.04, 1.0, 1.14);
    const saturation = analysis.mode === 'refine' ? 0.98 : 0.94;
    const linearGain =
        analysis.mode === 'reconstruct'
            ? 1.08
            : analysis.mode === 'restore'
                ? 1.05
                : 1.02;
    const linearOffset = analysis.mode === 'reconstruct' ? -7 : analysis.mode === 'restore' ? -4 : -2;

    let pipeline = sharp(parsed.buffer)
        .ensureAlpha()
        .modulate({ brightness, saturation })
        .linear(linearGain, linearOffset);

    if (needsStrongStructure) {
        pipeline = pipeline.sharpen(1.0, 1.0, 2.2);
    } else if (analysis.mode === 'restore') {
        pipeline = pipeline.sharpen(0.78, 0.9, 1.8);
    } else {
        pipeline = pipeline.sharpen(0.56, 0.7, 1.3);
    }

    const out = await pipeline.png().toBuffer();
    return toDataUrl('image/png', out);
}

function tuneAttemptForSingleCall(
    attempt: AttemptConfig,
    analysis: MouthAnalysis
): { steps: number; guidance: number; strength: number; boost: number } {
    const defectPeak = getDefectPeak(analysis.defects);
    const modeBaseBoost =
        analysis.mode === 'reconstruct'
            ? 0.68
            : analysis.mode === 'restore'
                ? 0.46
                : 0.22;
    const boost = Math.max(modeBaseBoost, defectPeak);

    const steps = Math.max(20, Math.min(34, Math.round(attempt.steps + 10 + boost * 4)));
    const guidance = Number(Math.max(5, Math.min(11, attempt.guidance + boost * 1.35)).toFixed(2));
    const strength = Number(Math.max(0.58, Math.min(0.9, attempt.strength + boost * 0.14)).toFixed(2));

    return { steps, guidance, strength, boost };
}

function estimateDefectScores(
    originalRaw: Buffer,
    maskRaw: Buffer,
    width: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number }
): DefectScores {
    const bw = bounds.maxX - bounds.minX + 1;
    const bh = bounds.maxY - bounds.minY + 1;
    if (bw < 6 || bh < 4) {
        return { misalignment: 0, gaps: 0, chips: 0, stains: 0 };
    }

    const toothCols = new Array<number>(bw).fill(0);
    const darkCols = new Array<number>(bw).fill(0);
    const toothMinY = new Array<number>(bw).fill(Number.POSITIVE_INFINITY);
    const toothMaxY = new Array<number>(bw).fill(-1);

    let stainPixels = 0;
    let toothPixels = 0;

    for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let x = bounds.minX; x <= bounds.maxX; x++) {
            const px = y * width + x;
            const i = px * 4;
            if (maskRaw[i + 3] < 20) continue;

            const r = originalRaw[i];
            const g = originalRaw[i + 1];
            const b = originalRaw[i + 2];
            const lum = luminance(r, g, b);
            const chr = chroma(r, g, b);
            const lipLike = isLikelyLipColor(r, g, b, lum);
            const col = x - bounds.minX;

            const toothLike =
                lum >= 56 &&
                lum <= 232 &&
                chr < 102 &&
                !lipLike;
            const cavityLike = lum < 100 && chr < 108;
            const stainLike = toothLike && r > g + 4 && g > b + 5 && lum < 186;

            if (toothLike) {
                toothCols[col] += 1;
                toothPixels += 1;
                if (stainLike) stainPixels += 1;
                if (y < toothMinY[col]) toothMinY[col] = y;
                if (y > toothMaxY[col]) toothMaxY[col] = y;
            } else if (cavityLike) {
                darkCols[col] += 1;
            }
        }
    }

    const activeCols: number[] = [];
    for (let c = 0; c < bw; c++) {
        if (toothCols[c] >= 2 && toothMinY[c] <= toothMaxY[c]) activeCols.push(c);
    }
    if (activeCols.length < 4) {
        return { misalignment: 0, gaps: 0, chips: 0, stains: 0 };
    }

    const topLine = activeCols.map((c) => toothMinY[c]);
    const bottomLine = activeCols.map((c) => toothMaxY[c]);

    const topStd = stdDev(topLine);
    const bottomStd = stdDev(bottomLine);
    const misalignment = clamp01((topStd + bottomStd) / Math.max(3.2, bh * 0.2));

    let roughnessAcc = 0;
    let roughnessPairs = 0;
    for (let i = 1; i < activeCols.length; i++) {
        const prev = activeCols[i - 1];
        const curr = activeCols[i];
        const topDiff = Math.abs(toothMinY[curr] - toothMinY[prev]);
        const bottomDiff = Math.abs(toothMaxY[curr] - toothMaxY[prev]);
        roughnessAcc += Math.max(0, topDiff - 1.2) + Math.max(0, bottomDiff - 1.2);
        roughnessPairs += 1;
    }
    const chips = clamp01(
        roughnessPairs > 0
            ? (roughnessAcc / roughnessPairs) / Math.max(2.2, bh * 0.08)
            : 0
    );

    let gapCols = 0;
    for (let c = 1; c < bw - 1; c++) {
        const leftTooth = toothCols[c - 1] >= 2;
        const rightTooth = toothCols[c + 1] >= 2;
        const midToothWeak = toothCols[c] <= 1;
        const midDark = darkCols[c] >= 2;
        if (leftTooth && rightTooth && midToothWeak && midDark) {
            gapCols += 1;
        }
    }
    const gapRatio = gapCols / Math.max(4, activeCols.length);
    const gaps = clamp01((gapRatio - 0.04) / 0.22);

    const stainRatio = stainPixels / Math.max(1, toothPixels);
    const stains = clamp01((stainRatio - 0.08) / 0.24);

    return { misalignment, gaps, chips, stains };
}

async function analyzeMouthRegion(
    originalDataUrl: string,
    maskDataUrl: string
): Promise<MouthAnalysis> {
    const defaultDefects: DefectScores = {
        misalignment: 0,
        gaps: 0,
        chips: 0,
        stains: 0,
    };

    const defaultAnalysis: MouthAnalysis = {
        coveragePct: 0,
        meanLum: 0,
        darkPct: 0,
        brightPct: 0,
        mode: 'restore',
        context: 'face',
        defects: defaultDefects,
        targetDarkLift: 3.2,
        targetDiffMin: 8,
        targetDiffMax: 24,
        maxAcceptableDiff: 52,
        maxRescueDiff: 72,
        maxArchDrift: 0.84,
    };

    const original = parseDataUrl(originalDataUrl).buffer;
    const mask = parseDataUrl(maskDataUrl).buffer;

    const base = sharp(original).ensureAlpha();
    const meta = await base.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    if (!width || !height) {
        return defaultAnalysis;
    }

    const originalRaw = await base.raw().toBuffer();
    const maskRaw = await sharp(mask).ensureAlpha().resize(width, height).raw().toBuffer();

    let covered = 0;
    let lumAcc = 0;
    let darkCount = 0;
    let brightCount = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let i = 0; i < originalRaw.length; i += 4) {
        const alpha = maskRaw[i + 3];
        if (alpha < 20) continue;

        const px = i / 4;
        const x = px % width;
        const y = Math.floor(px / width);

        const lum = luminance(originalRaw[i], originalRaw[i + 1], originalRaw[i + 2]);
        covered += 1;
        lumAcc += lum;

        if (lum < 110) darkCount += 1;
        if (lum > 185) brightCount += 1;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    if (covered === 0) {
        return defaultAnalysis;
    }

    const coveragePct = (covered / (width * height)) * 100;
    const meanLum = lumAcc / covered;
    const darkPct = (darkCount / covered) * 100;
    const brightPct = (brightCount / covered) * 100;
    const hasBounds = maxX >= minX && maxY >= minY;
    const maskWidthPct = hasBounds ? ((maxX - minX + 1) / width) * 100 : 0;
    const maskHeightPct = hasBounds ? ((maxY - minY + 1) / height) * 100 : 0;
    const context = classifyMouthContext(coveragePct, maskWidthPct, maskHeightPct);
    const defects = hasBounds
        ? estimateDefectScores(originalRaw, maskRaw, width, { minX, maxX, minY, maxY })
        : defaultDefects;
    const defectPeak = Math.max(
        defects.misalignment * 1.05,
        defects.gaps * 1.18,
        defects.chips * 1.12,
        defects.stains * 0.82
    );
    const defectForceReconstruct =
        defectPeak >= 0.72 ||
        defects.gaps >= 0.56 ||
        defects.chips >= 0.52 ||
        (context === 'teeth_only' && defectPeak >= 0.58);
    const defectForceRestore =
        defectPeak >= 0.42 ||
        defects.misalignment >= 0.45 ||
        defects.stains >= 0.48;

    const reconstructDarkThreshold = context === 'face' ? 33 : 28;
    const reconstructLumThreshold = context === 'face' ? 95 : 102;
    const restoreDarkThreshold = context === 'face' ? 18 : 14;
    const restoreLumThreshold = context === 'face' ? 120 : 126;

    if (
        darkPct >= reconstructDarkThreshold ||
        meanLum <= reconstructLumThreshold ||
        defectForceReconstruct
    ) {
        const diffMax = context === 'teeth_only' ? 24 : context === 'mouth_closeup' ? 22 : 18;
        return {
            coveragePct,
            meanLum,
            darkPct,
            brightPct,
            mode: 'reconstruct',
            context,
            defects,
            targetDarkLift: context === 'face' ? 4.8 : 4.2,
            targetDiffMin: context === 'teeth_only' ? 7 : 6,
            targetDiffMax: diffMax,
            maxAcceptableDiff: context === 'teeth_only' ? 70 : 62,
            maxRescueDiff: context === 'teeth_only' ? 88 : 82,
            maxArchDrift: context === 'teeth_only' ? 1.0 : 0.9,
        };
    }

    if (
        darkPct >= restoreDarkThreshold ||
        meanLum <= restoreLumThreshold ||
        defectForceRestore
    ) {
        const diffMax = context === 'teeth_only' ? 24 : context === 'mouth_closeup' ? 22 : 20;
        return {
            coveragePct,
            meanLum,
            darkPct,
            brightPct,
            mode: 'restore',
            context,
            defects,
            targetDarkLift: context === 'teeth_only' ? 3.2 : 3.6,
            targetDiffMin: 6,
            targetDiffMax: diffMax,
            maxAcceptableDiff: context === 'teeth_only' ? 58 : 52,
            maxRescueDiff: context === 'teeth_only' ? 76 : 72,
            maxArchDrift: context === 'teeth_only' ? 0.9 : 0.78,
        };
    }

    // Teeth-only uploads usually need structural correction, not just mild whitening.
    if (context === 'teeth_only') {
        return {
            coveragePct,
            meanLum,
            darkPct,
            brightPct,
            mode: 'restore',
            context,
            defects,
            targetDarkLift: 3.0,
            targetDiffMin: 6,
            targetDiffMax: 22,
            maxAcceptableDiff: 56,
            maxRescueDiff: 74,
            maxArchDrift: 0.86,
        };
    }

    return {
        coveragePct,
        meanLum,
        darkPct,
        brightPct,
        mode: 'refine',
        context,
        defects,
        targetDarkLift: context === 'face' ? 2.4 : 2.8,
        targetDiffMin: 4,
        targetDiffMax: context === 'face' ? 14 : 16,
        maxAcceptableDiff: context === 'face' ? 45 : 48,
        maxRescueDiff: context === 'face' ? 64 : 68,
        maxArchDrift: context === 'face' ? 0.68 : 0.74,
    };
}

async function computeMaskMetrics(
    originalDataUrl: string,
    generatedDataUrl: string,
    maskDataUrl: string
): Promise<MaskMetrics> {
    const original = parseDataUrl(originalDataUrl).buffer;
    const generated = parseDataUrl(generatedDataUrl).buffer;
    const mask = parseDataUrl(maskDataUrl).buffer;

    const base = sharp(original).ensureAlpha();
    const meta = await base.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) {
        return {
            maskedDiff: Number.POSITIVE_INFINITY,
            darkLift: 0,
            toothGain: 0,
            archDrift: Number.POSITIVE_INFINITY,
            outsideDiffPct: 100,
        };
    }

    const sanitizedMask = await sanitizeMask(maskDataUrl, width, height);

    const origRaw = await base.raw().toBuffer();
    const genRaw = await sharp(generated).ensureAlpha().resize(width, height).raw().toBuffer();
    const maskRaw = await sharp(sanitizedMask).ensureAlpha().resize(width, height).raw().toBuffer();

    let totalDiff = 0;
    let covered = 0;
    let darkLiftAcc = 0;
    let darkCovered = 0;
    let toothGainAcc = 0;
    let toothGainCovered = 0;
    let outsideChanged = 0;
    let outsideCount = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    const origToothMinY = new Array<number>(width).fill(Number.POSITIVE_INFINITY);
    const origToothMaxY = new Array<number>(width).fill(-1);
    const genToothMinY = new Array<number>(width).fill(Number.POSITIVE_INFINITY);
    const genToothMaxY = new Array<number>(width).fill(-1);
    let origToothCols = 0;
    let genToothCols = 0;

    for (let i = 0; i < origRaw.length; i += 4) {
        const alpha = maskRaw[i + 3];
        const or = origRaw[i];
        const og = origRaw[i + 1];
        const ob = origRaw[i + 2];
        const gr = genRaw[i];
        const gg = genRaw[i + 1];
        const gb = genRaw[i + 2];

        if (alpha < 20) {
            outsideCount += 1;
            const outsideDiff = (Math.abs(or - gr) + Math.abs(og - gg) + Math.abs(ob - gb)) / 3;
            if (outsideDiff > 1.2) outsideChanged += 1;
            continue;
        }

        const px = i / 4;
        const x = px % width;
        const y = Math.floor(px / width);

        const channelDiff = Math.abs(or - gr) + Math.abs(og - gg) + Math.abs(ob - gb);
        totalDiff += channelDiff / 3;
        covered += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        const oLum = luminance(or, og, ob);
        const gLum = luminance(gr, gg, gb);

        if (oLum < 125) {
            darkLiftAcc += Math.max(0, gLum - oLum);
            darkCovered += 1;
        }

        const oIsToothCandidate =
            oLum >= 48 &&
            oLum <= 190 &&
            Math.abs(or - og) < 42 &&
            Math.abs(og - ob) < 42 &&
            !isLikelyLipColor(or, og, ob, oLum);
        const gIsToothCandidate =
            gLum >= 58 &&
            gLum <= 230 &&
            Math.abs(gr - gg) < 36 &&
            Math.abs(gg - gb) < 36 &&
            !isLikelyLipColor(gr, gg, gb, gLum);

        if (oIsToothCandidate) {
            toothGainCovered += 1;
            if (gIsToothCandidate) toothGainAcc += 1;
            if (y < origToothMinY[x]) origToothMinY[x] = y;
            if (y > origToothMaxY[x]) origToothMaxY[x] = y;
        }

        if (gIsToothCandidate) {
            if (y < genToothMinY[x]) genToothMinY[x] = y;
            if (y > genToothMaxY[x]) genToothMaxY[x] = y;
        }
    }

    if (covered === 0 || maxX < minX || maxY < minY) {
        return {
            maskedDiff: Number.POSITIVE_INFINITY,
            darkLift: 0,
            toothGain: 0,
            archDrift: Number.POSITIVE_INFINITY,
            outsideDiffPct: outsideCount > 0 ? (outsideChanged / outsideCount) * 100 : 0,
        };
    }

    let comparableCols = 0;
    let topDriftAcc = 0;
    let bottomDriftAcc = 0;
    for (let x = minX; x <= maxX; x++) {
        const hasOrig = origToothMinY[x] <= origToothMaxY[x];
        const hasGen = genToothMinY[x] <= genToothMaxY[x];
        if (hasOrig) origToothCols += 1;
        if (hasGen) genToothCols += 1;
        if (hasOrig && hasGen) {
            comparableCols += 1;
            topDriftAcc += Math.abs(origToothMinY[x] - genToothMinY[x]);
            bottomDriftAcc += Math.abs(origToothMaxY[x] - genToothMaxY[x]);
        }
    }

    const boxHeight = Math.max(1, maxY - minY + 1);
    const normalizedEdgeDrift =
        comparableCols > 0
            ? (topDriftAcc + bottomDriftAcc) / (comparableCols * Math.max(2.2, boxHeight * 0.22))
            : 1.2;
    const spanRatioDelta = Math.abs(genToothCols - origToothCols) / Math.max(1, origToothCols);
    const archDrift = normalizedEdgeDrift + spanRatioDelta * 0.95;

    return {
        maskedDiff: totalDiff / covered,
        darkLift: darkCovered > 0 ? darkLiftAcc / darkCovered : 0,
        toothGain: toothGainCovered > 0 ? toothGainAcc / toothGainCovered : 0,
        archDrift,
        outsideDiffPct: outsideCount > 0 ? (outsideChanged / outsideCount) * 100 : 0,
    };
}

// Retired: blendEditedRegion, applyLocalCavityEnhancer, scoreBlendCandidate, selectBestLocalBlendVariant, formatCloudflareError, getContextInstruction, buildPayload, parseCloudflareImageResponse, formatModelslabError, and extractModelslabOutputUrl are retired in favor of native full-image inpainting.

async function parseRemoteImageAsDataUrl(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch generated image URL: ${response.status}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) {
        throw new Error('Modelslab output image was empty.');
    }

    const contentType = response.headers.get('content-type') ?? '';
    let mime = contentType.startsWith('image/') ? contentType.split(';')[0] : 'image/png';
    if (!mime.startsWith('image/')) {
        const sniffed = detectImageMime(bytes);
        if (sniffed.startsWith('image/')) mime = sniffed;
    }

    return toDataUrl(mime, bytes);
}



/**
 * FLUX.1-Fill-dev via HuggingFace Space (free ZeroGPU).
 * Uses @gradio/client to call the official black-forest-labs Space.
 * Returns the same {imageUrl, debug} shape as runModelslabModel.
 */
async function runFluxHFModel(
    input: GenerateInput,
    attempt: AttemptConfig,
    analysis: MouthAnalysis
): Promise<{ imageUrl: string; debug: string }> {
    const hfToken = process.env.HF_TOKEN;
    if (!hfToken) {
        throw new Error('HF_TOKEN missing. Set HF_TOKEN in .env.local for FLUX.1 access.');
    }

    const tuned = tuneAttemptForSingleCall(attempt, analysis);

    // Get original image and mask buffers
    const originalImageBuf = parseDataUrl(input.imageBase64).buffer;
    const originalMaskBuf = parseDataUrl(input.maskBase64).buffer;

    const img = sharp(originalImageBuf).ensureAlpha();
    const meta = await img.metadata();
    const origW = meta.width ?? 0;
    const origH = meta.height ?? 0;
    if (!origW || !origH) {
        throw new Error('Invalid image dimensions for inference.');
    }

    // Determine target size (max 1024px, multiple of 8)
    const maxDim = 1024;
    let scale = 1;
    if (Math.max(origW, origH) > maxDim) {
        scale = maxDim / Math.max(origW, origH);
    }
    const requestWidth = Math.round((origW * scale) / 8) * 8;
    const requestHeight = Math.round((origH * scale) / 8) * 8;

    // Resize input image to the target dimensions
    const resizedImageBuf = await img
        .resize(requestWidth, requestHeight, { fit: 'fill' })
        .png()
        .toBuffer();
    const resizedImageDataUrl = toDataUrl('image/png', resizedImageBuf);
    await writeDebugImage('01-hf-full-input', resizedImageDataUrl);

    // Convert transparent mask to a clean black-and-white (non-transparent) mask at target size
    const flatMaskBuffer = await sharp({
        create: {
            width: origW,
            height: origH,
            channels: 3,
            background: { r: 0, g: 0, b: 0 }
        }
    })
    .composite([{ input: originalMaskBuf, blend: 'over' }])
    .png()
    .toBuffer();

    const resizedMaskBuf = await sharp(flatMaskBuffer)
        .resize(requestWidth, requestHeight, { fit: 'fill' })
        .png()
        .toBuffer();
    const resizedMaskDataUrl = toDataUrl('image/png', resizedMaskBuf);
    await writeDebugImage('03-hf-full-mask', resizedMaskDataUrl);

    // Convert data URLs to Blobs for Gradio client
    const imageFile = new Blob([new Uint8Array(resizedImageBuf)], { type: 'image/png' });
    const maskFile = new Blob([new Uint8Array(resizedMaskBuf)], { type: 'image/png' });

    // Build dental-specific prompt
    const analysisInstruction =
        analysis.mode === 'reconstruct'
            ? 'Reconstruct missing or broken teeth with realistic anatomy and preserve smile geometry.'
            : analysis.mode === 'restore'
                ? 'Restore misalignment, chips, and discoloration while preserving natural lip contour.'
                : 'Apply subtle, realistic veneer improvements while keeping existing expression unchanged.';
    const defectInstruction = buildDefectInstruction(analysis.defects);

    const prompt = [
        'Photorealistic dental inpainting.',
        'Align, restore, and whiten teeth strictly within the masked region.',
        'Do not modify the shape of the mouth, lips, or surrounding face.',
        'Keep lips, tongue, gums outside the mask, skin texture, lighting, expression, and background 100% unchanged, authentic, and seamlessly blended.',
        analysisInstruction,
        defectInstruction,
        attempt.boost,
    ].join(' ');

    // Connect to HuggingFace Space with authenticated token (ZeroGPU priority)
    console.log('[Flux HF] Connecting to FLUX.1-Fill-dev Space...');
    const client = await Client.connect(FLUX_HF_SPACE, { token: hfToken as `hf_${string}` });

    // FLUX.1-Fill-dev optimal sweet-spot: guidance scale 15.0 - 35.0 (mapped from tuned.guidance)
    const fluxGuidance = clamp(tuned.guidance * 3.0, 1.5, 30.0);
    const fluxSteps = clamp(tuned.steps, 20, 28);

    console.log(`[Flux HF] Inference: ${requestWidth}x${requestHeight}, guidance=${fluxGuidance.toFixed(1)}, steps=${fluxSteps}`);
    const result = await client.predict('/infer', {
        edit_images: {
            background: imageFile,
            layers: [maskFile],
            composite: null,
        },
        prompt,
        seed: attempt.seed,
        randomize_seed: false,
        width: requestWidth,
        height: requestHeight,
        guidance_scale: fluxGuidance,
        num_inference_steps: fluxSteps
    });

    // Extract result image — response is [ImageData{url,path}, seed]
    const resultData = result.data as unknown[];
    if (!resultData || !resultData[0]) {
        throw new Error('Flux HF returned no output image');
    }

    const imgInfo = resultData[0] as any;
    let hfGeneratedDataUrl: string;

    if (typeof imgInfo === 'string') {
        hfGeneratedDataUrl = imgInfo.startsWith('data:image/')
            ? imgInfo
            : await parseRemoteImageAsDataUrl(imgInfo);
    } else if (typeof imgInfo?.url === 'string') {
        hfGeneratedDataUrl = await parseRemoteImageAsDataUrl(imgInfo.url);
    } else if (typeof imgInfo?.path === 'string') {
        hfGeneratedDataUrl = await parseRemoteImageAsDataUrl(imgInfo.path);
    } else {
        throw new Error(`Flux HF unexpected response: ${JSON.stringify(imgInfo).slice(0, 200)}`);
    }

    await writeDebugImage('04-flux-hf-output', hfGeneratedDataUrl);

    // Resize model output directly to the original dimensions to bypass post-processing blending
    const generatedBuf = parseDataUrl(hfGeneratedDataUrl).buffer;
    const finalCompositedBuf = await sharp(generatedBuf)
        .resize(origW, origH, { fit: 'fill', kernel: 'lanczos3' })
        .webp({ quality: 95 })
        .toBuffer();

    const finalDataUrl = toDataUrl('image/webp', finalCompositedBuf);
    await writeDebugImage('05-hf-final-composite', finalDataUrl);

    const metrics = await computeMaskMetrics(input.imageBase64, finalDataUrl, input.maskBase64);
    const debug =
        `mode=${analysis.mode};ctx=${analysis.context};provider=flux_hf;steps=${fluxSteps};` +
        `guidance=${fluxGuidance.toFixed(2)};strength=${tuned.strength.toFixed(2)};boost=${tuned.boost.toFixed(2)};` +
        `blend=native;maskedDiff=${metrics.maskedDiff.toFixed(2)};toothGain=${metrics.toothGain.toFixed(2)}`;

    return { imageUrl: finalDataUrl, debug };
}

/**
 * FLUX.1-Fill-dev via custom deployed Modal endpoint.
 * Uses direct serverless GPU endpoint (A10G).
 * Returns the same {imageUrl, debug} shape.
 */
async function runFluxModalModel(
    input: GenerateInput,
    attempt: AttemptConfig,
    analysis: MouthAnalysis
): Promise<{ imageUrl: string; debug: string }> {
    const tuned = tuneAttemptForSingleCall(attempt, analysis);

    // Get original image and mask buffers
    const originalImageBuf = parseDataUrl(input.imageBase64).buffer;
    const originalMaskBuf = parseDataUrl(input.maskBase64).buffer;

    // DEBUG: Check client mask dimensions and coverage
    const maskDebugMeta = await sharp(originalMaskBuf).metadata();
    console.log(`[MASK DEBUG] Client mask: ${maskDebugMeta.width}x${maskDebugMeta.height}, channels=${maskDebugMeta.channels}, hasAlpha=${maskDebugMeta.hasAlpha}`);
    const {data: maskDebugRaw} = await sharp(originalMaskBuf).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    let dbgWhite=0, dbgAlphaGt0=0, dbgTotal=maskDebugMeta.width*maskDebugMeta.height;
    for(let i=0; i<maskDebugRaw.length; i+=4) {
        if(maskDebugRaw[i]>128) dbgWhite++;
        if(maskDebugRaw[i+3]>0) dbgAlphaGt0++;
    }
    console.log(`[MASK DEBUG] Client mask pixels: white(R>128)=${dbgWhite} (${(dbgWhite/dbgTotal*100).toFixed(2)}%), alpha>0=${dbgAlphaGt0} (${(dbgAlphaGt0/dbgTotal*100).toFixed(2)}%)`);

    const img = sharp(originalImageBuf).ensureAlpha();
    const meta = await img.metadata();
    const origW = meta.width ?? 0;
    const origH = meta.height ?? 0;
    if (!origW || !origH) {
        throw new Error('Invalid image dimensions for inference.');
    }

    // Determine target size (max 1024px, multiple of 8)
    const maxDim = 1024;
    let scale = 1;
    if (Math.max(origW, origH) > maxDim) {
        scale = maxDim / Math.max(origW, origH);
    }
    const requestWidth = Math.round((origW * scale) / 8) * 8;
    const requestHeight = Math.round((origH * scale) / 8) * 8;

    // Resize input image to the target dimensions
    const resizedImageBuf = await img
        .resize(requestWidth, requestHeight, { fit: 'fill' })
        .png()
        .toBuffer();
    const imageB64 = resizedImageBuf.toString('base64');
    await writeDebugImage('01-modal-full-input', toDataUrl('image/png', resizedImageBuf));

    // Convert transparent mask to a clean black-and-white (non-transparent) mask at target size
    const compositedMask = await sharp({
        create: {
            width: origW,
            height: origH,
            channels: 3,
            background: { r: 0, g: 0, b: 0 }
        }
    })
    .composite([{ input: originalMaskBuf, blend: 'over' }])
    .greyscale()
    .threshold(64)  // Convert any gray (from alpha blending) to pure white
    .png()
    .toBuffer();

    const resizedMaskBuf = await sharp(compositedMask)
        .resize(requestWidth, requestHeight, { fit: 'fill' })
        .png()
        .toBuffer();
    const maskB64 = resizedMaskBuf.toString('base64');
    await writeDebugImage('03-modal-full-mask', toDataUrl('image/png', resizedMaskBuf));

    // DEBUG: Check final mask coverage
    const {data: finalMaskDbg} = await sharp(resizedMaskBuf).greyscale().raw().toBuffer({resolveWithObject: true});
    let finalWhite = 0;
    for(let i=0; i<finalMaskDbg.length; i++) { if(finalMaskDbg[i]>128) finalWhite++; }
    console.log(`[MASK DEBUG] Final mask to Modal: ${requestWidth}x${requestHeight}, white=${finalWhite} (${(finalWhite/(requestWidth*requestHeight)*100).toFixed(2)}%)`);

    // Build dental-specific prompt
    const analysisInstruction =
        analysis.mode === 'reconstruct'
            ? 'Reconstruct missing or broken teeth with realistic anatomy and preserve smile geometry.'
            : analysis.mode === 'restore'
                ? 'Restore misalignment, chips, and discoloration while preserving natural lip contour.'
                : 'Apply subtle, realistic veneer improvements while keeping existing expression unchanged.';
    const defectInstruction = buildDefectInstruction(analysis.defects);

    const prompt = [
        'Photorealistic dental inpainting.',
        'Align, restore, and whiten teeth strictly within the masked region.',
        'Do not modify the shape of the mouth, lips, or surrounding face.',
        'Keep lips, tongue, gums outside the mask, skin texture, lighting, expression, and background 100% unchanged, authentic, and seamlessly blended.',
        analysisInstruction,
        defectInstruction,
        attempt.boost,
    ].join(' ');

    const fluxGuidance = clamp(tuned.guidance * 3.0, 15.0, 35.0);
    const fluxSteps = clamp(tuned.steps, 20, 28);

    const endpoint = 'https://harunshaikh270599--dreamsmile-flux-fluxinpaint-inpaint.modal.run';
    console.log(`[Flux Modal] Triggering GPU inference at ${endpoint}...`);
    console.log(`[Flux Modal] imageB64 size: ${imageB64.length} chars, maskB64 size: ${maskB64.length} chars`);
    console.log(`[Flux Modal] Dimensions: ${requestWidth}x${requestHeight}, guidance=${fluxGuidance}, steps=${fluxSteps}`);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image: imageB64,
            mask: maskB64,
            prompt: prompt,
            guidance_scale: fluxGuidance,
            num_inference_steps: fluxSteps,
            width: requestWidth,
            height: requestHeight,
            seed: attempt.seed
        })
    });

    if (!response.ok) {
        throw new Error(`Modal GPU returned HTTP error ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    if (!result.success) {
        throw new Error(`Modal GPU pipeline failure: ${result.error}`);
    }

    const modalOutputDataUrl = `data:image/webp;base64,${result.image}`;
    await writeDebugImage('04-flux-modal-output', modalOutputDataUrl);

    // Resize model output directly to the original dimensions to bypass post-processing blending
    const generatedBuf = parseDataUrl(modalOutputDataUrl).buffer;
    const finalCompositedBuf = await sharp(generatedBuf)
        .resize(origW, origH, { fit: 'fill', kernel: 'lanczos3' })
        .webp({ quality: 95 })
        .toBuffer();

    const finalDataUrl = toDataUrl('image/webp', finalCompositedBuf);
    await writeDebugImage('05-final-composite', finalDataUrl);

    const metrics = await computeMaskMetrics(input.imageBase64, finalDataUrl, input.maskBase64);
    const debug =
        `mode=${analysis.mode};ctx=${analysis.context};provider=flux_modal;steps=${fluxSteps};` +
        `guidance=${fluxGuidance.toFixed(2)};strength=${tuned.strength.toFixed(2)};boost=${tuned.boost.toFixed(2)};` +
        `blend=native;maskedDiff=${metrics.maskedDiff.toFixed(2)};toothGain=${metrics.toothGain.toFixed(2)}`;

    return { imageUrl: finalDataUrl, debug };
}



/**
 * Calls Cloudflare Workers AI for inpainting.
 * Returns real output or throws (no fake fallback).
 */
export async function generateVeneerImage(
    input: GenerateInput
): Promise<GenerateOutput> {
    const analysis = await analyzeMouthRegion(input.imageBase64, input.maskBase64);

    const adaptedMaskBase64 = await adaptMaskForAnalysis(
        input.imageBase64,
        input.maskBase64,
        analysis
    ).catch((err) => {
        console.error('[generateVeneerImage] Failed to adapt mask:', err);
        return input.maskBase64;
    });

    const workingInput: GenerateInput = {
        ...input,
        maskBase64: adaptedMaskBase64,
    };

    const PRIMARY_PROVIDER = process.env.PRIMARY_IMAGE_PROVIDER || 'flux_modal';
    const attempt = pickTrialSafeAttempt(analysis.mode, analysis);

    if (PRIMARY_PROVIDER === 'flux_hf') {
        console.log(`[generateVeneerImage] Executing flux_hf directly...`);
        const fluxResult = await runFluxHFModel(workingInput, attempt, analysis);
        return {
            imageUrl: fluxResult.imageUrl,
            provider: 'flux_hf:FLUX.1-Fill-dev:native',
            isDemo: false,
            debug: fluxResult.debug,
        };
    }

    console.log(`[generateVeneerImage] Executing flux_modal directly...`);
    const fluxResult = await runFluxModalModel(workingInput, attempt, analysis);
    return {
        imageUrl: fluxResult.imageUrl,
        provider: 'flux_modal:FLUX.1-Fill-dev:native',
        isDemo: false,
        debug: fluxResult.debug,
    };
}
