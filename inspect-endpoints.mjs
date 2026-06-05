import { Client } from '@gradio/client';

// Global Fetch Interceptor with automatic retries
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    const maxRetries = 5;
    const delay = 2000;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await originalFetch(url, options);
            return res;
        } catch (err) {
            console.warn(`[FETCH FAIL] ${url.toString()} (Attempt ${i + 1}/${maxRetries}) -> Error:`, err.message || err);
            if (i === maxRetries - 1) throw err;
            await new Promise(res => setTimeout(res, delay));
        }
    }
};

const HF_SPACE = 'black-forest-labs/FLUX.1-Fill-dev';

async function run() {
    console.log('Connecting to', HF_SPACE);
    try {
        const connectOptions = {};
        if (process.env.HF_TOKEN) {
            console.log('Using HF_TOKEN for connection...');
            connectOptions.token = process.env.HF_TOKEN;
        }
        const client = await Client.connect(HF_SPACE, connectOptions);
        console.log('Connected successfully!');
        
        console.log('Fetching API specifications...');
        const apiInfo = await client.view_api();
        console.log('API Info structure:');
        console.log(JSON.stringify(apiInfo, null, 2));
    } catch (err) {
        console.error('Connection/Execution failed:', err);
    }
}

run();
