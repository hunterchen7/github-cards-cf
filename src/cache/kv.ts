// KV last-known-good cache, with stale-while-revalidate.
//
// This is the resilience layer the project exists for: per-username datasets are
// cached in Workers KV with a "fresh" window.
//
//   fresh hit   -> serve from KV, no GitHub call.
//   stale hit   -> serve the STALE value immediately and refresh in the background
//                  (ctx.waitUntil). A GitHub refetch takes ~5-10s, which is longer
//                  than GitHub's image proxy will wait, so a request must never
//                  block on one when we already have something to show.
//   cold miss   -> nothing cached, so we have to block on GitHub.
//   fetch fails -> fall back to the stale value. A card only errors when the data
//                  is both missing AND GitHub is unavailable.

export interface KvCacheEntry<T> {
  /** Epoch ms the data was fetched. */
  ts: number;
  data: T;
}

export interface CacheResult<T> {
  data: T;
  /** True whenever the returned data is past its fresh window. */
  stale: boolean;
  /** Where the data came from — useful for response headers / debugging. */
  source: 'fresh-kv' | 'network' | 'stale-kv' | 'stale-revalidating';
  /** Seconds since this data was fetched from GitHub (0 for a fresh network fetch). */
  ageSeconds: number;
}

export interface KvCacheOptions {
  /** Overridable clock, for tests. */
  now?: number;
  /**
   * `ExecutionContext.waitUntil`. When provided, a stale hit is served instantly
   * and the refresh runs after the response. Without it (cron, tests) a stale hit
   * falls through to a blocking refetch.
   */
  waitUntil?: (promise: Promise<unknown>) => void;
}

// How long a value is retained in KV after being written, so last-known-good
// survives an extended GitHub outage. Independent of the (shorter) fresh window.
const RETENTION_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface KvLike {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

// In-flight background refreshes, keyed by cache key. A burst of requests against
// a stale key would otherwise each fire their own GitHub refetch; within an
// isolate they now share one. (Best-effort: isolates don't share this map.)
const inFlight = new Map<string, Promise<void>>();

/** Fetch + write, at most once per key at a time. Never rejects. */
function refreshOnce<T>(kv: KvLike, key: string, fetchFresh: () => Promise<T>): Promise<void> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const run = (async () => {
    try {
      const fresh = await fetchFresh();
      await kv.put(key, JSON.stringify({ ts: Date.now(), data: fresh } satisfies KvCacheEntry<T>), {
        expirationTtl: RETENTION_SECONDS,
      });
    } catch {
      // Keep the existing last-known-good value; a failed refresh is not fatal.
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, run);
  return run;
}

/**
 * Unconditionally refetch `key` and write it to KV, ignoring the fresh window.
 * Used by the scheduled pre-warmer so live traffic keeps hitting a fresh cache.
 * Resolves even if the refresh failed.
 */
export function refreshKvCache<T>(
  kv: KvLike,
  key: string,
  fetchFresh: () => Promise<T>,
): Promise<void> {
  return refreshOnce(kv, key, fetchFresh);
}

/**
 * Read `key` from KV. Fresh values are returned as-is; stale values are returned
 * immediately with a background refresh scheduled (when `waitUntil` is given).
 * Only blocks on GitHub when there is nothing cached to serve.
 */
export async function withKvCache<T>(
  kv: KvLike,
  key: string,
  freshSeconds: number,
  fetchFresh: () => Promise<T>,
  opts: KvCacheOptions = {},
): Promise<CacheResult<T>> {
  const now = opts.now ?? Date.now();

  let cached: KvCacheEntry<T> | null = null;
  try {
    cached = (await kv.get(key, 'json')) as KvCacheEntry<T> | null;
  } catch {
    // A KV read failure must not take down rendering — treat as a miss.
    cached = null;
  }

  const ageSeconds = cached ? Math.round((now - cached.ts) / 1000) : 0;

  if (cached && now - cached.ts < freshSeconds * 1000) {
    return { data: cached.data, stale: false, source: 'fresh-kv', ageSeconds };
  }

  // Stale but present: serve it now, refresh behind the response.
  if (cached && opts.waitUntil) {
    opts.waitUntil(refreshOnce(kv, key, fetchFresh));
    return { data: cached.data, stale: true, source: 'stale-revalidating', ageSeconds };
  }

  try {
    const fresh = await fetchFresh();
    // Best-effort write; a failed write shouldn't fail the request.
    try {
      await kv.put(key, JSON.stringify({ ts: now, data: fresh } satisfies KvCacheEntry<T>), {
        expirationTtl: RETENTION_SECONDS,
      });
    } catch {
      /* ignore write failures */
    }
    return { data: fresh, stale: false, source: 'network', ageSeconds: 0 };
  } catch (err) {
    if (cached) {
      // GitHub failed but we have a last-known-good value — the whole point.
      return { data: cached.data, stale: true, source: 'stale-kv', ageSeconds };
    }
    throw err;
  }
}
