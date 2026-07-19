// Deterministic fixture data for rendering tests (no network / no token).

import type { ProfileData, ProfileDay } from '../src/github/profile';
import type { RepoNode } from '../src/github/repos';
import type { CommitRepoNode } from '../src/github/commit-langs';

// Approximate monthly contribution totals (Jul 2025 .. Jul 2026) shaped like a
// rising-then-spiking curve, distributed evenly across each month's days.
const MONTH_TARGETS: Record<string, number> = {
  '2025-6': 220, // months are 0-based: 6 = July
  '2025-7': 380,
  '2025-8': 520,
  '2025-9': 700,
  '2025-10': 560,
  '2025-11': 300,
  '2026-0': 900,
  '2026-1': 1400,
  '2026-2': 1500,
  '2026-3': 620,
  '2026-4': 260,
  '2026-5': 950,
  '2026-6': 1600,
};

export function buildContributions(): ProfileDay[] {
  const days: ProfileDay[] = [];
  const start = Date.UTC(2025, 6, 15);
  const end = Date.UTC(2026, 6, 20);
  const DAY = 24 * 60 * 60 * 1000;
  for (let t = start; t <= end; t += DAY) {
    const d = new Date(t);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const target = MONTH_TARGETS[key] ?? 300;
    const perDay = Math.max(0, Math.round(target / 30));
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, contributionCount: perDay });
  }
  return days;
}

export const PROFILE_FIXTURE: ProfileData = {
  name: 'Hunter',
  email: 'hello@hunterchen.ca',
  createdAt: '2017-09-01T00:00:00Z',
  company: null,
  location: null,
  websiteUrl: null,
  twitterUsername: null,
  totalPublicRepos: 38,
  totalStars: 1240,
  totalIssueContributions: 210,
  totalPullRequestContributions: 340,
  totalRepositoryContributions: 55,
  totalContributions: 7620,
  totalCommitContributions: 5400,
  contributions: buildContributions(),
};

// Language sizes chosen so the top-langs compact card reproduces the reference
// embed's percentages: TS 54.72, Python 21.87, Rust 13.37, Kotlin 4.06, C 3.54, Go 2.43.
const LANG_META: Record<string, { size: number; color: string }> = {
  TypeScript: { size: 54720, color: '#3178c6' },
  Python: { size: 21870, color: '#3572A5' },
  Rust: { size: 13370, color: '#dea584' },
  Kotlin: { size: 4060, color: '#A97BFF' },
  C: { size: 3540, color: '#555555' },
  Go: { size: 2430, color: '#00ADD8' },
};

function langRepo(name: string, lang: string): RepoNode {
  const meta = LANG_META[lang];
  return {
    name,
    nameWithOwner: `hunterchen7/${name}`,
    primaryLanguage: { name: lang, color: meta.color },
    languages: { edges: [{ size: meta.size, node: { name: lang, color: meta.color } }] },
  };
}

// A repo that counts toward repos-per-language (has a primary language) but does
// not affect top-langs (empty languages edges → skipped by the aggregator).
function countingRepo(name: string, lang: string): RepoNode {
  const meta = LANG_META[lang];
  return {
    name,
    nameWithOwner: `hunterchen7/${name}`,
    primaryLanguage: { name: lang, color: meta.color },
    languages: { edges: [] },
  };
}

export const REPOS_FIXTURE: RepoNode[] = [
  // one sized repo per language (drives top-langs sizes)
  langRepo('ts-lib', 'TypeScript'),
  langRepo('py-tool', 'Python'),
  langRepo('rust-cli', 'Rust'),
  langRepo('kotlin-app', 'Kotlin'),
  langRepo('c-bits', 'C'),
  langRepo('go-svc', 'Go'),
  // extra repos to give repos-per-language a distribution (TS-heavy)
  countingRepo('ts-app', 'TypeScript'),
  countingRepo('ts-web', 'TypeScript'),
  countingRepo('ts-bot', 'TypeScript'),
  countingRepo('ts-cli', 'TypeScript'),
  countingRepo('py-scripts', 'Python'),
  countingRepo('py-ml', 'Python'),
  countingRepo('rust-lib', 'Rust'),
];

export const COMMIT_LANGS_FIXTURE: CommitRepoNode[] = [
  {
    name: 'ts-lib',
    nameWithOwner: 'hunterchen7/ts-lib',
    primaryLanguage: { name: 'TypeScript', color: '#3178c6' },
    totalCount: 2100,
  },
  {
    name: 'ts-app',
    nameWithOwner: 'hunterchen7/ts-app',
    primaryLanguage: { name: 'TypeScript', color: '#3178c6' },
    totalCount: 1100,
  },
  {
    name: 'py-tool',
    nameWithOwner: 'hunterchen7/py-tool',
    primaryLanguage: { name: 'Python', color: '#3572A5' },
    totalCount: 1400,
  },
  {
    name: 'rust-cli',
    nameWithOwner: 'hunterchen7/rust-cli',
    primaryLanguage: { name: 'Rust', color: '#dea584' },
    totalCount: 600,
  },
  {
    name: 'kotlin-app',
    nameWithOwner: 'hunterchen7/kotlin-app',
    primaryLanguage: { name: 'Kotlin', color: '#A97BFF' },
    totalCount: 120,
  },
  {
    name: 'go-svc',
    nameWithOwner: 'hunterchen7/go-svc',
    primaryLanguage: { name: 'Go', color: '#00ADD8' },
    totalCount: 80,
  },
];
