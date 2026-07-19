import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderProfileDetails } from '../src/cards/profile-details';
import { renderStats } from '../src/cards/stats';
import { renderReposPerLanguage } from '../src/cards/repos-per-language';
import { renderMostCommitLanguage } from '../src/cards/most-commit-language';
import { aggregateTopLanguages, renderTopLanguages } from '../src/top-langs/top-languages';
import { PROFILE_FIXTURE, REPOS_FIXTURE, COMMIT_LANGS_FIXTURE } from './fixtures';

const OUT_DIR =
  '/private/tmp/claude-501/-Users-hunterchen-Documents-GitHub-github-readme-stats/61e5419c-a0e2-4e25-a39d-4348ea797399/scratchpad/generated';

function save(name: string, svg: string): string {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}.svg`, svg);
  return svg;
}

describe('card rendering (github_dark)', () => {
  it('profile-details', () => {
    const svg = save('profile-details', renderProfileDetails('hunterchen7', PROFILE_FIXTURE, 'github_dark'));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('width="700"');
    expect(svg).toContain('7.62k Contributions on GitHub');
    expect(svg).toContain('38 Public Repos');
    expect(svg).toContain('Joined GitHub');
    expect(svg).toContain('hunterchen7 (Hunter)');
    expect(svg).toContain('contributions in the last year');
    // area chart path present
    expect(svg).toMatch(/<path[^>]*d="M/);
    // x-axis month ticks + y-axis
    expect(svg).toMatch(/\d\d\/\d\d/);
  });

  it('stats', () => {
    const svg = save('stats', renderStats(PROFILE_FIXTURE, 'github_dark'));
    expect(svg).toContain('Total Stars:');
    expect(svg).toContain('1.2k'); // 1240
    expect(svg).toContain('Total Commits:');
    expect(svg).toContain('5.4k'); // 5400
    expect(svg).toContain('Total PRs:');
    expect(svg).toContain('340');
    expect(svg).toContain('Contributed to:');
  });

  it('repos-per-language', () => {
    const svg = save(
      'repos-per-language',
      renderReposPerLanguage(REPOS_FIXTURE, [], [], 'github_dark'),
    );
    expect(svg).toContain('Top Languages by Repo');
    expect(svg).toContain('TypeScript');
    expect(svg).toMatch(/<path[^>]*d="M/); // donut arc
  });

  it('most-commit-language', () => {
    const svg = save(
      'most-commit-language',
      renderMostCommitLanguage(COMMIT_LANGS_FIXTURE, [], [], 'github_dark'),
    );
    expect(svg).toContain('Top Languages by Commit');
    expect(svg).toContain('TypeScript');
  });

  it('top-langs (compact, reference embed params)', () => {
    const topLangs = aggregateTopLanguages(REPOS_FIXTURE, []);
    const svg = save(
      'top-langs',
      renderTopLanguages(topLangs, {
        layout: 'compact',
        hide_border: false,
        bg_color: '0D1116',
        border_color: '2E353A',
        title_color: '0267D6',
        text_color: '0267D6',
        hide: ['jupyter notebook', 'TeX', 'css', 'scss', 'HTML', 'javascript', 'html'],
      }),
    );
    expect(svg).toContain('Most Used Languages');
    expect(svg).toContain('width="300"');
    expect(svg).toContain('Python 21.87%');
    expect(svg).toContain('Rust 13.37%');
    expect(svg).toContain('rect-mask');
    // colors applied
    expect(svg).toContain('#0D1116');
    expect(svg).toContain('#0267D6');
  });

  it('repos-per-language empty state', () => {
    const svg = renderReposPerLanguage([], [], [], 'github_dark');
    expect(svg).toContain('There are no');
    expect(svg).toContain('repos to show');
  });

  it('exclude filters languages', () => {
    // exclude typescript -> should not appear
    const svg = renderReposPerLanguage(REPOS_FIXTURE, ['typescript'], [], 'github_dark');
    expect(svg).not.toContain('>TypeScript<');
    expect(svg).toContain('Python');
  });
});
