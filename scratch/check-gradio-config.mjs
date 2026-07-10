import { Client } from '@gradio/client';

async function run() {
    try {
        const client = await Client.connect('black-forest-labs/FLUX.1-Fill-dev');
        console.log('App components:');
        client.config.components.forEach(c => {
            if (c.props) {
                const label = c.props.label || c.props.elem_id || c.type;
                const min = c.props.minimum !== undefined ? c.props.minimum : '';
                const max = c.props.maximum !== undefined ? c.props.maximum : '';
                const value = c.props.value !== undefined ? c.props.value : '';
                console.log(`- ID: ${c.id}, Type: ${c.type}, Label: ${label}, Min: ${min}, Max: ${max}, Default: ${value}`);
            }
        });
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
