import sharp from 'sharp';
import fs from 'fs';

async function inspect() {
  const dir = '/home/harun/.gemini/antigravity/brain/b879e353-47d0-45d1-b9ed-1a49ee12a795';
  const maskPath = `${dir}/latest_run_mask.png`;
  const inputPath = `${dir}/latest_run_input.png`;
  const outputPath = `${dir}/latest_run_output.webp`;
  const compositePath = `${dir}/latest_run_composite.webp`;

  if (!fs.existsSync(maskPath)) {
    console.log('No mask file found.');
    return;
  }

  // 1. Inspect mask metadata & pixel values
  const maskMeta = await sharp(maskPath).metadata();
  console.log(`Mask dimensions: ${maskMeta.width}x${maskMeta.height}, channels: ${maskMeta.channels}`);
  
  const { data: maskRaw } = await sharp(maskPath).greyscale().raw().toBuffer({ resolveWithObject: true });
  let whitePixels = 0;
  for (let i = 0; i < maskRaw.length; i++) {
    if (maskRaw[i] > 128) whitePixels++;
  }
  console.log(`Mask white pixels (value > 128): ${whitePixels} / ${maskRaw.length} (${(whitePixels / maskRaw.length * 100).toFixed(2)}%)`);

  // 2. Compare input vs output image pixels
  const inputMeta = await sharp(inputPath).metadata();
  const outputMeta = await sharp(outputPath).metadata();
  const compositeMeta = await sharp(compositePath).metadata();

  console.log(`Input: ${inputMeta.width}x${inputMeta.height}`);
  console.log(`Output: ${outputMeta.width}x${outputMeta.height}`);
  console.log(`Composite: ${compositeMeta.width}x${compositeMeta.height}`);

  const inputResized = await sharp(inputPath).resize(512, 512, { fit: 'fill' }).greyscale().raw().toBuffer();
  const outputResized = await sharp(outputPath).resize(512, 512, { fit: 'fill' }).greyscale().raw().toBuffer();

  let diff = 0;
  for (let i = 0; i < inputResized.length; i++) {
    diff += Math.abs(inputResized[i] - outputResized[i]);
  }
  console.log(`Average pixel intensity difference (Input vs Output): ${(diff / inputResized.length).toFixed(4)}`);
}

inspect();
