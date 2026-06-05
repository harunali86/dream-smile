import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// helper to simulate parseDataUrl
function parseDataUrl(url) {
    if (url.startsWith('data:')) {
        const comma = url.indexOf(',');
        const mime = url.substring(5, comma).split(';')[0];
        const data = url.substring(comma + 1);
        const buffer = Buffer.from(data, 'base64');
        return { mime, buffer };
    }
    return { mime: 'image/png', buffer: fs.readFileSync(url) };
}

async function debugPaste() {
    const BASE_DIR = '/home/harun/block/dreamsmile-ai';
    const DUMP_DIR = path.join(BASE_DIR, 'debug-dumps/2026-06-01T05-06-53-150Z');
    
    const fullImageDataUrl = path.join(BASE_DIR, 'public/demo-result.jpg');
    const roiGeneratedDataUrl = path.join(DUMP_DIR, '04-flux-roi-output.webp');
    const roiMaskDataUrl = path.join(DUMP_DIR, '03-modal-roi-mask.png');

    // These coordinates are from the actual cropMeta of the run
    // Let's find cropMeta in the code or just grep the logs if we can.
    // Wait, let's inspect metadata of the input images to reconstruct left/top/width/height!
    const origMeta = await sharp(fullImageDataUrl).metadata();
    const maskMeta = await sharp(roiMaskDataUrl).metadata();
    
    // We know from test-local-api.mjs that the mask region was: Y: [220, 350], X: [136, 376]
    // The cropMeta left/top/width/height are typically:
    // left: 136, top: 220, width: 240, height: 130 (or similar)
    // Wait, let's look at the actual metadata.
    // Let's assume left=136, top=220, width=240, height=130 for now or let's read the logs to see if we can find the exact cropMeta.
    // Actually, in the log of runFluxModalModel, the roiInput is generated and has a metadata log.
    // Let's read the debug dump meta or find it.
    // Wait, is there a meta file in the debug dump directory? Let's check with grep or look.
    // Let's use a standard bounding box. But wait, we want to know the exact meta.
    // Let's search the workspace for metadata output or logs.
}
debugPaste();
