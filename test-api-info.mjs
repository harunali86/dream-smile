import { Client } from '@gradio/client';
const client = await Client.connect('diffusers/stable-diffusion-xl-inpainting');
const info = await client.view_api();
console.log('Named endpoints:');
for (const [name, ep] of Object.entries(info.named_endpoints)) {
    console.log(`\n  Endpoint: ${name}`);
    for (const p of ep.parameters) {
        console.log(`    param: "${p.parameter_name}" (label: "${p.label}", type: ${p.type}, component: ${p.component})`);
    }
}
