import { Client } from '@gradio/client';

async function main() {
    const HF_TOKEN = process.env.HF_TOKEN || '';
    const HF_SPACE = 'black-forest-labs/FLUX.1-Fill-dev';

    try {
        console.log(`Connecting to Space: ${HF_SPACE}...`);
        const client = await Client.connect(HF_SPACE, { token: HF_TOKEN });
        console.log("Connected successfully!");
        
        // gradio client has a view_api function that returns info about endpoints
        const apiInfo = await client.view_api();
        console.log("API Info structure:");
        console.log(JSON.stringify(apiInfo, null, 2));
    } catch (err) {
        console.error("Error checking FLUX API:", err);
    }
}

main();
