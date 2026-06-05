import fs from 'fs';

// Global Fetch Interceptor with automatic retries for resilient Gradio/HF requests
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    const maxRetries = 5;
    const delay = 2000;
    for (let i = 0; i < maxRetries; i++) {
        console.log(`[FETCH START] ${url.toString()} (Attempt ${i + 1}/${maxRetries})`);
        try {
            const res = await originalFetch(url, options);
            console.log(`[FETCH SUCCESS] ${url.toString()} -> Status: ${res.status}`);
            return res;
        } catch (err) {
            console.warn(`[FETCH FAIL] ${url.toString()} (Attempt ${i + 1}/${maxRetries}) -> Error:`, err.message || err);
            if (i === maxRetries - 1) {
                console.error(`[FETCH FATAL] All ${maxRetries} attempts failed for ${url.toString()}`);
                throw err;
            }
            await new Promise(res => setTimeout(res, delay));
        }
    }
};

const token = process.env.HF_TOKEN;
if (!token) {
    console.error('Error: HF_TOKEN environment variable not set.');
    process.exit(1);
}

const HF_MODEL = 'black-forest-labs/FLUX.1-Fill-dev';
const imagePath = '/home/harun/block/dreamsmile-ai/public/demo-result.jpg';
const imageBase64 = fs.readFileSync(imagePath).toString('base64');
const maskBase64 = fs.readFileSync(imagePath).toString('base64'); // Using image itself as mask for quick check

async function runTest() {
    console.log(`Calling Hugging Face Inference API for model: ${HF_MODEL}...`);
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
                    inputs: 'perfect white veneers smile',
                    image: imageBase64,
                    mask_image: maskBase64,
                }),
            }
        );

        console.log(`Response Status: ${response.status}`);
        const bodyText = await response.text();
        console.log('Response body preview:', bodyText.substring(0, 1000));
    } catch (err) {
        console.error('Test Execution failed:', err);
    }
}

runTest();
