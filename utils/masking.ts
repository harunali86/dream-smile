// Landmark indices for the mouth (outer and inner lips) in MediaPipe Face Mesh
const MOUTH_OUTER_INDICES = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const MOUTH_INNER_INDICES = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];

if (typeof window !== 'undefined') {
    const originalConsoleError = console.error;
    console.error = function (...args: unknown[]) {
        const msg = args.map(arg => String(arg)).join(' ');
        if (
            msg.includes('INFO: Created TensorFlow Lite') ||
            msg.includes('XNNPACK delegate')
        ) {
            return;
        }
        originalConsoleError.apply(console, args);
    };

    const originalConsoleWarn = console.warn;
    console.warn = function (...args: unknown[]) {
        const msg = args.map(arg => String(arg)).join(' ');
        if (
            msg.includes('Sets FaceBlendshapesGraph acceleration') ||
            msg.includes('OpenGL error checking')
        ) {
            return;
        }
        originalConsoleWarn.apply(console, args);
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faceLandmarkerInstance: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFaceLandmarker(modelsPath: string = '/models'): Promise<any> {
    if (faceLandmarkerInstance) {
        return faceLandmarkerInstance;
    }
    
    // Dynamic import to avoid SSR errors during Next.js build / server execution
    const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
    
    // WASM version MUST match the installed @mediapipe/tasks-vision package version (0.10.35)
    const wasmUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
    const filesetResolver = await FilesetResolver.forVisionTasks(wasmUrl);
    const modelAssetPath = `${modelsPath}/face_landmarker.task`;

    // Try GPU first for best performance, fall back to CPU for mobile/low-end devices
    try {
        faceLandmarkerInstance = await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: modelAssetPath,
                delegate: 'GPU',
            },
            runningMode: 'IMAGE',
            numFaces: 1,
        });
        console.log('[FaceLandmarker] Initialized with GPU delegate.');
    } catch (gpuError) {
        console.warn('[FaceLandmarker] GPU delegate failed, falling back to CPU:', gpuError);
        faceLandmarkerInstance = await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: modelAssetPath,
                delegate: 'CPU',
            },
            runningMode: 'IMAGE',
            numFaces: 1,
        });
        console.log('[FaceLandmarker] Initialized with CPU delegate (fallback).');
    }
    
    return faceLandmarkerInstance;
}

type Point = { x: number; y: number };

interface FallbackProfile {
    id: string;
    xStart: number;
    xEnd: number;
    yStart: number;
    yEnd: number;
    darkLumMax: number;
    darkSatMax: number;
    toothLumMin: number;
    toothLumMax: number;
    toothSatMax: number;
    lipRedDeltaG: number;
    lipRedDeltaB: number;
    widthScale: number;
    heightScale: number;
    centerYOffset: number;
    minCoverage: number;
    maxCoverage: number;
    targetCoverage: number;
}

interface FallbackScan {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    candidateCount: number;
    darkCount: number;
    toothLikeCount: number;
    score: number;
}

interface FallbackCandidate {
    profileId: string;
    dataUrl: string;
    coverage: number;
    score: number;
}

interface FaceBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

function polygonCenter(points: Point[]): Point {
    if (!points.length) return { x: 0, y: 0 };

    const total = points.reduce(
        (acc, p) => {
            acc.x += p.x;
            acc.y += p.y;
            return acc;
        },
        { x: 0, y: 0 }
    );

    return {
        x: total.x / points.length,
        y: total.y / points.length,
    };
}

function scalePolygon(points: Point[], center: Point, sx: number, sy: number): Point[] {
    return points.map((p) => ({
        x: center.x + (p.x - center.x) * sx,
        y: center.y + (p.y - center.y) * sy,
    }));
}

function drawPolygon(ctx: CanvasRenderingContext2D, points: Point[]) {
    if (!points.length) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
}

