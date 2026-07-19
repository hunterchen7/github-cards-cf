// Repos dataset — feeds repos-per-language (counts repos by primaryLanguage) and
// top-langs (sums language byte sizes). One query fetches both so a single cached
// blob serves both cards. Filters (exclude langs/repos) are applied at render time.

import { githubGraphQL } from './client';

export interface RepoLanguageEdge {
  size: number;
  node: { name: string; color: string | null };
}

export interface RepoNode {
  name: string;
  nameWithOwner: string;
  primaryLanguage: { name: string; color: string | null } | null;
  languages: { edges: RepoLanguageEdge[] };
}

const MAX_REPO_PAGES = 10; // 10 x 100 = up to 1,000 repos
const BUDGET_MS = 12_000;

const REPOS_QUERY = `
  query ReposData($login: String!, $endCursor: String) {
    user(login: $login) {
      repositories(ownerAffiliations: OWNER, isFork: false, first: 100, after: $endCursor) {
        nodes {
          name
          nameWithOwner
          primaryLanguage { name color }
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges {
              size
              node { name color }
            }
          }
        }
        pageInfo { endCursor hasNextPage }
      }
    }
  }`;

interface ReposResponse {
  user: {
    repositories: {
      nodes: RepoNode[];
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
    };
  } | null;
}

/** Fetch every owned, non-fork repo (paginated, bounded). Caller caches result. */
export async function fetchReposData(username: string, token: string): Promise<RepoNode[]> {
  const nodes: RepoNode[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  const startedAt = Date.now();

  while (hasNext && pages < MAX_REPO_PAGES && Date.now() - startedAt < BUDGET_MS) {
    const data: ReposResponse = await githubGraphQL<ReposResponse>(token, REPOS_QUERY, {
      login: username,
      endCursor: cursor,
    });
    const repos = data.user?.repositories;
    if (!repos) break;
    nodes.push(...repos.nodes);
    cursor = repos.pageInfo?.endCursor ?? null;
    hasNext = !!repos.pageInfo?.hasNextPage;
    pages += 1;
  }

  return nodes;
}
