import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { aggregateTopLanguages, renderTopLanguages } from '../src/top-langs/top-languages';
import { renderProfileDetails } from '../src/cards/profile-details';
import { renderStats } from '../src/cards/stats';
import { applyAnimation, parseAnimation } from '../src/util/animation';
import { REPOS_FIXTURE, PROFILE_FIXTURE } from './fixtures';

const OUT_DIR =
  '/private/tmp/claude-501/-Users-hunterchen-Documents-GitHub-github-readme-stats/61e5419c-a0e2-4e25-a39d-4348ea797399/scratchpad/generated';

function save(name: string, svg: string): string {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}.svg`, svg);
  return svg;
}

const COLORS = {
  bg_color: '0D1116',
  border_color: '2E353A',
  title_color: '0267D6',
  text_color: '0267D6',
};

describe('top-langs layouts', () => {
  const top = aggregateTopLanguages(REPOS_FIXTURE, []);

  it('pie', () => {
    const svg = save('top-langs-pie', renderTopLanguages(top, { layout: 'pie', ...COLORS }));
    expect(svg).toContain('Most Used Languages');
    expect(svg).toContain('data-testid="lang-pie"');
  });

  it('donut', () => {
    const svg = save('top-langs-donut', renderTopLanguages(top, { layout: 'donut', ...COLORS }));
    expect(svg).toContain('data-testid="lang-donut"');
    expect(svg).toContain('TypeScript');
    expect(svg).toMatch(/\d+\.\d{2}%/); // percentage labels present
  });

  it('donut-vertical', () => {
    const svg = save(
      'top-langs-donut-vertical',
      renderTopLanguages(top, { layout: 'donut-vertical', ...COLORS }),
    );
    expect(svg).toContain('data-testid="lang-donut"');
  });

  it('normal', () => {
    const svg = save('top-langs-normal', renderTopLanguages(top, { layout: 'normal', ...COLORS }));
    expect(svg).toContain('lang-progress');
    expect(svg).toContain('TypeScript');
  });
});

describe('summary card animations', () => {
  it('emits animation hooks in the base card', () => {
    const base = renderProfileDetails('hunterchen7', PROFILE_FIXTURE, 'github_dark');
    expect(base).toContain('class="gpsc-item"');
    expect(base).toContain('class="gpsc-chart"');
    expect(base).toContain('class="gpsc-reveal"');
    expect(renderStats(PROFILE_FIXTURE, 'github_dark')).toContain('class="gpsc-item"');
  });

  it('injects CSS for a valid preset and is a no-op otherwise', () => {
    const base = renderProfileDetails('hunterchen7', PROFILE_FIXTURE, 'github_dark');
    const animated = save(
      'profile-details-draw',
      applyAnimation(base, parseAnimation('draw'), '2.5'),
    );
    expect(animated).toContain('@keyframes gpsc-wipe');
    expect(animated).toContain('prefers-reduced-motion');
    // unknown preset -> unchanged
    expect(applyAnimation(base, parseAnimation('nope'))).toBe(base);
  });
});
