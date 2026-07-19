import { resolveTheme, type ThemeColorOverride } from '../themes/theme';
import { createDonutChartCard, type DonutDatum } from '../templates/donut-chart-card';
import type { CommitRepoNode } from '../github/commit-langs';

const FALLBACK_COLOR = '#586e75';

// Sum commit counts per language across every repo/year (top 5, no rest bucket).
export function renderMostCommitLanguage(
  nodes: CommitRepoNode[],
  exclude: string[],
  excludeRepos: string[],
  themeName: string,
  override?: ThemeColorOverride,
): string {
  const map = new Map<string, { value: number; color: string }>();

  for (const node of nodes) {
    if (
      excludeRepos.includes((node.name ?? '').toLowerCase()) ||
      excludeRepos.includes((node.nameWithOwner ?? '').toLowerCase())
    ) {
      continue;
    }
    const lang = node.primaryLanguage;
    if (!lang || !lang.name) continue;
    if (exclude.includes(lang.name.toLowerCase())) continue;

    const existing = map.get(lang.name);
    if (existing) {
      existing.value += node.totalCount;
    } else {
      map.set(lang.name, { value: node.totalCount, color: lang.color || FALLBACK_COLOR });
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
      { name: 'commits to show', value: 1, color: FALLBACK_COLOR },
    ];
  }

  return createDonutChartCard('Top Languages by Commit', data, resolveTheme(themeName, override));
}
