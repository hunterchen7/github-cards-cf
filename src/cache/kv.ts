// KV last-known-good cache.
//
// This is the resilience layer the project exists for: per-username datasets are
// cached in Workers KV with a "fresh" window. Within the window we serve straight
// from KV (no GitHub call). After it, we refetch — but if GitHub is down, rate
// limited, or erroring, we SERVE THE STALE VALUE instead of failing. A card only
// errors if the data is both stale-missing AND GitHub is unavailable.

export interface KvCacheEntry<T> {
  /** Epoch ms the data was fetched. */
  ts: number;
  data: T;
}

export interface CacheResult<T> {
  data: T;
  /** True when GitHub was unavailable and we fell back to a stale KV value. */
  stale: boolean;
  /** Where the data came from — useful for response headers / debugging. */
  source: 'fresh-kv' | 'network' | 'stale-kv';
}

// How long a value is retained in KV after being written, so last-known-good
// survives an extended GitHub outage. Independent of the (shorter) fresh window.
const RETENTION_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface KvLike {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/**
 * Read `key` from KV; if fresh, return it. Otherwise call `fetchFresh()`, cache
 * the result, and return it. If `fetchFresh()` throws and a (stale) cached value
 * exists, return that instead. Only throws when there is nothing to fall back to.
 */
export async function withKvCache<T>(
  kv: KvLike,
  key: string,
  freshSeconds: number,
  fetchFresh: () => Promise<T>,
  now: number = Date.now(),
): Promise<CacheResult<T>> {
  let cached: KvCacheEntry<T> | null = null;
  try {
    cached = (await kv.get(key, 'json')) as KvCacheEntry<T> | null;
  } catch {
    // A KV read failure must not take down rendering — treat as a miss.
    cached = null;
  }

  if (cached && now - cached.ts < freshSeconds * 1000) {
    return { data: cached.data, stale: false, source: 'fresh-kv' };
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
    return { data: fresh, stale: false, source: 'network' };
  } catch (err) {
    if (cached) {
      // GitHub failed but we have a last-known-good value — the whole point.
      return { data: cached.data, stale: true, source: 'stale-kv' };
    }
    throw err;
  }
}
