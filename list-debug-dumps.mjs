import fs from 'fs/promises';
import path from 'path';

async function main() {
  try {
    const debugRoot = path.join(process.cwd(), 'debug-dumps');
    const entries = await fs.readdir(debugRoot, { withFileTypes: true });
    
    // Sort by name (which contains ISO date string) to find the most recent
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
      
    console.log("Debug directories found:", dirs);
    if (dirs.length > 0) {
      const latestDir = path.join(debugRoot, dirs[dirs.length - 1]);
      const files = await fs.readdir(latestDir);
      console.log(`Latest directory: ${dirs[dirs.length - 1]}`);
      console.log(`Files in it:`, files);
    }
  } catch (err) {
    console.error("Error reading debug-dumps:", err);
  }
}

main();
