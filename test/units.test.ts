import { describe, it, expect } from 'vitest';
import { abbreviateNumber } from '../src/util/format';
import { resolveTheme, sanitizeHexColor, parseThemeColorOverride } from '../src/themes/theme';
import { parseExcludeLanguages, translateLanguage } from '../src/util/translator';
import { aggregateTopLanguages } from '../src/top-langs/top-languages';
import { REPOS_FIXTURE } from './fixtures';

describe('abbreviateNumber (matches js-abbreviation-number)', () => {
  it('formats like the original', () => {
    expect(abbreviateNumber(7620, 2)).toBe('7.62k');
    expect(abbreviateNumber(38, 2)).toBe('38');
    expect(abbreviateNumber(1240, 1)).toBe('1.2k');
    expect(abbreviateNumber(5400, 1)).toBe('5.4k');
  });
});

describe('theme', () => {
  it('github_dark resolves to the expected colors', () => {
    const t = resolveTheme('github_dark');
    expect(t.background).toBe('#0d1117');
    expect(t.chart).toBe('#40c463');
    expect(t.title).toBe('#0366d6');
  });

  it('unknown theme falls back to default', () => {
    expect(resolveTheme('nope').background).toBe('#ffffff');
  });

  it('sanitizeHexColor accepts bare and #-prefixed hex, rejects junk', () => {
    expect(sanitizeHexColor('0d1117')).toBe('#0d1117');
    expect(sanitizeHexColor('#0d1117')).toBe('#0d1117');
    expect(sanitizeHexColor('fff')).toBe('#fff');
    expect(sanitizeHexColor('red')).toBeUndefined();
    expect(sanitizeHexColor('"><script>')).toBeUndefined();
  });

  it('color overrides win over the base theme', () => {
    const params = new URLSearchParams('bg_color=112233&title_color=445566');
    const override = parseThemeColorOverride(params);
    const t = resolveTheme('github_dark', override);
    expect(t.background).toBe('#112233');
    expect(t.title).toBe('#445566');
    // border falls back to base stroke
    expect(t.stroke).toBe('#2e343b');
  });
});

describe('translator', () => {
  it('maps aliases to canonical lowercase names', () => {
    expect(translateLanguage('js')).toBe('JavaScript');
    expect(translateLanguage('cs')).toBe('C#');
    expect(parseExcludeLanguages('js, TeX ,py')).toEqual(['javascript', 'tex', 'python']);
  });
});

describe('aggregateTopLanguages', () => {
  it('sums language sizes and orders by size desc', () => {
    const top = aggregateTopLanguages(REPOS_FIXTURE, []);
    const names = Object.keys(top);
    expect(names[0]).toBe('TypeScript');
    expect(top['TypeScript'].size).toBe(54720);
    expect(top['Python'].size).toBe(21870);
  });

  it('honors exclude_repo', () => {
    const top = aggregateTopLanguages(REPOS_FIXTURE, ['ts-lib']);
    // ts-lib was the only repo carrying TypeScript language edges
    expect(top['TypeScript']).toBeUndefined();
  });
});

describe('include_private toggle (public/all filtering)', () => {
  it('includes the private Go repo when counting all repos', () => {
    const all = aggregateTopLanguages(REPOS_FIXTURE, []);
    expect(all['Go']).toBeDefined();
  });

  it('drops private repos when filtered to public-only (include_private=false)', () => {
    const publicOnly = aggregateTopLanguages(
      REPOS_FIXTURE.filter((r) => !r.isPrivate),
      [],
    );
    expect(publicOnly['Go']).toBeUndefined(); // go-svc is private
    expect(publicOnly['TypeScript']).toBeDefined();
  });
});
