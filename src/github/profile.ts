// Profile dataset — feeds both the profile-details and stats cards.
//
// Ported from github-profile-summary-cards' profile-details + contribution-history
// fetchers, simplified for Workers: the combined UserDetails query, full-history
// contribution totals (one light query per contribution year), and bounded star
// pagination. The heavy Vercel-specific split-query machinery is intentionally
// dropped — cold renders here are cached and served-stale on failure.

import { githubGraphQL } from './client';

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

const USER_DETAILS_QUERY = `
  query UserDetails($login: String!) {
    user(login: $login) {
      name
      email
      createdAt
      twitterUsername
      company
      location
      websiteUrl
      repositories(first: 100, privacy: PUBLIC, isFork: false, ownerAffiliations: OWNER) {
        totalCount
        nodes { stargazers { totalCount } }
        pageInfo { endCursor hasNextPage }
      }
      contributionsCollection {
        contributionCalendar {
          weeks { contributionDays { contributionCount date } }
        }
        contributionYears
      }
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

interface RepoStarsPage {
  nodes: Array<{ stargazers: { totalCount: number } }>;
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
}

interface UserDetailsResponse {
  user: {
    name: string | null;
    email: string | null;
    createdAt: string;
    twitterUsername: string | null;
    company: string | null;
    location: string | null;
    websiteUrl: string | null;
    repositories: { totalCount: number } & RepoStarsPage;
    contributionsCollection: {
      contributionCalendar: {
        weeks: Array<{ contributionDays: ProfileDay[] }>;
      };
      contributionYears: number[];
    };
    repositoriesContributedTo: { totalCount: number };
    pullRequests: { totalCount: number };
    issues: { totalCount: number };
  } | null;
}

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
      chunk.map((year) =>
        githubGraphQL<{
          user: {
            contributionsCollection: {
              totalCommitContributions: number;
              contributionCalendar: { totalContributions: number };
            };
          } | null;
        }>(token, CONTRIB_BY_YEAR_QUERY, {
          login: username,
          from: `${year}-01-01T00:00:00Z`,
          to: `${year}-12-31T23:59:59Z`,
        }),
      ),
    );
    for (const r of results) {
      const c = r.user?.contributionsCollection;
      if (!c) continue;
      totalCommitContributions += c.totalCommitContributions ?? 0;
      totalContributions += c.contributionCalendar?.totalContributions ?? 0;
    }
  }
  return { totalContributions, totalCommitContributions };
}

/** Fetch the full profile dataset from GitHub (no caching — the caller caches). */
export async function fetchProfileData(username: string, token: string): Promise<ProfileData> {
  // tolerateFieldErrors: a token without read:user can't read `user.email`;
  // GitHub still returns the rest, so render the card (email row just omitted)
  // instead of failing the whole request.
  const data = await githubGraphQL<UserDetailsResponse>(
    token,
    USER_DETAILS_QUERY,
    { login: username },
    { tolerateFieldErrors: true },
  );
  const user = data.user;
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
