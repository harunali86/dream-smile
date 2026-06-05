import sharp from 'sharp';

const W = 512, H = 512;
const buf = Buffer.alloc(W * H * 4, 0);
for (let y = 220; y < 350; y++) {
  for (let x = 136; x < 376; x++) {
    const idx = (y * W + x) * 4;
    buf[idx] = 255; buf[idx+1] = 255; buf[idx+2] = 255; buf[idx+3] = 255;
  }
}

const png = await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
const alpha = await sharp(png).ensureAlpha().resize(W, H).extractChannel(3).toBuffer();
let c = 0;
for (let i = 0; i < alpha.length; i++) if (alpha[i] > 0) c++;
console.log('coverage:', (c / (W * H) * 100).toFixed(2) + '%');
console.log('png size:', png.length, 'bytes');
console.log('expected white pixels:', 240 * 130, 'out of', W * H);
