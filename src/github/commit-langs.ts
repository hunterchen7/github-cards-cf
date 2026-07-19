// Commit-languages dataset — feeds the most-commit-language card. Fetches the
// user's contribution years, then commit-contributions-by-repository for each
// year, and returns the flattened per-repo nodes. Aggregation (sum commit counts
// per language) and exclude filtering happen at render time.

import { githubGraphQL, type GraphQLError } from './client';

export interface CommitRepoNode {
  name: string;
  nameWithOwner: string;
  primaryLanguage: { name: string; color: string | null } | null;
  totalCount: number;
}

const YEAR_CHUNK_SIZE = 5;

const YEARS_QUERY = `
  query ContributionYears($login: String!) {
    user(login: $login) {
      contributionsCollection { contributionYears }
    }
  }`;

const COMMIT_LANGS_QUERY = `
  query CommitLanguages($login: String!, $from: DateTime, $to: DateTime) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository(maxRepositories: 100) {
          repository {
            name
            nameWithOwner
            primaryLanguage { name color }
          }
          contributions { totalCount }
        }
      }
    }
  }`;

interface CommitLangResponse {
  user: {
    contributionsCollection: {
      commitContributionsByRepository: Array<{
        repository: {
          name: string;
          nameWithOwner: string;
          primaryLanguage: { name: string; color: string | null } | null;
        };
        contributions: { totalCount: number };
      }>;
    };
  } | null;
}

function toNodes(res: CommitLangResponse): CommitRepoNode[] {
  const byRepo = res.user?.contributionsCollection?.commitContributionsByRepository ?? [];
  return byRepo.map((entry) => ({
    name: entry.repository.name,
    nameWithOwner: entry.repository.nameWithOwner,
    primaryLanguage: entry.repository.primaryLanguage,
    totalCount: entry.contributions.totalCount,
  }));
}

async function fetchYearWindow(
  username: string,
  token: string,
  from: string,
  to: string,
): Promise<CommitRepoNode[]> {
  const res = await githubGraphQL<CommitLangResponse>(token, COMMIT_LANGS_QUERY, {
    login: username,
    from,
    to,
  });
  return toNodes(res);
}

async function fetchYear(username: string, year: number, token: string): Promise<CommitRepoNode[]> {
  try {
    return await fetchYearWindow(
      username,
      token,
      `${year}-01-01T00:00:00Z`,
      `${year}-12-31T23:59:59Z`,
    );
  } catch (err) {
    // GitHub's cost estimator rejects the combined query for mega-contribution
    // years — two half-year windows score low enough. A repo active in both
    // halves appears twice and its counts sum correctly during aggregation.
    if (!(err as GraphQLError).isResourceLimit) throw err;
    const [h1, h2] = await Promise.all([
      fetchYearWindow(username, token, `${year}-01-01T00:00:00Z`, `${year}-06-30T23:59:59Z`),
      fetchYearWindow(username, token, `${year}-07-01T00:00:00Z`, `${year}-12-31T23:59:59Z`),
    ]);
    return [...h1, ...h2];
  }
}

/** Fetch commit-language nodes across every contribution year. Caller caches. */
export async function fetchCommitLangData(
  username: string,
  token: string,
): Promise<CommitRepoNode[]> {
  const yearsRes = await githubGraphQL<{
    user: { contributionsCollection: { contributionYears: number[] } } | null;
  }>(token, YEARS_QUERY, { login: username });
  const years = [...(yearsRes.user?.contributionsCollection.contributionYears ?? [])].sort(
    (a, b) => b - a,
  );

  const all: CommitRepoNode[] = [];
  for (let i = 0; i < years.length; i += YEAR_CHUNK_SIZE) {
    const chunk = years.slice(i, i + YEAR_CHUNK_SIZE);
    const perYear = await Promise.all(chunk.map((year) => fetchYear(username, year, token)));
    for (const nodes of perYear) all.push(...nodes);
  }
  return all;
}
