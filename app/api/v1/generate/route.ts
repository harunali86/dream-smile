/**
 * POST /api/v1/generate
 * 
 * GEMINI Compliance:
 * - Rule 2.1: Controller — validation + HTTP status ONLY. No business logic.
 * - Rule 2.2: Response format { success, data, error }
 * - Rule 5.1: Rate limiting (5 req/min for sensitive endpoint)
 * - Rule 5.2: Input validation (whitelist fields)
 * - Rule 10: API versioned under /api/v1/
 */
import { NextResponse } from 'next/server';
import { generateSmileImage } from '@/services/imageService';

// --- Simple In-Memory Rate Limiter (GEMINI Rule 5.1) ---
// In production, replace with Redis-based limiter.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5; // GEMINI Rule 5.1: Sensitive endpoint = 5 req/min
const RATE_WINDOW_MS = 60 * 1000; // per minute

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return false;
    }

    entry.count += 1;
    return entry.count > RATE_LIMIT;
}

function getClientIp(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    return forwarded?.split(',')[0]?.trim() ?? 'unknown';
}

// --- Allowed fields whitelist (GEMINI Rule 5.2) ---
interface GenerateRequestBody {
    image_url: string;
    mask_url: string;
    veneer_style?: string;
}

function sanitizeBody(body: Record<string, unknown>): GenerateRequestBody | null {
    const imageUrl = typeof body.image_url === 'string' ? body.image_url : null;
    const maskUrl = typeof body.mask_url === 'string' ? body.mask_url : null;
    const veneerStyle = typeof body.veneer_style === 'string' ? body.veneer_style : 'hollywood';

    if (!imageUrl || !maskUrl) return null;

    // Strip everything except whitelisted fields
    return {
        image_url: imageUrl,
        mask_url: maskUrl,
        veneer_style: veneerStyle,
    };
}

export async function POST(request: Request) {
    try {
        // 1. Rate Limiting
        const clientIp = getClientIp(request);
        if (isRateLimited(clientIp)) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait 1 minute.' },
                },
                { status: 429 }
            );
        }

        // 2. Parse & Sanitize Input
        let rawBody: Record<string, unknown>;
        try {
            rawBody = await request.json();
        } catch {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
                },
                { status: 400 }
            );
        }

        const sanitized = sanitizeBody(rawBody);
        if (!sanitized) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: 'MISSING_FIELDS', message: 'image_url and mask_url are required.' },
                },
                { status: 400 }
            );
        }

        // 3. Delegate to Service (GEMINI Rule 2.1 — no business logic here)
        const result = await generateSmileImage({
            imageBase64: sanitized.image_url,
            maskBase64: sanitized.mask_url,
            style: sanitized.veneer_style ?? 'hollywood',
        });

        // 4. Return standardized response (GEMINI Rule 2.2)
        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 422 }
            );
        }

        return NextResponse.json({
            success: true,
            data: result.data,
        });
    } catch (error: unknown) {
        // GEMINI Rule 2.2 — No raw stack traces
        const message = error instanceof Error ? error.message : 'Unknown internal error';
        console.error('[/api/v1/generate] Unhandled error:', message);
        return NextResponse.json(
            {
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
            },
            { status: 500 }
        );
    }
}
