import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PALETTES } from '../theme';
import { CSS_TOKENS, buildThemeCss, hexToHslTriple } from '../themeCss';

/**
 * global.css is generated from lib/theme.ts (TASKS2 5C).
 *
 * The two used to be hand-synced copies of the same palette, with a comment
 * asking whoever changed one to remember the other. This test is what makes
 * that impossible: change a colour without running `npm run theme:css` and
 * the suite fails here rather than shipping two palettes that disagree.
 */

const CSS_PATH = join(__dirname, '..', '..', 'global.css');

describe('hexToHslTriple', () => {
  it('converts the greys and the brand colours', () => {
    expect(hexToHslTriple('#FFFFFF')).toBe('0 0% 100%');
    expect(hexToHslTriple('#000000')).toBe('0 0% 0%');
    // The lime, the leaf green, the emerald and the coral.
    expect(hexToHslTriple('#D4F55E')).toBe('73 88% 66%');
    expect(hexToHslTriple('#3F7D0B')).toBe('93 84% 27%');
    expect(hexToHslTriple('#08654A')).toBe('163 85% 21%');
    expect(hexToHslTriple('#F87171')).toBe('0 91% 71%');
  });

  it('accepts short hex', () => {
    expect(hexToHslTriple('#fff')).toBe('0 0% 100%');
  });

  it('puts each primary on its own hue', () => {
    expect(hexToHslTriple('#FF0000')).toBe('0 100% 50%');
    expect(hexToHslTriple('#00FF00')).toBe('120 100% 50%');
    expect(hexToHslTriple('#0000FF')).toBe('240 100% 50%');
  });
});

describe('global.css', () => {
  it('is up to date with lib/theme.ts', () => {
    const onDisk = readFileSync(CSS_PATH, 'utf8').replace(/\r\n/g, '\n');
    const generated = buildThemeCss(PALETTES).replace(/\r\n/g, '\n');
    if (onDisk !== generated) {
      throw new Error('global.css is stale. Run `npm run theme:css` to regenerate it.');
    }
    expect(onDisk).toBe(generated);
  });

  it('defines every Tailwind colour variable in both themes', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    for (const { css: name } of CSS_TOKENS) {
      // Once under :root and once under .dark:root.
      expect(css.split(`${name}:`)).toHaveLength(3);
    }
  });

  it('maps every variable to a colour token that exists', () => {
    for (const { css: name, token } of CSS_TOKENS) {
      expect(typeof PALETTES.light[token]).toBe('string');
      expect(typeof PALETTES.dark[token]).toBe('string');
      // An rgba() token would produce nonsense in a bare HSL triple.
      expect(String(PALETTES.light[token]).startsWith('#')).toBe(true);
      expect(String(PALETTES.dark[token]).startsWith('#')).toBe(true);
      expect(name.startsWith('--')).toBe(true);
    }
  });
});
