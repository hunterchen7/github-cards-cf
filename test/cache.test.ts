import { describe, it, expect, vi } from 'vitest';
import { withKvCache, type KvLike } from '../src/cache/kv';

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
    const res = await withKvCache(kv, 'k', FRESH, fetchFresh, NOW);
    expect(res).toEqual({ data: { v: 1 }, stale: false, source: 'network' });
    expect(fetchFresh).toHaveBeenCalledOnce();
    expect(JSON.parse(kv.store.get('k')!)).toEqual({ ts: NOW, data: { v: 1 } });
  });

  it('serves fresh KV without hitting the network', async () => {
    const kv = mockKv({ ts: NOW - 10_000, data: { v: 2 } }); // 10s old, within 1h
    const fetchFresh = vi.fn().mockResolvedValue({ v: 99 });
    const res = await withKvCache(kv, 'k', FRESH, fetchFresh, NOW);
    expect(res).toEqual({ data: { v: 2 }, stale: false, source: 'fresh-kv' });
    expect(fetchFresh).not.toHaveBeenCalled();
  });

  it('serves STALE KV when GitHub fails (the resilience case)', async () => {
    const kv = mockKv({ ts: NOW - 10 * FRESH * 1000, data: { v: 3 } }); // stale
    const fetchFresh = vi.fn().mockRejectedValue(new Error('GitHub 503'));
    const res = await withKvCache(kv, 'k', FRESH, fetchFresh, NOW);
    expect(res).toEqual({ data: { v: 3 }, stale: true, source: 'stale-kv' });
    expect(fetchFresh).toHaveBeenCalledOnce();
  });

  it('refreshes stale KV when GitHub succeeds', async () => {
    const kv = mockKv({ ts: NOW - 10 * FRESH * 1000, data: { v: 4 } });
    const fetchFresh = vi.fn().mockResolvedValue({ v: 5 });
    const res = await withKvCache(kv, 'k', FRESH, fetchFresh, NOW);
    expect(res).toEqual({ data: { v: 5 }, stale: false, source: 'network' });
    expect(JSON.parse(kv.store.get('k')!).data).toEqual({ v: 5 });
  });

  it('throws when there is nothing cached and GitHub fails', async () => {
    const kv = mockKv();
    const fetchFresh = vi.fn().mockRejectedValue(new Error('GitHub down'));
    await expect(withKvCache(kv, 'k', FRESH, fetchFresh, NOW)).rejects.toThrow('GitHub down');
  });
});
