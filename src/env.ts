// Worker environment bindings + typed config accessors.

export interface Env {
  /** Persistent last-known-good cache (see src/cache/kv.ts). */
  CARDS_KV: KVNamespace;
  /**
   * GitHub PAT used for the repos + commit-language datasets (the language cards).
   * To include private repos this must be able to see them — a fine-grained token
   * (All repositories + Metadata/Contents read) or a classic `repo` token.
   */
  GITHUB_TOKEN: string;
  /**
   * Optional second PAT used ONLY for the profile dataset (contribution count +
   * stats). Lets you use a **classic** token here (fine-grained tokens under-count
   * private contributions in the calendar) while keeping a read-only fine-grained
   * token for the languages. With "Include private contributions on my profile"
   * enabled, a classic token with NO scopes returns the full private-inclusive
   * count — so this can be fully read-only. Falls back to GITHUB_TOKEN if unset.
   */
  GITHUB_CONTRIB_TOKEN?: string;

  // Optional tunables (strings, from wrangler.toml [vars]).
  CACHE_FRESH_SECONDS?: string;
  BROWSER_CACHE_SECONDS?: string;
  EDGE_CACHE_SECONDS?: string;
  /** Comma-separated repo names/owner-repos excluded globally (optional). */
  EXCLUDE_REPO?: string;
  /**
   * Default for whether the language cards count private repos ("true"/"false").
   * Only has effect with a token that can see private repos (a classic `repo`
   * token — fine-grained tokens expose public repos only to GraphQL). Overridable
   * per-request with ?include_private=. Defaults to false.
   */
  INCLUDE_PRIVATE?: string;
  /**
   * Comma-separated usernames whose datasets the cron pre-warms, so the cards you
   * actually embed are always served from a fresh cache and never pay for a
   * GitHub refetch on the request path. Optional.
   */
  PREWARM_USERNAMES?: string;
}

const DEFAULTS = {
  CACHE_FRESH_SECONDS: 21_600, // 6h
  BROWSER_CACHE_SECONDS: 14_400, // 4h
  EDGE_CACHE_SECONDS: 14_400, // 4h
};

function num(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface Config {
  cacheFreshSeconds: number;
  browserCacheSeconds: number;
  edgeCacheSeconds: number;
  excludeRepositories: string[];
  /** Default for counting private repos in the language cards (see INCLUDE_PRIVATE). */
  includePrivate: boolean;
  /** Usernames the cron keeps warm (see PREWARM_USERNAMES). */
  prewarmUsernames: string[];
}

function csv(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
}

export function readConfig(env: Env): Config {
  return {
    cacheFreshSeconds: num(env.CACHE_FRESH_SECONDS, DEFAULTS.CACHE_FRESH_SECONDS),
    browserCacheSeconds: num(env.BROWSER_CACHE_SECONDS, DEFAULTS.BROWSER_CACHE_SECONDS),
    edgeCacheSeconds: num(env.EDGE_CACHE_SECONDS, DEFAULTS.EDGE_CACHE_SECONDS),
    excludeRepositories: csv(env.EXCLUDE_REPO).map((r) => r.toLowerCase()),
    includePrivate: env.INCLUDE_PRIVATE === 'true',
    prewarmUsernames: csv(env.PREWARM_USERNAMES),
  };
}
