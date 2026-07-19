import { Icon } from '../const/icon';
import { abbreviateNumber } from '../util/format';
import { resolveTheme, type ThemeColorOverride } from '../themes/theme';
import { createStatsCard, type StatRow } from '../templates/stats-card';
import type { ProfileData } from '../github/profile';

export function renderStats(
  profile: ProfileData,
  themeName: string,
  override?: ThemeColorOverride,
  hideLogo = false,
): string {
  const stats: StatRow[] = [
    { index: 0, icon: Icon.STAR, name: 'Total Stars:', value: abbreviateNumber(profile.totalStars, 1) },
    {
      index: 1,
      icon: Icon.COMMIT,
      name: 'Total Commits:',
      value: abbreviateNumber(profile.totalCommitContributions, 1),
    },
    {
      index: 2,
      icon: Icon.PULL_REQUEST,
      name: 'Total PRs:',
      value: abbreviateNumber(profile.totalPullRequestContributions, 1),
    },
    {
      index: 3,
      icon: Icon.ISSUE,
      name: 'Total Issues:',
      value: abbreviateNumber(profile.totalIssueContributions, 1),
    },
    {
      index: 4,
      icon: Icon.REPOS,
      name: 'Contributed to:',
      value: abbreviateNumber(profile.totalRepositoryContributions, 1),
    },
  ];
  return createStatsCard('Stats', stats, resolveTheme(themeName, override), hideLogo);
}
