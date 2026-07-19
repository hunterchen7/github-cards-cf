// GitHub GraphQL client for Cloudflare Workers.
//
// Replaces the original project's axios + retry-axios stack with native fetch.
// Keeps the two behaviours that matter: (1) GitHub returns GraphQL rate-limit
// and cost-estimator failures as HTTP 200 with an `errors` array, so we inspect
// the body rather than the status; (2) a small concurrency gate keeps a cold
// multi-year render from bursting past GitHub's secondary rate limit.

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
const USER_AGENT = 'github-cards-cf';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 800;

export interface GraphQLError extends Error {
  isRateLimit?: boolean;
  isResourceLimit?: boolean;
  status?: number;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ type?: string; message?: string }>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Throw on any GraphQL `errors` entry, flagging rate-limit and resource-limit
// failures so callers can react (serve stale / retry with a cheaper query).
export function assertNoGraphQLErrors(
  body: GraphQLResponse<unknown>,
  fallbackMessage: string,
): void {
  const errors = body?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const err: GraphQLError = new Error(errors[0].message || fallbackMessage);
    if (errors.some((e) => e?.type === 'RATE_LIMITED' || /rate limit/i.test(e?.message ?? ''))) {
      err.isRateLimit = true;
    }
    if (errors.some((e) => /resource limits/i.test(e?.message ?? ''))) {
      err.isResourceLimit = true;
    }
    throw err;
  }
}

// ---- per-isolate concurrency gate ----
const MAX_CONCURRENT_GITHUB_CALLS = 8;
let activeGithubCalls = 0;
const githubCallWaiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeGithubCalls < MAX_CONCURRENT_GITHUB_CALLS) {
    activeGithubCalls += 1;
    return;
  }
  await new Promise<void>((resolve) => githubCallWaiters.push(resolve));
}

function releaseSlot(): void {
  const next = githubCallWaiters.shift();
  if (next) {
    next(); // hand the slot straight over; activeGithubCalls stays put
  } else {
    activeGithubCalls -= 1;
  }
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Execute a GraphQL query and return its `data` payload (typed as T).
 *
 * Retries transient network / 5xx / secondary-rate failures with linear
 * backoff. GraphQL-level errors are surfaced via assertNoGraphQLErrors so a
 * rate-limit body doesn't get mistaken for a successful (empty) response.
 */
export async function githubGraphQL<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  await acquireSlot();
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(GITHUB_GRAPHQL_URL, {
          method: 'POST',
          headers: {
            Authorization: `bearer ${token}`,
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!res.ok) {
          if (isRetriableStatus(res.status) && attempt < MAX_RETRIES) {
            const retryAfter = Number(res.headers.get('retry-after'));
            const delay =
              Number.isFinite(retryAfter) && retryAfter > 0
                ? Math.min(retryAfter * 1000, 5000)
                : RETRY_BASE_DELAY_MS * (attempt + 1);
            await sleep(delay);
            continue;
          }
          const err: GraphQLError = new Error(`GitHub API HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }

        const body = (await res.json()) as GraphQLResponse<T>;
        assertNoGraphQLErrors(body, 'GitHub GraphQL request failed');
        if (!body.data) {
          throw new Error('GitHub GraphQL response missing data');
        }
        return body.data;
      } catch (err) {
        lastError = err;
        // Rate-limit / resource-limit GraphQL errors are not worth blindly
        // retrying on the same query — surface them to the caller immediately.
        if ((err as GraphQLError).isRateLimit || (err as GraphQLError).isResourceLimit) {
          throw err;
        }
        const isAbort = err instanceof Error && err.name === 'TimeoutError';
        const isHttp = typeof (err as GraphQLError).status === 'number';
        // Retry network errors and timeouts; don't retry non-retriable HTTP.
        if (attempt < MAX_RETRIES && (isAbort || !isHttp)) {
          await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('GitHub GraphQL request failed');
  } finally {
    releaseSlot();
  }
}
