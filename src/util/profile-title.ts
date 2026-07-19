// Builds the single-line title on the profile-details card (login (name),
// elided to fit before the chart). Ported from github-profile-summary-cards.

export const PROFILE_TITLE_MAX = 22;

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function buildProfileTitle(
  login: string,
  name: string | null,
  displayName?: string | null,
): string {
  if (displayName && normalize(displayName)) {
    return clamp(normalize(displayName), PROFILE_TITLE_MAX);
  }
  if (!name) {
    return clamp(login, PROFILE_TITLE_MAX);
  }
  const full = `${login} (${name})`;
  if (full.length <= PROFILE_TITLE_MAX) {
    return full;
  }
  const nameBudget = PROFILE_TITLE_MAX - (login.length + 3);
  if (nameBudget < 2) {
    return clamp(login, PROFILE_TITLE_MAX);
  }
  return `${login} (${clamp(normalize(name), nameBudget)})`;
}
