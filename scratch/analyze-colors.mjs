import sharp from 'sharp';
import path from 'path';

const imgPath = '/home/harun/block/dreamsmile-ai/public/demo-result.jpg';

async function analyze() {
    const img = sharp(imgPath);
    const meta = await img.metadata();
    const W = meta.width;
    const H = meta.height;

    const raw = await img.ensureAlpha().raw().toBuffer();
    
    // We will sample pixels from the mouth region:
    // Gums are usually right above the top teeth (e.g., y around 40-48% of height)
    // Lips are at the top and bottom borders (e.g., y around 38-40% for upper lip, 50-55% for lower lip)
    console.log(`Image size: ${W}x${H}`);
    
    let stats = [];
    
    for (let y = Math.floor(H * 0.38); y < Math.floor(H * 0.58); y++) {
        for (let x = Math.floor(W * 0.3); x < Math.floor(W * 0.7); x++) {
            const i = (y * W + x) * 4;
            const r = raw[i];
            const g = raw[i + 1];
            const b = raw[i + 2];
            
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const chr = Math.max(r, g, b) - Math.min(r, g, b);
            
            // Check if it's pinkish/reddish
            const isReddish = r > g + 10 && r > b + 10;
            if (isReddish) {
                stats.push({ x, y, r, g, b, lum, chr });
            }
        }
    }
    
    // Sort by chroma to see high-chroma vs low-chroma reddish pixels
    stats.sort((a, b) => b.chr - a.chr);
    
    console.log(`Found ${stats.length} reddish pixels in the mouth ROI.`);
    console.log('\nTop 20 highly saturated (high chroma) reddish pixels (likely lips/lipstick):');
    for (let i = 0; i < Math.min(20, stats.length); i++) {
        const p = stats[i];
        console.log(`x: ${p.x}, y: ${p.y} | R: ${p.r}, G: ${p.g}, B: ${p.b} | Lum: ${p.lum.toFixed(1)}, Chr: ${p.chr}`);
    }
    
    // Sort by chroma ascending to see lower chroma reddish pixels (likely gums/natural tissue)
    stats.sort((a, b) => a.chr - b.chr);
    console.log('\nBottom 20 low-saturation reddish pixels with lum > 60 (likely gums/cavity border):');
    let printed = 0;
    for (let i = 0; i < stats.length && printed < 20; i++) {
        const p = stats[i];
        if (p.lum > 60 && p.chr > 10) {
            console.log(`x: ${p.x}, y: ${p.y} | R: ${p.r}, G: ${p.g}, B: ${p.b} | Lum: ${p.lum.toFixed(1)}, Chr: ${p.chr}`);
            printed++;
        }
    }
}

analyze().catch(console.error);
