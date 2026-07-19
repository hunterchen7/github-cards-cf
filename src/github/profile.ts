// Profile dataset — feeds both the profile-details and stats cards.
//
// Ported from github-profile-summary-cards' profile-details + contribution-history
// fetchers. Uses one combined UserDetails query on the happy path, and falls back
// to cheaper split queries when GitHub's cost estimator rejects the combined
// document with "Resource limits for this query exceeded" (active accounts, and
// accounts whose token can see many private repos, trip this).

import { githubGraphQL, type GraphQLError } from './client';

export interface ProfileDay {
  date: string; // YYYY-MM-DD
  contributionCount: number;
}

export interface ProfileData {
  name: string | null;
  email: string | null;
  createdAt: string;
  company: string | null;
  location: string | null;
  websiteUrl: string | null;
  twitterUsername: string | null;
  totalPublicRepos: number;
  totalStars: number;
  totalIssueContributions: number;
  totalPullRequestContributions: number;
  totalRepositoryContributions: number;
  /** Full-history sum of calendar contributions (the "X Contributions on GitHub"). */
  totalContributions: number;
  /** Full-history sum of commit contributions (stats card "Total Commits"). */
  totalCommitContributions: number;
  /** Trailing-year daily calendar, for the profile-details area chart. */
  contributions: ProfileDay[];
}

const MAX_STAR_PAGES = 10;
const YEAR_CHUNK_SIZE = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---- queries ----

const USER_DETAILS_QUERY = `
  query UserDetails($login: String!) {
    user(login: $login) {
      name email createdAt twitterUsername company location websiteUrl
      repositories(first: 100, privacy: PUBLIC, isFork: false, ownerAffiliations: OWNER) {
        totalCount
        nodes { stargazers { totalCount } }
        pageInfo { endCursor hasNextPage }
      }
      contributionsCollection {
        contributionCalendar { weeks { contributionDays { contributionCount date } } }
        contributionYears
      }
      repositoriesContributedTo(first: 1, includeUserRepositories: true, privacy: PUBLIC, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
        totalCount
      }
      pullRequests(first: 1) { totalCount }
      issues(first: 1) { totalCount }
    }
  }`;

// Split variants of UserDetails (same fields, cheaper documents).
const CORE_QUERY = `
  query UserDetailsCore($login: String!) {
    user(login: $login) {
      name email createdAt twitterUsername company location websiteUrl
      repositories(first: 100, privacy: PUBLIC, isFork: false, ownerAffiliations: OWNER) {
        totalCount
        nodes { stargazers { totalCount } }
        pageInfo { endCursor hasNextPage }
      }
    }
  }`;

const CALENDAR_QUERY = `
  query UserDetailsCalendar($login: String!, $from: DateTime, $to: DateTime) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar { weeks { contributionDays { contributionCount date } } }
      }
    }
  }`;

const YEARS_QUERY = `
  query UserDetailsYears($login: String!) {
    user(login: $login) { contributionsCollection { contributionYears } }
  }`;

const COUNTS_QUERY = `
  query UserDetailsCounts($login: String!) {
    user(login: $login) {
      repositoriesContributedTo(first: 1, includeUserRepositories: true, privacy: PUBLIC, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
        totalCount
      }
      pullRequests(first: 1) { totalCount }
      issues(first: 1) { totalCount }
    }
  }`;

const STARS_QUERY = `
  query UserStars($login: String!, $endCursor: String!) {
    user(login: $login) {
      repositories(first: 100, after: $endCursor, privacy: PUBLIC, isFork: false, ownerAffiliations: OWNER) {
        nodes { stargazers { totalCount } }
        pageInfo { endCursor hasNextPage }
      }
    }
  }`;

const CONTRIB_BY_YEAR_QUERY = `
  query ContributionsByYear($login: String!, $from: DateTime, $to: DateTime) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        contributionCalendar { totalContributions }
      }
    }
  }`;

const YEAR_COMMITS_QUERY = `
  query ContributionsByYearCommits($login: String!, $from: DateTime, $to: DateTime) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) { totalCommitContributions }
    }
  }`;

const YEAR_CALENDAR_QUERY = `
  query ContributionsByYearCalendar($login: String!, $from: DateTime, $to: DateTime) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) { contributionCalendar { totalContributions } }
    }
  }`;

// ---- types ----

interface RepoStarsPage {
  nodes: Array<{ stargazers: { totalCount: number } }>;
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
}

