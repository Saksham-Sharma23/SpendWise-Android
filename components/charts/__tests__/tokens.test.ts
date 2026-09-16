import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every chart colour comes from lib/theme.ts tokens (TASKS Phase 5).
 *
 * SVG does not inherit styles, so a hex written into a chart stays that colour
 * when the theme flips — a lime line glaring on a white card. This scans the
 * chart components and the Analytics screen for colour literals, so a
 * hardcoded colour fails here instead of in light mode on someone's phone.
 * Category colours are user data and arrive as props; they are not literals.
 */

const ROOT = join(__dirname, '..', '..', '..');
const DIRS = ['components/charts', 'features/analytics/components', 'features/groups/components'];

const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;

function sources(): { file: string; text: string }[] {
  return DIRS.flatMap((dir) =>
    readdirSync(join(ROOT, dir))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => ({ file: `${dir}/${f}`, text: readFileSync(join(ROOT, dir, f), 'utf8') })),
  );
}

describe('chart colours come from theme tokens', () => {
  const files = sources();

  it('finds the chart files to check', () => {
    expect(files.map((f) => f.file)).toEqual(
      expect.arrayContaining(['components/charts/AreaChart.tsx', 'components/charts/Donut.tsx']),
    );
  });

  it.each(files.map((f) => [f.file, f.text] as const))('%s has no colour literals', (_file, text) => {
    const offending = text
      .split('\n')
      .map((line, i) => ({ line: i + 1, code: line.replace(/\/\/.*$/, '') }))
      .filter(({ code }) => LITERAL.test(code));
    expect(offending).toEqual([]);
  });
});
