/**
 * Replicate Adapter — Flux.1 Fill Dev
 * GEMINI Rule 2.3: Wraps 3rd party with error handling & retries.
 *
 * Model: black-forest-labs/flux-fill-dev
 */
import Replicate from 'replicate';

const FLUX_FILL_MODEL = 'black-forest-labs/flux-fill-dev' as const;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

export interface GenerateInput {
    prompt: string;
    negativePrompt: string;
    imageBase64: string;
    maskBase64: string;
}

export interface GenerateOutput {
    imageUrl: string;
}

interface ReplicateFileLike {
    url?: string;
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Replicate API with Flux.1 Fill Dev model.
 * Falls back to Demo Mode if token is missing or auth fails.
 */
export async function generateVeneerImage(
    input: GenerateInput
): Promise<GenerateOutput> {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
        console.warn('[Replicate] No REPLICATE_API_TOKEN found. Demo Mode.');
        return { imageUrl: '/demo-result.jpg' };
    }

    console.log('[Replicate] Starting generation...');
    console.log('[Replicate] Token present:', token.substring(0, 8) + '...');
    console.log('[Replicate] Image size:', input.imageBase64.length, 'chars');
    console.log('[Replicate] Mask size:', input.maskBase64.length, 'chars');
    console.log('[Replicate] Prompt:', input.prompt.substring(0, 80) + '...');

    const replicate = new Replicate({ auth: token });
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[Replicate] Attempt ${attempt + 1}/${MAX_RETRIES + 1}...`);

            const output = await replicate.run(FLUX_FILL_MODEL, {
                input: {
                    prompt: input.prompt,
                    image: input.imageBase64,
                    mask: input.maskBase64,
                    num_inference_steps: 28,
                    guidance_scale: 30,
                    strength: 0.85,
                    output_format: 'jpg',
                },
            });

            console.log('[Replicate] Raw output type:', typeof output);
            console.log('[Replicate] Raw output:', JSON.stringify(output).substring(0, 200));

            // Replicate returns a FileOutput or array of URLs
            let imageUrl: string;

            if (typeof output === 'string') {
                imageUrl = output;
            } else if (Array.isArray(output) && output.length > 0) {
                imageUrl = String(output[0]);
            } else if (output && typeof output === 'object') {
                // FileOutput has a url() method or toString()
                const str = String(output);
                if (str.startsWith('http')) {
                    imageUrl = str;
                } else if ('url' in output) {
                    const maybe = (output as ReplicateFileLike).url;
                    imageUrl = typeof maybe === 'string' ? maybe : '';
                } else {
                    throw new Error('Unexpected output format: ' + str);
                }
            } else {
                throw new Error('Replicate returned empty/null output');
            }

            if (!imageUrl || !imageUrl.startsWith('http')) {
                throw new Error('Invalid image URL from Replicate: ' + imageUrl);
            }

            console.log('[Replicate] SUCCESS! Image URL:', imageUrl.substring(0, 80) + '...');
            return { imageUrl };

        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error('Unknown Replicate error');
            lastError = err;
            console.error(`[Replicate] Attempt ${attempt + 1} FAILED:`);
            console.error('[Replicate] Error name:', err.name);
            console.error('[Replicate] Error message:', err.message);
            console.error('[Replicate] Full error:', JSON.stringify(err, null, 2).substring(0, 500));

            // Don't retry on auth/billing errors
            const msg = (err.message || '').toLowerCase();
            if (
                msg.includes('unauthenticated') ||
                msg.includes('unauthorized') ||
                msg.includes('payment') ||
                msg.includes('billing') ||
                msg.includes('invalid api token')
            ) {
                console.error('[Replicate] AUTH ERROR. Falling back to Demo Mode.');
                return { imageUrl: '/demo-result.jpg' };
            }

            if (attempt < MAX_RETRIES) {
                console.log(`[Replicate] Retrying in ${RETRY_DELAY_MS * (attempt + 1)}ms...`);
                await sleep(RETRY_DELAY_MS * (attempt + 1));
            }
        }
    }

    // All retries exhausted — fallback to demo
    console.error(`[Replicate] ALL ${MAX_RETRIES + 1} attempts FAILED. Error: ${lastError?.message}`);
    console.error('[Replicate] Falling back to Demo Mode.');
    return { imageUrl: '/demo-result.jpg' };
}
