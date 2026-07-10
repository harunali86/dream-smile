import { Client } from '@gradio/client';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';

function getHfToken() {
    const envPath = path.join(BASE_DIR, '.env.local');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^HF_TOKEN=(.*)$/m);
    return match[1].trim();
}

async function main() {
    try {
        const hfToken = getHfToken();
        const client = await Client.connect('black-forest-labs/FLUX.1-Fill-dev', { token: hfToken });

        console.log('--- API Info ---');
        const apiInfo = await client.view_api();
        console.log(JSON.stringify(apiInfo, null, 2));

    } catch (err) {
        console.error('❌ Error:', err);
    }
}

main();
