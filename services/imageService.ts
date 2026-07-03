/**
 * Image Generation Service — GEMINI Rule 2.1
 * 100% business logic. No HTTP, no request/response objects.
 * Unit-testable.
 */
import { generateVeneerImage } from '@/lib/gradioAdapter';
import sharp from 'sharp';

// GEMINI Rule 5.2 — Whitelist allowed values
const ALLOWED_STYLES = ['hollywood', 'natural', 'ivory'] as const;
type VeneerStyle = typeof ALLOWED_STYLES[number];

// GEMINI Rule 6.3 — MIME type whitelist
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const SKIP_BLUR_PREFLIGHT = process.env.SKIP_BLUR_PREFLIGHT === 'true';

interface GenerateInput {
    imageBase64: string;
    maskBase64: string;
    style: string;
}

interface ServiceResult<T> {
    success: boolean;
    data?: T;
    error?: { code: string; message: string };
}

/**
 * Validates the input MIME type from a base64 data URL.
 */
function extractMimeType(dataUrl: string): string | null {
    const match = dataUrl.match(/^data:(image\/\w+);base64,/);
    return match ? match[1] : null;
}

/**
 * Rough size estimation from base64 string.
 */
function estimateBase64Size(dataUrl: string): number {
    const base64 = dataUrl.split(',')[1] ?? '';
    return Math.floor((base64.length * 3) / 4);
}

function parseDataUrlBuffer(dataUrl: string): Buffer | null {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    const b64 = dataUrl.slice(comma + 1);
    if (!b64) return null;
    try {
        return Buffer.from(b64, 'base64');
    } catch {
        return null;
    }
}

