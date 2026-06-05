/**
 * LOCAL mask pipeline test — no Modal calls, zero credits.
 * Compares OLD (no threshold) vs NEW (threshold=64) mask flattening.
 * Uses the actual client mask from the latest debug dump.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Find the latest debug dump
const debugRoot = path.join(__dirname, '..', 'debug-dumps');
const dumps = fs.readdirSync(debugRoot).sort().reverse();
const latestDir = path.join(debugRoot, dumps[0]);

console.log(`Using debug dump: ${dumps[0]}\n`);

async function run() {
    // Step 1: Get the original mask from the latest run
    // We need the RAW client mask (before server flattening).
    // Since we only have the flattened mask, let's reconstruct:
    // Create a synthetic RGBA mask similar to what the client sends
    // (white pixels with varying alpha, representing the client canvas output)
    
    const inputMeta = await sharp(path.join(latestDir, '01-modal-full-input.png')).metadata();
    const origW = inputMeta.width;
    const origH = inputMeta.height;
    console.log(`Image dimensions: ${origW}x${origH}`);
    
    // Read the flattened mask to find where the mask area is
    const {data: flatMask, info: flatInfo} = await sharp(path.join(latestDir, '03-modal-full-mask.png'))
        .raw()
        .toBuffer({resolveWithObject: true});
    
    const ch = flatInfo.channels;
    
    // Reconstruct a client-style RGBA mask:
    // Where the flattened mask has any gray/white (R > 20), make it white with alpha = R value
    // This simulates the client canvas's semi-transparent mask
    const clientMask = Buffer.alloc(origW * origH * 4, 0);
    for (let i = 0; i < origW * origH; i++) {
        const fi = i * ch;
        const ci = i * 4;
        const r = flatMask[fi];
        if (r > 20) {
            // Client mask: white RGB, alpha = original gray value (simulating semi-transparency)
            clientMask[ci] = 255;     // R
            clientMask[ci + 1] = 255; // G
            clientMask[ci + 2] = 255; // B
            clientMask[ci + 3] = r;   // Alpha = the gray value (this is what client sends)
        }
        // else: transparent black (0,0,0,0)
    }
    
    const clientMaskPng = await sharp(clientMask, {raw: {width: origW, height: origH, channels: 4}})
        .png()
        .toBuffer();
    
    console.log('--- Synthetic client mask created (simulates RGBA white+alpha) ---\n');
    
    // ===== OLD PIPELINE (no threshold) =====
    const oldFlat = await sharp({
        create: { width: origW, height: origH, channels: 3, background: {r:0, g:0, b:0} }
    })
    .composite([{input: clientMaskPng, blend: 'over'}])
    .png()
    .toBuffer();
    
    const {data: oldBuf} = await sharp(oldFlat).raw().toBuffer({resolveWithObject: true});
    let oldWhite = 0;
    for (let i = 0; i < oldBuf.length; i += 3) {
        if (oldBuf[i] > 128) oldWhite++;
    }
    const oldCoverage = (oldWhite / (origW * origH) * 100).toFixed(2);
    
    // Sample old mask pixel values in the mask area
    let oldSamples = [];
    for (let i = 0; i < oldBuf.length && oldSamples.length < 5; i += 3) {
        if (oldBuf[i] > 20 && oldBuf[i] <= 200) {
            oldSamples.push({px: i/3, r: oldBuf[i], g: oldBuf[i+1], b: oldBuf[i+2]});
        }
    }
    
    // ===== NEW PIPELINE (with threshold=64) =====
    const newFlat = await sharp({
        create: { width: origW, height: origH, channels: 3, background: {r:0, g:0, b:0} }
    })
    .composite([{input: clientMaskPng, blend: 'over'}])
    .greyscale()
    .threshold(64)
    .png()
    .toBuffer();
    
    const {data: newBuf} = await sharp(newFlat).raw().toBuffer({resolveWithObject: true});
    let newWhite = 0;
    for (let i = 0; i < newBuf.length; i += 3) {
        if (newBuf[i] > 128) newWhite++;
    }
    const newCoverage = (newWhite / (origW * origH) * 100).toFixed(2);
    
    // ===== RESULTS =====
    console.log('========================================');
    console.log('  MASK PIPELINE COMPARISON (LOCAL TEST)');
    console.log('========================================\n');
    
    console.log('OLD pipeline (no threshold):');
    console.log(`  White pixels (>128): ${oldWhite}`);
    console.log(`  Coverage: ${oldCoverage}%`);
    console.log(`  Gray samples:`, oldSamples.map(s => `rgb(${s.r},${s.g},${s.b})`).join(', '));
    
    console.log('\nNEW pipeline (threshold=64):');
    console.log(`  White pixels (>128): ${newWhite}`);
    console.log(`  Coverage: ${newCoverage}%`);
    
    console.log('\n--- VERDICT ---');
    if (newWhite > oldWhite * 2) {
        console.log(`✅ FIX WORKS! Coverage increased from ${oldCoverage}% to ${newCoverage}%`);
        console.log(`   Mask area grew ${(newWhite/Math.max(oldWhite,1)).toFixed(1)}x`);
    } else {
        console.log(`❌ FIX DID NOT HELP. Old: ${oldCoverage}%, New: ${newCoverage}%`);
    }
    
    // Save both masks for visual comparison
    await sharp(oldFlat).toFile(path.join(latestDir, 'TEST-old-mask.png'));
    await sharp(newFlat).toFile(path.join(latestDir, 'TEST-new-mask.png'));
    console.log(`\nSaved comparison masks to ${dumps[0]}/TEST-old-mask.png and TEST-new-mask.png`);
    
    console.log('\nModal credits used: $0.00 ✅');
}

run().catch(console.error);
