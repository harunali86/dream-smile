import sharp from 'sharp';
import path from 'path';

async function analyze() {
  const dumpDir = '/home/harun/block/dreamsmile-ai/debug-dumps/2026-06-04T12-13-59-341Z';
  const inputPath = path.join(dumpDir, '01-modal-full-input.png');
  const maskPath = path.join(dumpDir, '03-modal-full-mask.png');
  const modalOutPath = path.join(dumpDir, '04-flux-modal-output.webp');
  const compositePath = path.join(dumpDir, '05-final-composite.webp');

  try {
    // 1. Analyze mask
    const { data: maskData, info: maskInfo } = await sharp(maskPath).raw().toBuffer({ resolveWithObject: true });
    let white = 0, black = 0, gray = 0;
    for (let i = 0; i < maskData.length; i += maskInfo.channels) {
      const val = maskData[i];
      if (val === 255) white++;
      else if (val === 0) black++;
      else gray++;
    }
    console.log('--- MASK STATISTICS ---');
    console.log(`Dimensions: ${maskInfo.width}x${maskInfo.height}`);
    console.log(`Black pixels (0): ${black}`);
    console.log(`White pixels (255): ${white}`);
    console.log(`Gray pixels (1-254): ${gray}`);
    console.log(`Mask coverage: ${((white / (white + black + gray)) * 100).toFixed(4)}%`);

    // 2. Compare Input vs Modal Output
    const inputResized = await sharp(inputPath).resize(maskInfo.width, maskInfo.height, { fit: 'fill' }).raw().toBuffer();
    const modalOutResized = await sharp(modalOutPath).resize(maskInfo.width, maskInfo.height, { fit: 'fill' }).raw().toBuffer();
    
    let diffInsideMask = 0;
    let diffOutsideMask = 0;
    let insideCount = 0;
    let outsideCount = 0;
    
    const len = Math.min(inputResized.length / 4, modalOutResized.length / 3);
    for (let i = 0; i < len; i++) {
      const isMasked = maskData[i * maskInfo.channels] > 128; // using first channel of mask
      const rDiff = Math.abs(inputResized[i * 4] - modalOutResized[i * 3]);
      const gDiff = Math.abs(inputResized[i * 4 + 1] - modalOutResized[i * 3 + 1]);
      const bDiff = Math.abs(inputResized[i * 4 + 2] - modalOutResized[i * 3 + 2]);
      const totalDiff = (rDiff + gDiff + bDiff) / 3;
      
      if (isMasked) {
        diffInsideMask += totalDiff;
        insideCount++;
      } else {
        diffOutsideMask += totalDiff;
        outsideCount++;
      }
    }
    
    console.log('\n--- INPUT VS MODAL OUTPUT ---');
    console.log(`Masked pixels count: ${insideCount}, Unmasked pixels count: ${outsideCount}`);
    console.log(`Avg diff INSIDE mask: ${(diffInsideMask / (insideCount || 1)).toFixed(4)}`);
    console.log(`Avg diff OUTSIDE mask: ${(diffOutsideMask / (outsideCount || 1)).toFixed(4)}`);

    // 3. Compare Input vs Final Composite
    const compositeResized = await sharp(compositePath).resize(maskInfo.width, maskInfo.height, { fit: 'fill' }).raw().toBuffer();
    let compInsideMask = 0;
    let compOutsideMask = 0;
    const lenComp = Math.min(inputResized.length / 4, compositeResized.length / 3);
    for (let i = 0; i < lenComp; i++) {
      const isMasked = maskData[i * maskInfo.channels] > 128;
      const rDiff = Math.abs(inputResized[i * 4] - compositeResized[i * 3]);
      const gDiff = Math.abs(inputResized[i * 4 + 1] - compositeResized[i * 3 + 1]);
      const bDiff = Math.abs(inputResized[i * 4 + 2] - compositeResized[i * 3 + 2]);
      const totalDiff = (rDiff + gDiff + bDiff) / 3;
      
      if (isMasked) {
        compInsideMask += totalDiff;
      } else {
        compOutsideMask += totalDiff;
      }
    }
    console.log('\n--- INPUT VS FINAL COMPOSITE ---');
    console.log(`Avg diff INSIDE mask: ${(compInsideMask / (insideCount || 1)).toFixed(4)}`);
    console.log(`Avg diff OUTSIDE mask: ${(compOutsideMask / (outsideCount || 1)).toFixed(4)}`);


  } catch (err) {
    console.error('Error during analysis:', err);
  }
}

analyze();
