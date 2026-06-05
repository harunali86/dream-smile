/**
 * Test HuggingFace Spaces (Gradio) — Truly free inpainting
 * These are community-hosted, no billing needed.
 */
import { Client } from '@gradio/client';
import fs from 'fs';

// Try multiple known inpainting spaces
const SPACES_TO_TRY = [
    'diffusers/stable-diffusion-xl-inpainting',
    'multimodalart/cosxl',
    'OzzyGT/ace-step-virtual-try-on',
];

async function testSpace(spaceName) {
    try {
        console.log(`\n--- Testing Space: ${spaceName} ---`);
        const client = await Client.connect(spaceName, { hf_token: undefined });

        // Get API info
        const info = await client.view_api();
        console.log('Available endpoints:');
        for (const [name, endpoint] of Object.entries(info.named_endpoints || {})) {
            console.log(`  ${name}: ${JSON.stringify(endpoint.parameters?.map(p => p.label))}`);
        }
        for (const [name, endpoint] of Object.entries(info.unnamed_endpoints || {})) {
            console.log(`  unnamed[${name}]: ${JSON.stringify(endpoint.parameters?.map(p => p.label))}`);
        }
        console.log('✅ Space is alive and accessible!');
        return true;
    } catch (error) {
        console.error(`❌ ${spaceName}: ${error.message}`);
        return false;
    }
}

for (const space of SPACES_TO_TRY) {
    const result = await testSpace(space);
    if (result) break;
}
