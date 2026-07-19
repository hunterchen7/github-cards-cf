import { Icon } from '../const/icon';
import { abbreviateNumber } from '../util/format';
import { buildProfileTitle } from '../util/profile-title';
import { resolveTheme, type ThemeColorOverride } from '../themes/theme';
import { createDetailCard, type DetailRow } from '../templates/profile-details-card';
import type { ProfileData } from '../github/profile';

// "Joined GitHub N years ago" — epoch-diff trick from the original.
function joinedAgo(createdAt: string): string {
  const s = (unit: number) => (unit === 1 ? '' : 's');
  const now = Date.now();
  const created = new Date(createdAt);
  const diff = new Date(now - created.getTime());
  const years = diff.getUTCFullYear() - new Date(0).getUTCFullYear();
  const months = diff.getUTCMonth() - new Date(0).getUTCMonth();
  const days = diff.getUTCDate() - new Date(0).getUTCDate();
  return years
    ? `${years} year${s(years)} ago`
    : months
      ? `${months} month${s(months)} ago`
      : `${days} day${s(days)} ago`;
}

export function renderProfileDetails(
  username: string,
  profile: ProfileData,
  themeName: string,
  override?: ThemeColorOverride,
  displayName?: string | null,
): string {
  const title = buildProfileTitle(username, profile.name, displayName);
  const rows: DetailRow[] = [
    {
      index: 0,
      icon: Icon.GITHUB,
      value: `${abbreviateNumber(profile.totalContributions, 2)} Contributions on GitHub`,
    },
    {
      index: 1,
      icon: Icon.REPOS,
      value: `${abbreviateNumber(profile.totalPublicRepos, 2)} Public Repos`,
    },
    {
      index: 2,
      icon: Icon.CLOCK,
      value: `Joined GitHub ${joinedAgo(profile.createdAt)}`,
    },
  ];

  // One extra row: email, else company, else location (first available).
  if (profile.email) {
    rows.push({ index: 3, icon: Icon.EMAIL, value: profile.email });
  } else if (profile.company) {
    rows.push({ index: 3, icon: Icon.COMPANY, value: profile.company });
  } else if (profile.location) {
    rows.push({ index: 3, icon: Icon.LOCATION, value: profile.location });
  }

  return createDetailCard(title, rows, profile.contributions, resolveTheme(themeName, override));
}
