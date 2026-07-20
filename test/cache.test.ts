import { describe, it, expect, vi } from 'vitest';
import { withKvCache, refreshKvCache, type KvLike } from '../src/cache/kv';

function mockKv(initial?: { ts: number; data: unknown }): KvLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  if (initial) store.set('k', JSON.stringify(initial));
  return {
    store,
    async get(key: string) {
      const v = store.get(key);
      return v ? JSON.parse(v) : null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

const FRESH = 3600; // seconds
const NOW = 1_000_000_000_000;

describe('withKvCache (last-known-good)', () => {
  it('serves from network on a cold cache and stores it', async () => {
    const kv = mockKv();
    const fetchFresh = vi.fn().mockResolvedValue({ v: 1 });
    const res = await withKvCache(kv, 'k', FRESH, fetchFresh, { now: NOW });
    expect(res).toEqual({ data: { v: 1 }, stale: false, source: 'network', ageSeconds: 0 });
    expect(fetchFresh).toHaveBeenCalledOnce();
    expect(JSON.parse(kv.store.get('k')!)).toEqual({ ts: NOW, data: { v: 1 } });
  });

  it('serves fresh KV without hitting the network', async () => {
    const kv = mockKv({ ts: NOW - 10_000, data: { v: 2 } }); // 10s old, within 1h
    const fetchFresh = vi.fn().mockResolvedValue({ v: 99 });
    const res = await withKvCache(kv, 'k', FRESH, fetchFresh, { now: NOW });
    expect(res).toEqual({ data: { v: 2 }, stale: false, source: 'fresh-kv', ageSeconds: 10 });
    expect(fetchFresh).not.toHaveBeenCalled();
  });

  it('serves STALE KV when GitHub fails (the resilience case)', async () => {
    const kv = mockKv({ ts: NOW - 10 * FRESH * 1000, data: { v: 3 } }); // stale
    const fetchFresh = vi.fn().mockRejectedValue(new Error('GitHub 503'));
    const res = await withKvCache(kv, 'k', FRESH, fetchFresh, { now: NOW });
    expect(res).toEqual({
      data: { v: 3 },
      stale: true,
      source: 'stale-kv',
      ageSeconds: 10 * FRESH,
    });
    expect(fetchFresh).toHaveBeenCalledOnce();
  });

  it('refreshes stale KV when GitHub succeeds (no waitUntil available)', async () => {
    const kv = mockKv({ ts: NOW - 10 * FRESH * 1000, data: { v: 4 } });
    const fetchFresh = vi.fn().mockResolvedValue({ v: 5 });
    const res = await withKvCache(kv, 'k', FRESH, fetchFresh, { now: NOW });
    expect(res).toEqual({ data: { v: 5 }, stale: false, source: 'network', ageSeconds: 0 });
    expect(JSON.parse(kv.store.get('k')!).data).toEqual({ v: 5 });
  });

  it('throws when there is nothing cached and GitHub fails', async () => {
    const kv = mockKv();
    const fetchFresh = vi.fn().mockRejectedValue(new Error('GitHub down'));
    await expect(withKvCache(kv, 'k', FRESH, fetchFresh, { now: NOW })).rejects.toThrow(
      'GitHub down',
    );
  });
});

describe('stale-while-revalidate', () => {
  it('returns stale data IMMEDIATELY and refreshes in the background', async () => {
    const kv = mockKv({ ts: NOW - 10 * FRESH * 1000, data: { v: 'old' } });
    // A refetch that would blow past any image-proxy timeout if awaited.
    let release!: (v: unknown) => void;
    const slow = new Promise((r) => (release = r));
    const fetchFresh = vi.fn().mockImplementation(() => slow.then(() => ({ v: 'new' })));

    const scheduled: Promise<unknown>[] = [];
    const res = await withKvCache(kv, 'k', FRESH, fetchFresh, {
      now: NOW,
      waitUntil: (p) => void scheduled.push(p),
    });

    // Served without waiting on the fetch.
    expect(res.data).toEqual({ v: 'old' });
    expect(res.source).toBe('stale-revalidating');
    expect(res.stale).toBe(true);
    expect(scheduled).toHaveLength(1);

    // The background refresh then lands in KV.
    release(null);
    await Promise.all(scheduled);
    expect(JSON.parse(kv.store.get('k')!).data).toEqual({ v: 'new' });
  });

  it('keeps last-known-good when the background refresh fails', async () => {
    const kv = mockKv({ ts: NOW - 10 * FRESH * 1000, data: { v: 'old' } });
    const fetchFresh = vi.fn().mockRejectedValue(new Error('GitHub 503'));
    const scheduled: Promise<unknown>[] = [];

    const res = await withKvCache(kv, 'k', FRESH, fetchFresh, {
      now: NOW,
      waitUntil: (p) => void scheduled.push(p),
    });

    expect(res.data).toEqual({ v: 'old' });
    // A failed background refresh must not reject (it runs after the response).
    await expect(Promise.all(scheduled)).resolves.toBeDefined();
    expect(JSON.parse(kv.store.get('k')!).data).toEqual({ v: 'old' });
  });

  it('single-flights concurrent refreshes of the same key', async () => {
    const kv = mockKv({ ts: NOW - 10 * FRESH * 1000, data: { v: 'old' } });
    let release!: (v: unknown) => void;
    const slow = new Promise((r) => (release = r));
    const fetchFresh = vi.fn().mockImplementation(() => slow.then(() => ({ v: 'new' })));
    const scheduled: Promise<unknown>[] = [];
    const opts = { now: NOW, waitUntil: (p: Promise<unknown>) => void scheduled.push(p) };

    // A burst of requests against the same stale key.
    await Promise.all([
      withKvCache(kv, 'k', FRESH, fetchFresh, opts),
      withKvCache(kv, 'k', FRESH, fetchFresh, opts),
      withKvCache(kv, 'k', FRESH, fetchFresh, opts),
    ]);

    release(null);
    await Promise.all(scheduled);
    // ...produces exactly one GitHub refetch.
    expect(fetchFresh).toHaveBeenCalledOnce();
  });
});

describe('refreshKvCache (cron pre-warm)', () => {
  it('refetches and writes even when the cached value is still fresh', async () => {
    const kv = mockKv({ ts: NOW, data: { v: 'fresh' } });
    const fetchFresh = vi.fn().mockResolvedValue({ v: 'warmed' });
    await refreshKvCache(kv, 'k', fetchFresh);
    expect(fetchFresh).toHaveBeenCalledOnce();
    expect(JSON.parse(kv.store.get('k')!).data).toEqual({ v: 'warmed' });
  });

  it('never rejects when the refresh fails', async () => {
    const kv = mockKv({ ts: NOW, data: { v: 'kept' } });
    const fetchFresh = vi.fn().mockRejectedValue(new Error('GitHub down'));
    await expect(refreshKvCache(kv, 'k', fetchFresh)).resolves.toBeUndefined();
    expect(JSON.parse(kv.store.get('k')!).data).toEqual({ v: 'kept' });
  });
});