type CalendarWeek = { contributionDays: ProfileDay[] };

interface UserDetails {
  name: string | null;
  email: string | null;
  createdAt: string;
  twitterUsername: string | null;
  company: string | null;
  location: string | null;
  websiteUrl: string | null;
  repositories: { totalCount: number } & RepoStarsPage;
  contributionsCollection: {
    contributionCalendar: { weeks: CalendarWeek[] };
    contributionYears: number[];
  };
  repositoriesContributedTo: { totalCount: number };
  pullRequests: { totalCount: number };
  issues: { totalCount: number };
}

type CoreUser = Omit<
  UserDetails,
  'contributionsCollection' | 'repositoriesContributedTo' | 'pullRequests' | 'issues'
>;

function isResourceLimit(err: unknown): boolean {
  return (err as GraphQLError)?.isResourceLimit === true;
}

// ---- helpers ----

function sumStars(nodes: Array<{ stargazers: { totalCount: number } }>): number {
  return nodes.reduce((acc, n) => acc + (n.stargazers?.totalCount ?? 0), 0);
}

async function paginateStars(
  firstPage: RepoStarsPage,
  username: string,
  token: string,
): Promise<number> {
  let stars = sumStars(firstPage.nodes);
  let cursor = firstPage.pageInfo?.endCursor ?? null;
  let hasNext = !!firstPage.pageInfo?.hasNextPage;
  let pages = 1;
  while (hasNext && cursor && pages < MAX_STAR_PAGES) {
    const data = await githubGraphQL<{ user: { repositories: RepoStarsPage } | null }>(
      token,
      STARS_QUERY,
      { login: username, endCursor: cursor },
    );
    const repos = data.user?.repositories;
    if (!repos) break;
    stars += sumStars(repos.nodes);
    cursor = repos.pageInfo?.endCursor ?? null;
    hasNext = !!repos.pageInfo?.hasNextPage;
    pages += 1;
  }
  return stars;
}

// Trailing-year calendar weeks, with a two-half-window fallback for the most
// active accounts (whose single-window calendar alone trips the cost estimator).
async function fetchCalendarWeeks(username: string, token: string): Promise<CalendarWeek[]> {
  type Resp = {
    user: { contributionsCollection: { contributionCalendar: { weeks: CalendarWeek[] } } } | null;
  };
  const fetchWindow = (from: string | null, to: string | null) =>
    githubGraphQL<Resp>(token, CALENDAR_QUERY, { login: username, from, to });

  try {
    const data = await fetchWindow(null, null);
    return data.user?.contributionsCollection.contributionCalendar.weeks ?? [];
  } catch (err) {
    if (!isResourceLimit(err)) throw err;
    const now = new Date();
    const todayStartUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const midStart = new Date(todayStartUtc - 182 * DAY_MS);
    const start = new Date(todayStartUtc - 364 * DAY_MS);
    const [h1, h2] = await Promise.all([
      fetchWindow(start.toISOString(), new Date(midStart.getTime() - 1).toISOString()),
      fetchWindow(midStart.toISOString(), now.toISOString()),
    ]);
    return [
      ...(h1.user?.contributionsCollection.contributionCalendar.weeks ?? []),
      ...(h2.user?.contributionsCollection.contributionCalendar.weeks ?? []),
    ];
  }
}

// Rebuild the combined UserDetails shape from four cheaper queries.
async function fetchUserDetailsSplit(username: string, token: string): Promise<UserDetails | null> {
  const [coreRes, weeks, yearsRes, countsRes] = await Promise.all([
    githubGraphQL<{ user: CoreUser | null }>(
      token,
      CORE_QUERY,
      { login: username },
      { tolerateFieldErrors: true },
    ),
    fetchCalendarWeeks(username, token),
    githubGraphQL<{ user: { contributionsCollection: { contributionYears: number[] } } | null }>(
      token,
      YEARS_QUERY,
      { login: username },
    ),
    githubGraphQL<{
      user: {
        repositoriesContributedTo: { totalCount: number };
        pullRequests: { totalCount: number };
        issues: { totalCount: number };
      } | null;
    }>(token, COUNTS_QUERY, { login: username }),
  ]);

  const core = coreRes.user;
  if (!core) return null;
  return {
    ...core,
    contributionsCollection: {
      contributionCalendar: { weeks },
      contributionYears: yearsRes.user?.contributionsCollection.contributionYears ?? [],
    },
    repositoriesContributedTo: countsRes.user?.repositoriesContributedTo ?? { totalCount: 0 },
    pullRequests: countsRes.user?.pullRequests ?? { totalCount: 0 },
    issues: countsRes.user?.issues ?? { totalCount: 0 },
  };
}