function luminance(r: number, g: number, b: number): number {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function chroma(r: number, g: number, b: number): number {
    return Math.max(r, g, b) - Math.min(r, g, b);
}

function isLikelyLipColor(r: number, g: number, b: number, lum: number): boolean {
    return lum > 62 && r > g + 12 && r > b + 18;
}

async function runInputPreflight(
    imageDataUrl: string,
    maskDataUrl: string
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
    const imageBuffer = parseDataUrlBuffer(imageDataUrl);
    const maskBuffer = parseDataUrlBuffer(maskDataUrl);
    if (!imageBuffer || !maskBuffer) {
        return {
            ok: false,
            code: 'INVALID_IMAGE_DATA',
            message: 'Image data is corrupted. Please upload the photo again.',
        };
    }

    const imageMeta = await sharp(imageBuffer).ensureAlpha().metadata();
    const width = imageMeta.width ?? 0;
    const height = imageMeta.height ?? 0;
    if (!width || !height) {
        return {
            ok: false,
            code: 'INVALID_IMAGE_SIZE',
            message: 'Could not read image size. Please use a valid JPG, PNG, or WebP photo.',
        };
    }

    if (Math.min(width, height) < 220) {
        return {
            ok: false,
            code: 'IMAGE_TOO_SMALL',
            message: 'Image resolution is too low. Use a clearer, higher-resolution smiling photo.',
        };
    }

    const imageRaw = await sharp(imageBuffer).ensureAlpha().raw().toBuffer();
    const maskRaw = await sharp(maskBuffer).ensureAlpha().resize(width, height).raw().toBuffer();
    const dentalCandidate = new Uint8Array(width * height);

    let covered = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let dentalSignal = 0;
    let lumMin = 255;
    let lumMax = 0;
    let lumAcc = 0;

    for (let i = 0; i < imageRaw.length; i += 4) {
        if (maskRaw[i + 3] < 20) continue;

        const px = i / 4;
        const x = px % width;
        const y = Math.floor(px / width);
        const r = imageRaw[i];
        const g = imageRaw[i + 1];
        const b = imageRaw[i + 2];
        const lum = luminance(r, g, b);
        const chr = chroma(r, g, b);

        covered += 1;
        lumAcc += lum;
        if (lum < lumMin) lumMin = lum;
        if (lum > lumMax) lumMax = lum;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        const toothLike =
            lum >= 56 &&
            lum <= 230 &&
            chr < 95 &&
            !isLikelyLipColor(r, g, b, lum);
        const cavityLike = lum < 108 && chr < 105;
        if (toothLike || cavityLike) dentalCandidate[px] = 1;

        if (toothLike || cavityLike) dentalSignal += 1;
    }

    if (covered === 0 || maxX < minX || maxY < minY) {
        return {
            ok: false,
            code: 'MASK_EMPTY',
            message: 'Could not detect teeth region in this photo. Try a clear smile or close-up mouth photo.',
        };
    }

    const coveragePct = (covered / (width * height)) * 100;
    if (coveragePct < 0.03 || coveragePct > 52) {
        return {
            ok: false,
            code: 'MASK_INVALID',
            message: 'Detected mouth area is invalid. Please retake the photo with teeth clearly visible.',
        };
    }

    const roiW = maxX - minX + 1;
    const roiH = maxY - minY + 1;
    if (roiW < 24 || roiH < 14) {
        return {
            ok: false,
            code: 'MOUTH_REGION_TOO_SMALL',
            message: 'Teeth region is too small in the image. Move closer and keep mouth clearly visible.',
        };
    }

    const signalRatio = dentalSignal / covered;
    if (signalRatio < 0.08) {
        return {
            ok: false,
            code: 'LOW_DENTAL_SIGNAL',
            message: 'Teeth/cavity details are not clear enough. Use a front-facing, well-lit mouth photo.',
        };
    }

    const meanLum = lumAcc / covered;
    const contrastRange = lumMax - lumMin;
    if (meanLum < 54) {
        return {
            ok: false,
            code: 'TOO_DARK',
            message: 'Photo is too dark for reliable dental analysis. Add bright front light and retake.',
        };
    }
    if (contrastRange < 34) {
        return {
            ok: false,
            code: 'LOW_CONTRAST',
            message: 'Mouth area contrast is too low. Use clearer light and avoid blur or heavy filters.',
        };
    }

    // Sharpness precheck: prioritize real dental pixels to avoid false blur rejects.
    let gradAcc = 0;
    let gradCount = 0;
    const sampleStep = roiW > 420 || roiH > 260 ? 2 : 1;
    for (let y = minY; y < maxY; y += sampleStep) {
        for (let x = minX; x < maxX; x += sampleStep) {
            const idx = (y * width + x) * 4;
            const px = y * width + x;
            if (maskRaw[idx + 3] < 20 || dentalCandidate[px] === 0) continue;

            const rightIdx = (y * width + Math.min(maxX, x + 1)) * 4;
            const downIdx = (Math.min(maxY, y + 1) * width + x) * 4;
            const rightPx = y * width + Math.min(maxX, x + 1);
            const downPx = Math.min(maxY, y + 1) * width + x;
            if (
                maskRaw[rightIdx + 3] < 20 ||
                maskRaw[downIdx + 3] < 20 ||
                dentalCandidate[rightPx] === 0 ||
                dentalCandidate[downPx] === 0
            ) {
                continue;
            }

            const l0 = luminance(imageRaw[idx], imageRaw[idx + 1], imageRaw[idx + 2]);
            const lr = luminance(imageRaw[rightIdx], imageRaw[rightIdx + 1], imageRaw[rightIdx + 2]);
            const ld = luminance(imageRaw[downIdx], imageRaw[downIdx + 1], imageRaw[downIdx + 2]);
            gradAcc += (Math.abs(l0 - lr) + Math.abs(l0 - ld)) * 0.5;
            gradCount += 1;
        }
    }

    if (gradCount < 24) {
        gradAcc = 0;
        gradCount = 0;
        for (let y = minY; y < maxY; y += 2) {
            for (let x = minX; x < maxX; x += 2) {
                const idx = (y * width + x) * 4;
                if (maskRaw[idx + 3] < 20) continue;

                const rightIdx = (y * width + Math.min(maxX, x + 1)) * 4;
                const downIdx = (Math.min(maxY, y + 1) * width + x) * 4;
                if (maskRaw[rightIdx + 3] < 20 || maskRaw[downIdx + 3] < 20) continue;

                const l0 = luminance(imageRaw[idx], imageRaw[idx + 1], imageRaw[idx + 2]);
                const lr = luminance(imageRaw[rightIdx], imageRaw[rightIdx + 1], imageRaw[rightIdx + 2]);
                const ld = luminance(imageRaw[downIdx], imageRaw[downIdx + 1], imageRaw[downIdx + 2]);
                gradAcc += (Math.abs(l0 - lr) + Math.abs(l0 - ld)) * 0.5;
                gradCount += 1;
            }
        }
    }

    const meanGradient = gradCount > 0 ? gradAcc / gradCount : 0;
    let minGradient =
        signalRatio >= 0.26 ? 2.2 :
        signalRatio >= 0.18 ? 2.8 :
        signalRatio >= 0.12 ? 3.3 :
        4.1;
    if (contrastRange > 56) minGradient -= 0.4;
    minGradient = Math.max(2.0, minGradient);

    const strongDentalConfidence =
        signalRatio >= 0.16 &&
        contrastRange >= 44 &&
        covered >= 1400;

    if (!SKIP_BLUR_PREFLIGHT && meanGradient < minGradient && !strongDentalConfidence) {
        return {
            ok: false,
            code: 'BLURRY_IMAGE',
            message: 'Photo appears blurry. Keep camera steady and capture a sharp, front-facing teeth shot.',
        };
    }

    return { ok: true };
}

/**
 * Builds a veneer-focused dental prompt for inpainting.
 */
function buildPrompt(style: VeneerStyle): { prompt: string; negativePrompt: string } {
    const styleMap: Record<VeneerStyle, string> = {
        hollywood: 'Ultra-white BL1 shade porcelain veneers, high-brightness cool-toned brilliant white enamel, maximum whitening with blue-white undertone, dazzling Hollywood celebrity smile',
        natural: 'Natural A1/B1 shade veneers, subtle warm undertone with realistic enamel translucency, slight yellow-cream sub-surface scattering, believable natural-looking white teeth',
        ivory: 'Warm A2/A3 ivory shade veneers, golden-cream undertone, classic conservative smile makeover, noticeably warmer and darker than pure white, elegant understated cosmetic finish',
    };

    const basePrompt = 'Professional dental photography, close-up macro shot, extremely detailed 8k.';

    const correctiveInstruction =
        'Correcting dental imperfections: eliminating yellow stains, whitening discolored enamel, repairing chipped edges, filling gaps (diastema), and aligning crooked teeth (malocclusion) into a perfect arch.';

    const structuralInstruction =
        "Veneers fitted perfectly to the natural gingival margin (gum line). Harmonious size and shape matching the patient's facial anatomy and lip curvature. Realistic translucent porcelain texture with natural light reflection.";

    const microDetailInstruction =
        'Capture micro dental anatomy: preserve each individual tooth boundary, incisal edge geometry, tiny cracks, micro-chips, spacing nuances, gingival papilla contour, and natural translucency gradients. Avoid fused teeth and flat white slab artifacts.';

    const preservationInstruction =
        'Preserve exact facial identity, lip shape, gum contour, jawline, expression, pose, skin texture, hair, and background. Edit only visible teeth region inside mouth cavity.';

    return {
        prompt: [
            basePrompt,
            correctiveInstruction,
            structuralInstruction,
            microDetailInstruction,
            `Veneer target style: ${styleMap[style]}.`,
            preservationInstruction,
        ].join(' '),
        negativePrompt: [
            'cartoon',
            '3d render',
            'plastic teeth',
            'fake denture look',
            'overexposed white patch',
            'distorted lips',
            'gum deformation',
            'teeth outside mouth',
            'oversized teeth',
            'merged tooth block',
            'single white slab teeth',
            'loss of tooth boundaries',
            'missing interdental gaps',
            'face deformation',
            'jaw deformation',
            'closed mouth',
            'blurry',
            'painting',
            'illustration',
            'anime',
        ].join(', '),
    };
}

/**
 * Main service function: Validate → Build Prompt → Call Adapter → Return Result
 */
export async function generateSmileImage(
    input: GenerateInput
): Promise<ServiceResult<{ imageUrl: string; provider?: string; isDemo?: boolean; debug?: string }>> {
    // 1. Validate style
    const style = ALLOWED_STYLES.includes(input.style as VeneerStyle)
        ? (input.style as VeneerStyle)
        : 'hollywood';

    // 2. Validate image MIME type
    const imageMime = extractMimeType(input.imageBase64);
    if (!imageMime || !ALLOWED_MIME_TYPES.includes(imageMime)) {
        return {
            success: false,
            error: {
                code: 'INVALID_FILE_TYPE',
                message: 'Only JPEG, PNG, and WebP images are accepted.',
            },
        };
    }

    // 3. Validate file size
    const estimatedSize = estimateBase64Size(input.imageBase64);
    if (estimatedSize > MAX_FILE_SIZE_BYTES) {
        return {
            success: false,
            error: {
                code: 'FILE_TOO_LARGE',
                message: 'Image must be under 10MB.',
            },
        };
    }

    // 4. Validate mask exists
    if (!input.maskBase64 || !input.maskBase64.startsWith('data:image/')) {
        return {
            success: false,
            error: {
                code: 'INVALID_MASK',
                message: 'Mask image is missing or invalid.',
            },
        };
    }

    // 5. Preflight validation disabled for development
    // const preflight = await runInputPreflight(input.imageBase64, input.maskBase64).catch(
    //     (): { ok: false; code: string; message: string } => ({
    //         ok: false,
    //         code: 'PRECHECK_FAILED',
    //         message: 'Image precheck failed. Please try a clearer smiling or mouth close-up photo.',
    //     })
    // );
    // if (!preflight.ok) {
    //     return {
    //         success: false,
    //         error: {
    //             code: preflight.code,
    //             message: preflight.message,
    //         },
    //     };
    // }

    // 6. Build prompt
    const { prompt, negativePrompt } = buildPrompt(style);

    // 7. Call adapter
    try {
        const result = await generateVeneerImage({
            prompt,
            negativePrompt,
            imageBase64: input.imageBase64,
            maskBase64: input.maskBase64,
        });

        return {
            success: true,
            data: {
                imageUrl: result.imageUrl,
                provider: result.provider,
                isDemo: result.isDemo,
                debug: result.debug,
            },
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'AI image generation failed. Please try again.';
        console.error('[generateSmileImage] Pipeline error:', message);
        return {
            success: false,
            error: {
                code: 'GENERATION_FAILED',
                message,
            },
        };
    }
}
