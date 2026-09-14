import { ACCENTS, PALETTES, getActiveTheme, resolveTheme, setActiveTheme, withAlpha, type Palette } from '../theme';

/**
 * The light theme is the one nobody looks at as hard as the dark one, so its
 * contrast is pinned here instead of trusted. A ratio below 4.5:1 for body
 * text is unreadable in sunlight — exactly when a light theme gets used.
 */

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const themes: [name: string, p: Palette][] = [
  ['light', PALETTES.light],
  ['dark', PALETTES.dark],
];

describe.each(themes)('%s palette — readability', (_name, p) => {
  it('body text on the page clears 4.5:1', () => {
    expect(contrast(p.foreground, p.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('body text on a card clears 4.5:1', () => {
    expect(contrast(p.foreground, p.card)).toBeGreaterThanOrEqual(4.5);
  });

  it('secondary text clears 4.5:1 on both surfaces', () => {
    expect(contrast(p.muted, p.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.muted, p.card)).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the accent clears 4.5:1 — this is what button labels use', () => {
    expect(contrast(p.onPrimary, p.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('money colours are legible on a card (3:1, they are large and bold)', () => {
    expect(contrast(p.income, p.card)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.expense, p.card)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.warning, p.card)).toBeGreaterThanOrEqual(3);
  });

  it('a card is visibly separate from the page', () => {
    // Not a WCAG rule, a design one: if the card and page are the same
    // colour the layout collapses into one flat sheet.
    expect(p.card).not.toBe(p.background);
  });

  it('income and expense are distinguishable from each other', () => {
    expect(contrast(p.income, p.expense)).toBeGreaterThan(1.3);
  });
});

describe('decorative accent hues', () => {
  it('are legible against the card of their own theme', () => {
    // These are icon glyphs, not body text, so 3:1 is the bar. The dark set
    // is far too pale on white (lime lands at 1.2:1), which is exactly why
    // there is a separate light set.
    for (const [name, pair] of Object.entries(ACCENTS)) {
      const onLight = contrast(pair.light, PALETTES.light.card);
      const onDark = contrast(pair.dark, PALETTES.dark.card);
      if (onLight < 3) throw new Error(`${name} light is ${onLight.toFixed(2)}:1 on a light card`);
      if (onDark < 3) throw new Error(`${name} dark is ${onDark.toFixed(2)}:1 on a dark card`);
    }
  });

  it('keep every hue distinct, so rows stay scannable', () => {
    const lights = Object.values(ACCENTS).map((a) => a.light);
    expect(new Set(lights).size).toBe(lights.length);
  });
});

describe('palettes are complete and consistent', () => {
  it('both define exactly the same tokens', () => {
    expect(Object.keys(PALETTES.light).sort()).toEqual(Object.keys(PALETTES.dark).sort());
  });

  it('every colour token is a usable colour string', () => {
    for (const [, p] of themes) {
      for (const [key, value] of Object.entries(p)) {
        if (key === 'shadowOpacity') {
          expect(typeof value).toBe('number');
          continue;
        }
        expect(String(value)).toMatch(/^(#[0-9A-Fa-f]{6}|rgba?\()/);
      }
    }
  });

  it('light is actually lighter than dark', () => {
    expect(luminance(PALETTES.light.background)).toBeGreaterThan(luminance(PALETTES.dark.background));
    expect(luminance(PALETTES.light.foreground)).toBeLessThan(luminance(PALETTES.dark.foreground));
  });
});

describe('resolveTheme', () => {
  it('follows the system only when the preference is "system"', () => {
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('system', 'dark')).toBe('dark');
  });

  it('ignores the system for an explicit choice', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });
});

describe('the live colors proxy', () => {
  const original = getActiveTheme();
  afterAll(() => setActiveTheme(original));

  it('reads from whichever theme is active', async () => {
    // Imported here so the module-level binding is the same proxy the app uses.
    const { colors } = await import('../theme');
    setActiveTheme('dark');
    expect(colors.background).toBe(PALETTES.dark.background);
    setActiveTheme('light');
    expect(colors.background).toBe(PALETTES.light.background);
  });

  it('does not freeze a value captured at module scope', async () => {
    const { colors } = await import('../theme');
    setActiveTheme('dark');
    const captured = { color: colors.foreground };
    setActiveTheme('light');
    // The captured PLAIN value is a snapshot (expected), but a fresh read is current.
    expect(captured.color).toBe(PALETTES.dark.foreground);
    expect(colors.foreground).toBe(PALETTES.light.foreground);
  });
});

describe('withAlpha', () => {
  it('appends an alpha channel and clamps out-of-range values', () => {
    expect(withAlpha('#FFFFFF', 1)).toBe('#FFFFFFff');
    expect(withAlpha('#000000', 0)).toBe('#00000000');
    expect(withAlpha('#123456', 2)).toBe('#123456ff');
    expect(withAlpha('#123456', -1)).toBe('#12345600');
  });
});
