// Worker environment bindings + typed config accessors.

export interface Env {
  /** Persistent last-known-good cache (see src/cache/kv.ts). */
  CARDS_KV: KVNamespace;
  /** GitHub PAT for reading public profile/repo data. Set via `wrangler secret put`. */
  GITHUB_TOKEN: string;

  // Optional tunables (strings, from wrangler.toml [vars]).
  CACHE_FRESH_SECONDS?: string;
  BROWSER_CACHE_SECONDS?: string;
  EDGE_CACHE_SECONDS?: string;
  /** Comma-separated repo names/owner-repos excluded globally (optional). */
  EXCLUDE_REPO?: string;
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
}

export function readConfig(env: Env): Config {
  return {
    cacheFreshSeconds: num(env.CACHE_FRESH_SECONDS, DEFAULTS.CACHE_FRESH_SECONDS),
    browserCacheSeconds: num(env.BROWSER_CACHE_SECONDS, DEFAULTS.BROWSER_CACHE_SECONDS),
    edgeCacheSeconds: num(env.EDGE_CACHE_SECONDS, DEFAULTS.EDGE_CACHE_SECONDS),
    excludeRepositories: env.EXCLUDE_REPO
      ? env.EXCLUDE_REPO.split(',')
          .map((r) => r.trim().toLowerCase())
          .filter(Boolean)
      : [],
  };
}
