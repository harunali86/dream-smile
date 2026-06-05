/**
 * Fal.ai Adapter — GEMINI Rule 2.3
 * Wraps 3rd party SDK with error handling & retries.
 * Never call Fal.ai directly from routes or components.
 */
import { fal } from '@fal-ai/client';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export interface FalGenerateInput {
    prompt: string;
    negativePrompt: string;
    imageUrl: string;
    maskUrl: string;
}

export interface FalGenerateOutput {
    imageUrl: string;
}

interface FalImageEntry {
    url?: string;
}

interface FalSubscribeResult {
    data?: {
        images?: FalImageEntry[];
    };
    images?: FalImageEntry[];
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Fal.ai Flux.1 Fill model with automatic retry on transient failures.
 */
export async function generateVeneerImage(
    input: FalGenerateInput
): Promise<FalGenerateOutput> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const falInput = {
                prompt: input.prompt,
                image_url: input.imageUrl,
                mask_url: input.maskUrl,
                num_inference_steps: 28,
                guidance_scale: 30,
                strength: 0.85,
                seed: Math.floor(Math.random() * 1000000),
                output_format: 'jpeg',
                sync_mode: true,
            } as unknown as Parameters<typeof fal.subscribe>[1]['input'];

            const result = (await fal.subscribe('fal-ai/flux-pro/v1/fill', {
                input: falInput,
            })) as FalSubscribeResult;

            const images = result.data?.images ?? result.images;

            if (!images || images.length === 0) {
                throw new Error('Fal.ai returned no images');
            }

            const imageUrl = images[0]?.url;
            if (!imageUrl) {
                throw new Error('Fal.ai returned image without URL');
            }

            return { imageUrl };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown fal.ai error';
            lastError = error instanceof Error ? error : new Error(message);
            const lowered = message.toLowerCase();

            // Check for specific billing/balance errors
            if (
                lowered.includes('402') ||
                lowered.includes('403') ||
                lowered.includes('balance') ||
                lowered.includes('payment')
            ) {
                console.warn('[FalAdapter] Billing issue detected. Falling back to Demo Mode.');
                // Return a mock result so the user can still demo the UI flow
                return { imageUrl: '/demo-result.jpg' };
            }

            // Don't retry on client errors (4xx)
            if (/\b4\d{2}\b/.test(lowered)) {
                break;
            }

            if (attempt < MAX_RETRIES) {
                await sleep(RETRY_DELAY_MS * (attempt + 1));
            }
        }
    }

    throw new Error(
        `Fal.ai generation failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastError?.message ?? 'Unknown error'}`
    );
}
