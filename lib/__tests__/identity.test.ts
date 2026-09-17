import { deterministicColor, deterministicIcon } from '../identity';

/**
 * B19: matching was `name.toLowerCase().includes(key)`, so every short key in
 * KNOWN was a trap — it matched inside unrelated words. The icon is meant to
 * be a small delight; being confidently wrong is worse than a neutral choice.
 *
 * There were no tests for this file at all, which is why it went unnoticed.
 */

describe('deterministicIcon — the substring traps', () => {
  it.each([
    ['Petrol', 'paw-print', 'pet'],
    ['LinkedIn Premium', 'landmark', 'emi'],
    ['Maid', 'sparkles', 'ai'],
    ['Daily help', 'sparkles', 'ai'],
    ['Card renewal', 'car', 'car'],
    ['Parent allowance', 'house', 'rent'],
  ])('%s is not given the %s icon (it used to match "%s")', (name, wrongIcon) => {
    expect(deterministicIcon(name)).not.toBe(wrongIcon);
  });
});

describe('deterministicIcon — still recognises what it should', () => {
  it.each([
    ['Netflix', 'clapperboard'],
    ['Netflix (family plan)', 'clapperboard'],
    ['Spotify Premium', 'music'],
    ['Home loan EMI', 'landmark'],
    ['ChatGPT Plus', 'sparkles'],
    ['Gym membership', 'dumbbell'],
    ['House rent', 'house'],
    ['Car insurance', 'briefcase'],
    ['Electricity bill', 'zap'],
    ['Broadband', 'wifi'],
  ])('%s -> %s', (name, icon) => {
    expect(deterministicIcon(name)).toBe(icon);
  });

  it('matches a long key at the start of a word, for run-together brand names', () => {
    expect(deterministicIcon('Netflixfamily')).toBe('clapperboard');
    expect(deterministicIcon('spotifypremium')).toBe('music');
  });

  it('does not let a SHORT key match a prefix', () => {
    // 'car' must not claim "Cardiology"; 'pet' must not claim "Petrol".
    expect(deterministicIcon('Cardiology')).not.toBe('car');
    expect(deterministicIcon('Petroleum')).not.toBe('paw-print');
  });

  it('is case- and punctuation-insensitive', () => {
    expect(deterministicIcon('NETFLIX')).toBe('clapperboard');
    expect(deterministicIcon('netflix!')).toBe('clapperboard');
    expect(deterministicIcon('Gym — monthly')).toBe('dumbbell');
  });
});

describe('deterministicIcon / deterministicColor — stability', () => {
  it('always returns the same answer for the same name', () => {
    for (const name of ['Rahul', 'Goa trip', 'Unknown thing 42', '']) {
      expect(deterministicIcon(name)).toBe(deterministicIcon(name));
      expect(deterministicColor(name)).toBe(deterministicColor(name));
    }
  });

  it('always returns something, even for a name it cannot place', () => {
    for (const name of ['zzzz', '', '12345', '???']) {
      expect(typeof deterministicIcon(name)).toBe('string');
      expect(deterministicIcon(name).length).toBeGreaterThan(0);
      expect(deterministicColor(name)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