// Contribution totals for one year, with a split fallback for mega-contribution
// years whose combined document trips the cost estimator.
async function contributionForYear(
  username: string,
  year: number,
  token: string,
): Promise<{ commit: number; total: number }> {
  const variables = {
    login: username,
    from: `${year}-01-01T00:00:00Z`,
    to: `${year}-12-31T23:59:59Z`,
  };
  try {
    const r = await githubGraphQL<{
      user: {
        contributionsCollection: {
          totalCommitContributions: number;
          contributionCalendar: { totalContributions: number };
        };
      } | null;
    }>(token, CONTRIB_BY_YEAR_QUERY, variables);
    const c = r.user?.contributionsCollection;
    return {
      commit: c?.totalCommitContributions ?? 0,
      total: c?.contributionCalendar?.totalContributions ?? 0,
    };
  } catch (err) {
    if (!isResourceLimit(err)) throw err;
    const [commitRes, calRes] = await Promise.all([
      githubGraphQL<{
        user: { contributionsCollection: { totalCommitContributions: number } } | null;
      }>(token, YEAR_COMMITS_QUERY, variables),
      githubGraphQL<{
        user: {
          contributionsCollection: { contributionCalendar: { totalContributions: number } };
        } | null;
      }>(token, YEAR_CALENDAR_QUERY, variables),
    ]);
    return {
      commit: commitRes.user?.contributionsCollection?.totalCommitContributions ?? 0,
      total: calRes.user?.contributionsCollection?.contributionCalendar?.totalContributions ?? 0,
    };
  }
}

async function contributionTotals(
  username: string,
  years: number[],
  token: string,
): Promise<{ totalContributions: number; totalCommitContributions: number }> {
  const sorted = [...years].sort((a, b) => b - a);
  let totalContributions = 0;
  let totalCommitContributions = 0;
  for (let i = 0; i < sorted.length; i += YEAR_CHUNK_SIZE) {
    const chunk = sorted.slice(i, i + YEAR_CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((year) => contributionForYear(username, year, token)),
    );
    for (const r of results) {
      totalCommitContributions += r.commit;
      totalContributions += r.total;
    }
  }
  return { totalContributions, totalCommitContributions };
}

/** Fetch the full profile dataset from GitHub (no caching — the caller caches). */
export async function fetchProfileData(username: string, token: string): Promise<ProfileData> {
  let user: UserDetails | null = null;
  try {
    // tolerateFieldErrors: a token without read:user can't read `user.email`;
    // GitHub still returns the rest, so render the card (email row just omitted).
    const data = await githubGraphQL<{ user: UserDetails | null }>(
      token,
      USER_DETAILS_QUERY,
      { login: username },
      { tolerateFieldErrors: true },
    );
    user = data.user;
  } catch (err) {
    // Combined document rejected by GitHub's cost estimator — fetch the same
    // fields via cheaper split queries.
    if (!isResourceLimit(err)) throw err;
    user = await fetchUserDetailsSplit(username, token);
  }
  if (!user) {
    throw new Error(`GitHub user "${username}" not found`);
  }

  const contributions: ProfileDay[] = [];
  for (const week of user.contributionsCollection.contributionCalendar.weeks) {
    for (const day of week.contributionDays) {
      contributions.push({ date: day.date, contributionCount: day.contributionCount });
    }
  }

  const [totalStars, totals] = await Promise.all([
    paginateStars(user.repositories, username, token),
    contributionTotals(username, user.contributionsCollection.contributionYears, token),
  ]);

  return {
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    company: user.company,
    location: user.location,
    websiteUrl: user.websiteUrl,
    twitterUsername: user.twitterUsername,
    totalPublicRepos: user.repositories.totalCount,
    totalStars,
    totalIssueContributions: user.issues.totalCount,
    totalPullRequestContributions: user.pullRequests.totalCount,
    totalRepositoryContributions: user.repositoriesContributedTo.totalCount,
    totalContributions: totals.totalContributions,
    totalCommitContributions: totals.totalCommitContributions,
    contributions,
  };
}
