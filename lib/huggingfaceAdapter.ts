/**
 * Hugging Face Adapter — Flux.1 Fill Dev (Free, Most Realistic)
 * GEMINI Rule 2.3: Wraps 3rd party with error handling & retries.
 * 
 * Model: black-forest-labs/FLUX.1-Fill-dev
 * Best free inpainting model for photorealistic teeth editing.
 */

const HF_MODEL = 'black-forest-labs/FLUX.1-Fill-dev';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

interface HuggingFaceLoadingPayload {
    estimated_time?: number;
}

export interface HFGenerateInput {
    prompt: string;
    negativePrompt: string;
    imageBase64: string;
    maskBase64: string;
}

export interface HFGenerateOutput {
    imageUrl: string;
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strips the data URI header from a base64 string.
 * "data:image/jpeg;base64,/9j/4A..." → "/9j/4A..."
 */
function stripBase64Header(dataUrl: string): string {
    const idx = dataUrl.indexOf(',');
    return idx >= 0 ? dataUrl.substring(idx + 1) : dataUrl;
}

/**
 * Calls Hugging Face Inference API with Flux.1 Fill Dev model.
 * Falls back to Demo Mode if token is missing or billing issue.
 */
export async function generateVeneerImage(
    input: HFGenerateInput
): Promise<HFGenerateOutput> {
    const token = process.env.HF_TOKEN;
    if (!token) {
        console.warn('[HF Adapter] HF_TOKEN missing. Falling back to Demo Mode.');
        return { imageUrl: '/demo-result.jpg' };
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(
                `https://api-inference.huggingface.co/models/${HF_MODEL}`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'x-wait-for-model': 'true',
                    },
                    body: JSON.stringify({
                        inputs: input.prompt,
                        parameters: {
                            negative_prompt: input.negativePrompt,
                            num_inference_steps: 28,
                            guidance_scale: 30,
                            strength: 0.85,
                        },
                        image: stripBase64Header(input.imageBase64),
                        mask_image: stripBase64Header(input.maskBase64),
                    }),
                }
            );

            // Handle model loading (503 = cold start)
            if (response.status === 503) {
                const body = (await response.json().catch(() => ({}))) as HuggingFaceLoadingPayload;
                const waitTime = body.estimated_time ?? 30;
                console.warn(`[HF Adapter] Model loading. ETA: ${waitTime}s. Retrying...`);
                await sleep(Math.min(waitTime * 1000, 30000));
                continue;
            }

            // Handle rate limiting (429)
            if (response.status === 429) {
                console.warn('[HF Adapter] Rate limited. Waiting before retry...');
                await sleep(RETRY_DELAY_MS * (attempt + 1));
                continue;
            }

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HF API Error ${response.status}: ${errText}`);
            }

            // HF Inference API returns binary image data directly
            const imageBlob = await response.blob();
            const arrayBuffer = await imageBlob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;

            return { imageUrl: base64 };

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown Hugging Face error';
            lastError = error instanceof Error ? error : new Error(message);
            console.error(`[HF Adapter] Attempt ${attempt + 1} failed:`, message);

            // Don't retry on auth errors
            if (message.includes('401') || message.includes('403')) {
                console.warn('[HF Adapter] Auth error. Check HF_TOKEN. Falling back to Demo Mode.');
                return { imageUrl: '/demo-result.jpg' };
            }

            if (attempt < MAX_RETRIES) {
                await sleep(RETRY_DELAY_MS * (attempt + 1));
            }
        }
    }

    // All retries exhausted — fallback to demo
    console.error(`[HF Adapter] All ${MAX_RETRIES + 1} attempts failed. Falling back to Demo Mode.`);
    console.error(`[HF Adapter] Last error: ${lastError?.message}`);
    return { imageUrl: '/demo-result.jpg' };
}
