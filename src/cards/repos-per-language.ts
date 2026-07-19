import { resolveTheme, type ThemeColorOverride } from '../themes/theme';
import { createDonutChartCard, type DonutDatum } from '../templates/donut-chart-card';
import type { RepoNode } from '../github/repos';

const FALLBACK_COLOR = '#586e75';

// Count owned non-fork repos by their primary language (top 5, no rest bucket).
export function renderReposPerLanguage(
  repos: RepoNode[],
  exclude: string[],
  excludeRepos: string[],
  themeName: string,
  override?: ThemeColorOverride,
): string {
  const map = new Map<string, { value: number; color: string }>();

  for (const repo of repos) {
    if (
      excludeRepos.includes((repo.name ?? '').toLowerCase()) ||
      excludeRepos.includes((repo.nameWithOwner ?? '').toLowerCase())
    ) {
      continue;
    }
    const lang = repo.primaryLanguage;
    if (!lang || !lang.name) continue;
    if (exclude.includes(lang.name.toLowerCase())) continue;

    const existing = map.get(lang.name);
    if (existing) {
      existing.value += 1;
    } else {
      map.set(lang.name, { value: 1, color: lang.color || FALLBACK_COLOR });
    }
  }

  let data: DonutDatum[] = [...map.entries()].map(([name, v]) => ({
    name,
    value: v.value,
    color: v.color,
  }));
  data.sort((a, b) => b.value - a.value);
  data = data.slice(0, 5);

  if (data.length === 0) {
    data = [
      { name: 'There are no', value: 1, color: FALLBACK_COLOR },
      { name: 'repos to show', value: 1, color: FALLBACK_COLOR },
    ];
  }

  return createDonutChartCard('Top Languages by Repo', data, resolveTheme(themeName, override));
}
