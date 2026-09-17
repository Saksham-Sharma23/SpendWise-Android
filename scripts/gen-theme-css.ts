import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PALETTES } from '../lib/theme.ts';
import { buildThemeCss } from '../lib/themeCss.ts';

/**
 * Writes global.css from the palettes in lib/theme.ts.
 *
 * Run it with `npm run theme:css` after changing a colour. Node runs this
 * TypeScript directly (type stripping), so there is no build step and no new
 * dependency.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'global.css');

writeFileSync(target, buildThemeCss(PALETTES), 'utf8');
console.log(`Wrote ${target} from lib/theme.ts`);