function getBounds(points: Point[]) {
    return {
        minX: Math.min(...points.map((p) => p.x)),
        maxX: Math.max(...points.map((p) => p.x)),
        minY: Math.min(...points.map((p) => p.y)),
        maxY: Math.max(...points.map((p) => p.y)),
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function getImageDimensions(imageElement: HTMLImageElement | HTMLVideoElement) {
    const width =
        imageElement instanceof HTMLVideoElement
            ? imageElement.videoWidth
            : imageElement.naturalWidth || imageElement.width;
    const height =
        imageElement instanceof HTMLVideoElement
            ? imageElement.videoHeight
            : imageElement.naturalHeight || imageElement.height;
    return { width, height };
}

function computeCoverage(imageData: Uint8ClampedArray): number {
    let alphaCount = 0;
    for (let i = 3; i < imageData.length; i += 4) {
        if (imageData[i] > 0) alphaCount += 1;
    }
    return alphaCount / (imageData.length / 4);
}

function getAlphaBounds(
    imageData: Uint8ClampedArray,
    width: number,
    height: number
): { minX: number; minY: number; maxX: number; maxY: number; count: number } | null {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let count = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = imageData[(y * width + x) * 4 + 3];
            if (alpha <= 0) continue;
            count += 1;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }

    if (count === 0 || maxX < minX || maxY < minY) return null;
    return { minX, minY, maxX, maxY, count };
}

function isSpatiallyUsableDentalMask(
    imageData: Uint8ClampedArray,
    width: number,
    height: number
): boolean {
    const bounds = getAlphaBounds(imageData, width, height);
    if (!bounds) return false;

    const maskW = bounds.maxX - bounds.minX + 1;
    const maskH = bounds.maxY - bounds.minY + 1;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    return (
        centerY >= height * 0.28 &&
        centerY <= height * 0.82 &&
        maskW >= width * 0.08 &&
        maskH >= height * 0.018 &&
        bounds.count >= width * height * 0.0009
    );
}

function luminance(r: number, g: number, b: number): number {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function buildEllipseMask(
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    rx: number,
    ry: number,
    coverageRange: { min: number; max: number }
): { dataUrl: string; coverage: number } | null {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const clampedCx = clamp(centerX, width * 0.08, width * 0.92);
    const clampedCy = clamp(centerY, height * 0.1, height * 0.92);
    const clampedRx = clamp(rx, width * 0.06, width * 0.46);
    const clampedRy = clamp(ry, height * 0.04, height * 0.34);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'white';

    ctx.beginPath();
    ctx.ellipse(clampedCx, clampedCy, clampedRx, clampedRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // center safety clamp to avoid cheek edits
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.ellipse(clampedCx, clampedCy, clampedRx * 0.82, clampedRy * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    const coverage = computeCoverage(ctx.getImageData(0, 0, width, height).data);
    if (coverage < coverageRange.min || coverage > coverageRange.max) return null;

    return { dataUrl: canvas.toDataURL('image/png'), coverage };
}

function buildFaceBoxMask(width: number, height: number, faceBox: FaceBox): string | null {
    const cx = faceBox.x + faceBox.width * 0.5;
    const cy = faceBox.y + faceBox.height * 0.73;
    const rx = faceBox.width * 0.25;
    const ry = faceBox.height * 0.14;

    const mask = buildEllipseMask(width, height, cx, cy, rx, ry, {
        min: 0.0006,
        max: 0.28,
    });
    if (!mask) return null;

    console.log(`[Mask:FALLBACK] profile=face-box coverage=${(mask.coverage * 100).toFixed(2)}%`);
    return mask.dataUrl;
}

function buildDefaultMouthMask(width: number, height: number): string | null {
    const cx = width * 0.5;
    const cy = height * 0.66;
    const rx = width * 0.17;
    const ry = height * 0.1;

    const mask = buildEllipseMask(width, height, cx, cy, rx, ry, {
        min: 0.0006,
        max: 0.3,
    });
    if (!mask) return null;

    console.log(`[Mask:FALLBACK] profile=default coverage=${(mask.coverage * 100).toFixed(2)}%`);
    return mask.dataUrl;
}

function buildSafeCentralDentalMask(
    width: number,
    height: number,
    faceBox?: FaceBox
): string | null {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const cx = faceBox ? faceBox.x + faceBox.width * 0.5 : width * 0.5;
    const cy = faceBox ? faceBox.y + faceBox.height * 0.63 : height * 0.58;
    const rx = faceBox ? faceBox.width * 0.16 : width * 0.13;
    const ry = faceBox ? faceBox.height * 0.045 : height * 0.035;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.ellipse(
        clamp(cx, width * 0.18, width * 0.82),
        clamp(cy, height * 0.2, height * 0.82),
        clamp(rx, width * 0.045, width * 0.18),
        clamp(ry, height * 0.012, height * 0.06),
        0,
        0,
        Math.PI * 2
    );
    ctx.fill();

    return canvas.toDataURL('image/png');
}

const FALLBACK_PROFILES: FallbackProfile[] = [
    {
        id: 'face-wide',
        xStart: 0.12,
        xEnd: 0.88,
        yStart: 0.24,
        yEnd: 0.9,
        darkLumMax: 92,
        darkSatMax: 96,
        toothLumMin: 128,
        toothLumMax: 238,
        toothSatMax: 72,
        lipRedDeltaG: 10,
        lipRedDeltaB: 16,
        widthScale: 1.24,
        heightScale: 1.34,
        centerYOffset: 0.08,
        minCoverage: 0.0006,
        maxCoverage: 0.24,
        targetCoverage: 0.035,
    },
    {
        id: 'closeup-mouth',
        xStart: 0.04,
        xEnd: 0.96,
        yStart: 0.12,
        yEnd: 0.96,
        darkLumMax: 102,
        darkSatMax: 112,
        toothLumMin: 120,
        toothLumMax: 245,
        toothSatMax: 88,
        lipRedDeltaG: 8,
        lipRedDeltaB: 14,
        widthScale: 1.18,
        heightScale: 1.24,
        centerYOffset: 0.05,
        minCoverage: 0.001,
        maxCoverage: 0.42,
        targetCoverage: 0.12,
    },
    {
        id: 'teeth-only',
        xStart: 0.08,
        xEnd: 0.92,
        yStart: 0.18,
        yEnd: 0.94,
        darkLumMax: 108,
        darkSatMax: 126,
        toothLumMin: 112,
        toothLumMax: 248,
        toothSatMax: 104,
        lipRedDeltaG: 6,
        lipRedDeltaB: 10,
        widthScale: 1.14,
        heightScale: 1.2,
        centerYOffset: 0.04,
        minCoverage: 0.0012,
        maxCoverage: 0.46,
        targetCoverage: 0.14,
    },
];

function scanFallbackRegion(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    profile: FallbackProfile
): FallbackScan | null {
    const xStart = Math.floor(width * profile.xStart);
    const xEnd = Math.ceil(width * profile.xEnd);
    const yStart = Math.floor(height * profile.yStart);
    const yEnd = Math.ceil(height * profile.yEnd);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let candidateCount = 0;
    let darkCount = 0;
    let toothLikeCount = 0;
    let score = 0;

    for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
            const idx = (y * width + x) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            const lum = luminance(r, g, b);
            const saturation = Math.max(r, g, b) - Math.min(r, g, b);

            const isDarkCavity = lum < profile.darkLumMax && saturation < profile.darkSatMax;
            const isToothLike =
                lum > profile.toothLumMin &&
                lum < profile.toothLumMax &&
                saturation < profile.toothSatMax;
            const isLipLike =
                lum > 58 &&
                r > g + profile.lipRedDeltaG &&
                r > b + profile.lipRedDeltaB;

            if ((isDarkCavity || isToothLike) && !isLipLike) {
                candidateCount += 1;
                if (isDarkCavity) {
                    darkCount += 1;
                    score += 1.7;
                }
                if (isToothLike) {
                    toothLikeCount += 1;
                    score += 1.0;
                }

                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    const regionArea = Math.max(1, (xEnd - xStart) * (yEnd - yStart));
    const minCandidates = Math.max(55, Math.floor(regionArea * 0.00035));

    if (candidateCount < minCandidates || maxX <= minX || maxY <= minY) {
        return null;
    }

    return {
        minX,
        maxX,
        minY,
        maxY,
        candidateCount,
        darkCount,
        toothLikeCount,
        score,
    };
}

function buildFallbackMaskCandidate(
    width: number,
    height: number,
    scan: FallbackScan,
    profile: FallbackProfile
): FallbackCandidate | null {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return null;

    maskCtx.clearRect(0, 0, width, height);
    maskCtx.fillStyle = 'white';

    const bw = scan.maxX - scan.minX + 1;
    const bh = scan.maxY - scan.minY + 1;

    const centerX = (scan.minX + scan.maxX) / 2;
    let centerY = (scan.minY + scan.maxY) / 2 + bh * profile.centerYOffset;

    const cavityRatio = scan.darkCount / Math.max(1, scan.candidateCount);

    const mouthW = clamp(bw * profile.widthScale, width * 0.16, width * 0.88);
    let mouthH = clamp(bh * profile.heightScale, height * 0.07, height * 0.58);

    // If cavity is weak and mostly teeth are visible, constrain vertical spread.
    if (cavityRatio < 0.06 && scan.toothLikeCount > scan.darkCount * 6) {
        mouthH *= 0.78;
        centerY -= bh * 0.05;
    }

    // If cavity is strong, allow slightly deeper inner-mouth coverage.
    if (cavityRatio > 0.22) {
        mouthH *= 1.05;
        centerY += bh * 0.03;
    }

    centerY = clamp(centerY, height * 0.15, height * 0.9);

    const rx = mouthW / 2;
    const ry = mouthH / 2;

    maskCtx.beginPath();
    maskCtx.ellipse(centerX, centerY, rx, ry, 0, 0, Math.PI * 2);
    maskCtx.fill();

    // Center clamp: keep edits inside cavity and avoid cheek/lip corners.
    maskCtx.globalCompositeOperation = 'destination-in';
    maskCtx.beginPath();
    maskCtx.ellipse(centerX, centerY, rx * 0.8, ry * 0.92, 0, 0, Math.PI * 2);
    maskCtx.fill();
    maskCtx.globalCompositeOperation = 'source-over';

    const coverage = computeCoverage(maskCtx.getImageData(0, 0, width, height).data);
    if (coverage < profile.minCoverage || coverage > profile.maxCoverage) {
        return null;
    }

    const coverageFit = 1 - Math.min(1, Math.abs(coverage - profile.targetCoverage) / profile.targetCoverage);
    const qualityScore =
        scan.score +
        scan.candidateCount * 0.02 +
        scan.darkCount * 0.2 +
        coverageFit * 120;

    return {
        profileId: profile.id,
        dataUrl: maskCanvas.toDataURL('image/png'),
        coverage,
        score: qualityScore,
    };
}

function buildFallbackMouthMask(
    imageElement: HTMLImageElement | HTMLVideoElement,
    width: number,
    height: number,
    faceBox?: FaceBox
): string | null {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceCtx = sourceCanvas.getContext('2d');
    if (!sourceCtx) return null;

    sourceCtx.drawImage(imageElement, 0, 0, width, height);
    const pixels = sourceCtx.getImageData(0, 0, width, height).data;

    const candidates: FallbackCandidate[] = [];

    for (const profile of FALLBACK_PROFILES) {
        const scan = scanFallbackRegion(pixels, width, height, profile);
        if (!scan) continue;

        const candidate = buildFallbackMaskCandidate(width, height, scan, profile);
        if (!candidate) continue;

        candidates.push(candidate);
    }

    if (candidates.length === 0) {
        console.warn('[Mask:FALLBACK] No valid fallback candidate found.');
        return buildSafeCentralDentalMask(width, height, faceBox) ??
            (faceBox ? buildFaceBoxMask(width, height, faceBox) : null) ??
            buildDefaultMouthMask(width, height);
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    console.log(
        `[Mask:FALLBACK] profile=${best.profileId} coverage=${(best.coverage * 100).toFixed(2)}% score=${best.score.toFixed(2)}`
    );

    return best.dataUrl;
}

/**
 * Detects the mouth region in an image and generates a binary mask.
 * The mask keeps background transparent and marks inpaint region with opaque white.
 */
export async function generateMouthMask(
    imageElement: HTMLImageElement | HTMLVideoElement,
    modelsPath: string = '/models'
): Promise<string | null> {
    try {
        const { width, height } = getImageDimensions(imageElement);
        if (!width || !height) {
            console.warn('Invalid image dimensions for mask:', { width, height });
            return null;
        }

        let landmarksPoints: Point[] = [];
        let faceBox: FaceBox | null = null;

        try {
            const landmarker = await getFaceLandmarker(modelsPath);
            const result = landmarker.detect(imageElement);

            if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
                const landmarks = result.faceLandmarks[0];
                
                const xs = landmarks.map((l: { x: number }) => l.x * width);
                const ys = landmarks.map((l: { y: number }) => l.y * height);
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                
                faceBox = {
                    x: minX,
                    y: minY,
                    width: maxX - minX,
                    height: maxY - minY,
                };

                landmarksPoints = landmarks.map((l: { x: number; y: number }) => ({
                    x: l.x * width,
                    y: l.y * height,
                }));
            }
        } catch (modelError) {
            console.warn('MediaPipe Face Landmarker unavailable. Falling back to mouth-only masking.', modelError);
        }

        if (landmarksPoints.length === 0) {
            console.warn('No face detected for masking. Trying mouth-only fallback.');
            return buildFallbackMouthMask(imageElement, width, height, faceBox ?? undefined);
        }

        const mouthOuterPoints = MOUTH_OUTER_INDICES.map((i) => landmarksPoints[i]);
        const mouthInnerPoints = MOUTH_INNER_INDICES.map((i) => landmarksPoints[i]);

        if (mouthInnerPoints.length < 8 || mouthOuterPoints.length < 12) {
            console.warn('Incomplete mouth landmarks for mask generation.');
            return buildFallbackMouthMask(imageElement, width, height, faceBox ?? undefined);
        }

        const canvas = document.createElement('canvas');

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Transparent background: only white alpha region should be inpainted.
        ctx.clearRect(0, 0, width, height);

        const allPoints = [...mouthOuterPoints, ...mouthInnerPoints];
        const center = polygonCenter(allPoints);

        const outerBounds = getBounds(mouthOuterPoints);
        const outerH = Math.max(1, outerBounds.maxY - outerBounds.minY);

        const { minX, maxX, minY, maxY } = getBounds(mouthInnerPoints);
        const innerW = Math.max(1, maxX - minX);
        const innerH = Math.max(1, maxY - minY);
        const opennessRatio = innerH / innerW;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centralWidthFactor = 0.98;
        const halfCentralWidth = (innerW * centralWidthFactor) / 2;
        const xMin = centerX - halfCentralWidth;
        const xMax = centerX + halfCentralWidth;

        // Drop mouth-corner influence so inpainting doesn't stretch lips.
        const innerCentral = mouthInnerPoints.map((p) => ({
            x: clamp(p.x, xMin, xMax),
            y: p.y,
        }));

        // Core region where teeth should be generated.
        const innerMask = scalePolygon(innerCentral, center, 1.15, opennessRatio > 0.38 ? 1.2 : 1.12);

        // Safety boundary: keep edits inside lip contour.
        const outerGuard = scalePolygon(mouthOuterPoints, center, 0.98, 1.04);

        ctx.fillStyle = 'white';
        drawPolygon(ctx, innerMask);
        ctx.fill();

        // Use effective height scaling to prevent teeth clipping when mouth is nearly closed
        const effectiveH = Math.max(innerH, outerH * 0.45);

        // Keep only center cavity connected for missing-teeth reconstruction.
        const ellipseCx = centerX;
        const ellipseCy = centerY + innerH * 0.02;
        const ellipseRx = Math.max(6, innerW * 0.52);
        const ellipseRy = Math.max(8, effectiveH * 0.45);

        ctx.beginPath();
        ctx.ellipse(ellipseCx, ellipseCy, ellipseRx, ellipseRy, 0, 0, Math.PI * 2);
        ctx.fill();

        // Add upper/lower arch support so alignment fixes have enough cavity area.
        const archRx = Math.max(6, innerW * (opennessRatio > 0.4 ? 0.62 : 0.58));
        const archRy = Math.max(10, effectiveH * (opennessRatio > 0.4 ? 0.32 : 0.3));
        const upperCy = centerY - effectiveH * (opennessRatio > 0.4 ? 0.2 : 0.16);
        const lowerCy = centerY + effectiveH * (opennessRatio > 0.4 ? 0.2 : 0.18);

        ctx.beginPath();
        ctx.ellipse(centerX, upperCy, archRx, archRy, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(centerX, lowerCy, archRx, archRy, 0, 0, Math.PI * 2);
        ctx.fill();

        // Clamp final region strictly inside lips.
        ctx.globalCompositeOperation = 'destination-in';
        drawPolygon(ctx, outerGuard);
        ctx.fill();

        // Final center-band clamp to avoid lip-corner edits, scaling with outerH to avoid clipping.
        ctx.beginPath();
        ctx.ellipse(
            centerX,
            centerY,
            Math.max(7, innerW * 1.02),
            Math.max(15, innerH * 1.35, outerH * 0.55),
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // Lip-stripe removal disabled — was erasing too many mask pixels (root cause of 0.1% coverage).
        ctx.globalCompositeOperation = 'source-over';

        const imageData = ctx.getImageData(0, 0, width, height).data;
        const coverage = computeCoverage(imageData);
        console.log('[Mask] Coverage:', (coverage * 100).toFixed(2) + '%');

        // Reject unusable masks: too tiny or unrealistically large.
        if (
            coverage < 0.0006 ||
            coverage > 0.46 ||
            !isSpatiallyUsableDentalMask(imageData, width, height)
        ) {
            console.warn('[Mask] Spatially invalid dental mask. Falling back to safe central dental mask.');
            return buildSafeCentralDentalMask(width, height, faceBox ?? undefined);
        }

        return canvas.toDataURL('image/png');
    } catch (error) {
        console.error('Error in generateMouthMask:', error);
        const { width, height } = getImageDimensions(imageElement);
        if (!width || !height) return null;
        return buildFallbackMouthMask(imageElement, width, height);
    }
}

// loadFaceApiModels removed in favor of getFaceLandmarker
