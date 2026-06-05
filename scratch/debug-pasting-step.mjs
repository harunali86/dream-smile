import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/harun/block/dreamsmile-ai';
const DUMP_DIR = path.join(BASE_DIR, 'debug-dumps/2026-06-01T05-06-53-150Z');

async function debugPastingStep() {
    console.log('--- START DIAGNOSTIC RUN ---');
    const fullImgPath = path.join(BASE_DIR, 'public/demo-result.jpg');
    const roiGeneratedPath = path.join(DUMP_DIR, '04-flux-roi-output.webp');
    const roiMaskPath = path.join(DUMP_DIR, '03-modal-roi-mask.png');

    const full = fs.readFileSync(fullImgPath);
    const roi = fs.readFileSync(roiGeneratedPath);
    const mask = fs.readFileSync(roiMaskPath);

    // cropMeta from the run
    const cropMeta = {
        left: 265, // Let's check from the bounds of the mask!
        top: 428,  // Wait, let's calculate actual cropMeta from the mask metadata
        width: 896,
        height: 632
    };

    const resizedRoi = await sharp(roi)
        .ensureAlpha()
        .resize(cropMeta.width, cropMeta.height, {
            fit: 'fill',
            kernel: 'lanczos3',
        })
        .png()
        .toBuffer();
    console.log(`[1] resizedRoi length: ${resizedRoi.length}`);

    const maskImg = sharp(mask);
    const metadata = await maskImg.metadata();
    console.log(`[2] Mask metadata: width=${metadata.width}, height=${metadata.height}, channels=${metadata.channels}`);

    let binaryAlpha;
    if (metadata.channels === 4 || metadata.channels === 2) {
        binaryAlpha = await maskImg
            .ensureAlpha()
            .resize(cropMeta.width, cropMeta.height, {
                fit: 'fill',
                kernel: 'nearest',
            })
            .extractChannel(metadata.channels === 2 ? 1 : 3)
            .threshold(18)
            .raw()
            .toBuffer();
    } else {
        binaryAlpha = await maskImg
            .resize(cropMeta.width, cropMeta.height, {
                fit: 'fill',
                kernel: 'nearest',
            })
            .greyscale()
            .threshold(128)
            .raw()
            .toBuffer();
    }

    let rawMaskSum = 0;
    for (let i = 0; i < binaryAlpha.length; i++) {
        rawMaskSum += binaryAlpha[i];
    }
    console.log(`[3] binaryAlpha raw buffer: length=${binaryAlpha.length}, sum=${rawMaskSum}, mean=${(rawMaskSum/binaryAlpha.length).toFixed(4)}`);

    const guardY = Math.max(6, Math.round(cropMeta.height * 0.035));
    const guardX = Math.max(4, Math.round(cropMeta.width * 0.012));
    console.log(`[4] Guard regions: guardX=${guardX}, guardY=${guardY}`);

    let activePixels = 0;
    for (let y = 0; y < cropMeta.height; y++) {
        for (let x = 0; x < cropMeta.width; x++) {
            const idx = y * cropMeta.width + x;
            if (
                y < guardY ||
                y >= cropMeta.height - guardY ||
                x < guardX ||
                x >= cropMeta.width - guardX
            ) {
                binaryAlpha[idx] = 0;
            } else if (binaryAlpha[idx] > 0) {
                activePixels++;
            }
        }
    }

    let postGuardSum = 0;
    for (let i = 0; i < binaryAlpha.length; i++) {
        postGuardSum += binaryAlpha[i];
    }
    console.log(`[5] binaryAlpha post-guard: sum=${postGuardSum}, activePixels=${activePixels}`);

    let pipeline = sharp(binaryAlpha, {
        raw: { width: cropMeta.width, height: cropMeta.height, channels: 1 },
    });

    const totalPixels = cropMeta.width * cropMeta.height;
    if (activePixels > totalPixels * 0.04) {
        console.log(`[6] Erode active: activePixels (${activePixels}) > 4% of total (${totalPixels * 0.04})`);
        pipeline = pipeline.erode(1);
    } else {
        console.log(`[6] Erode skipped: activePixels (${activePixels}) <= 4% of total (${totalPixels * 0.04})`);
    }

    const featherAlpha = await pipeline
        .blur(1.2)
        .greyscale()
        .raw()
        .toBuffer();

    console.log(`[7] featherAlpha length: ${featherAlpha.length}`);
    let featherSumBeforeMin = 0;
    for (let i = 0; i < featherAlpha.length; i++) {
        featherSumBeforeMin += featherAlpha[i];
    }
    console.log(`[7] featherAlpha before Math.min: sum=${featherSumBeforeMin}`);

    // Print sum of binaryAlpha after pipeline to see if it got cleared/mutated
    let binarySumAfterPipeline = 0;
    for (let i = 0; i < binaryAlpha.length; i++) {
        binarySumAfterPipeline += binaryAlpha[i];
    }
    console.log(`[7.1] binaryAlpha sum after pipeline: ${binarySumAfterPipeline}`);

    // Print first 5 indices where binaryAlpha > 0 and what featherAlpha is at those indices
    let printed = 0;
    for (let i = 0; i < binaryAlpha.length; i++) {
        if (binaryAlpha[i] > 0) {
            if (printed < 5) {
                console.log(`    Index ${i}: binaryAlpha=${binaryAlpha[i]}, featherAlpha=${featherAlpha[i]}`);
                printed++;
            }
        }
    }

    // Print first 5 indices where featherAlpha > 0 and what binaryAlpha is at those indices
    let printedFeather = 0;
    for (let i = 0; i < featherAlpha.length; i++) {
        if (featherAlpha[i] > 0) {
            if (printedFeather < 5) {
                console.log(`    Index ${i} (feather): featherAlpha=${featherAlpha[i]}, binaryAlpha=${binaryAlpha[i]}`);
                printedFeather++;
            }
        }
    }

    for (let i = 0; i < featherAlpha.length; i++) {
        featherAlpha[i] = Math.min(featherAlpha[i], binaryAlpha[i]);
    }

    let featherSumAfterMin = 0;
    for (let i = 0; i < featherAlpha.length; i++) {
        featherSumAfterMin += featherAlpha[i];
    }
    console.log(`[8] featherAlpha after Math.min: sum=${featherSumAfterMin}`);

    const roiRaw = await sharp(resizedRoi)
        .removeAlpha()
        .raw()
        .toBuffer();

    const maskedRaw = Buffer.alloc(cropMeta.width * cropMeta.height * 4);
    for (let p = 0, rgb = 0, rgba = 0; p < featherAlpha.length; p++, rgb += 3, rgba += 4) {
        maskedRaw[rgba] = roiRaw[rgb];
        maskedRaw[rgba + 1] = roiRaw[rgb + 1];
        maskedRaw[rgba + 2] = roiRaw[rgb + 2];
        maskedRaw[rgba + 3] = featherAlpha[p];
    }

    // Save masked ROI raw image to inspect
    const maskedRoiOut = await sharp(maskedRaw, {
        raw: { width: cropMeta.width, height: cropMeta.height, channels: 4 },
    })
        .png()
        .toBuffer();
    fs.writeFileSync(path.join(DUMP_DIR, 'debug-masked-roi.png'), maskedRoiOut);
    console.log(`[9] Saved debug-masked-roi.png`);

    // Let's perform the composition with a large canvas to avoid size issues
    const composed = await sharp({
        create: {
            width: 1000,
            height: 1000,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 1 }
        }
    })
        .composite([
            {
                input: maskedRoiOut,
                left: 0,
                top: 0,
            },
        ])
        .webp({ quality: 95 })
        .toBuffer();
    
    fs.writeFileSync(path.join(DUMP_DIR, 'debug-composed.webp'), composed);
    console.log(`[10] Saved debug-composed.webp. Output length: ${composed.length}`);
    console.log('--- END DIAGNOSTIC RUN ---');
}

debugPastingStep().catch(err => console.error(err));
