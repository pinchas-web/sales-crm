// מפעיל את המסך של ההדגמה מתוך תיקיית הפרויקט (כדי ש-Tailwind ימצא את הקבצים),
// גם כשמפעילים אותו מתיקייה אחרת. שימוש: node scripts/demo-vite.mjs [port]
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const port = process.argv[2] ?? '5173';
process.argv = [process.argv[0], 'vite', '--mode', 'demo', '--port', port, '--strictPort'];
await import(pathToFileURL(join(root, 'node_modules/vite/bin/vite.js')).href);
