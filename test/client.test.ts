import { describe, it, expect, vi, afterEach } from 'vitest';
import { githubGraphQL } from '../src/github/client';

function mockFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('githubGraphQL', () => {
  it('returns data on a clean response', async () => {
    mockFetch({ data: { user: { name: 'Hunter' } } });
    const data = await githubGraphQL<{ user: { name: string } }>('tok', 'q', {});
    expect(data.user.name).toBe('Hunter');
  });

  it('tolerateFieldErrors: returns partial data when only a field errored (e.g. no read:user)', async () => {
    mockFetch({
      data: { user: { name: 'Hunter', email: null } },
      errors: [{ type: 'INSUFFICIENT_SCOPES', message: "requires 'read:user'" }],
    });
    const data = await githubGraphQL<{ user: { name: string; email: string | null } }>(
      'tok',
      'q',
      {},
      { tolerateFieldErrors: true },
    );
    expect(data.user.email).toBeNull();
    expect(data.user.name).toBe('Hunter');
  });

  it('tolerateFieldErrors still throws on rate limits', async () => {
    mockFetch({
      data: null,
      errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }],
    });
    await expect(githubGraphQL('tok', 'q', {}, { tolerateFieldErrors: true })).rejects.toThrow(
      /rate limit/i,
    );
  });

  it('strict (default): a field error without usable data throws', async () => {
    mockFetch({ data: { user: null }, errors: [{ type: 'INSUFFICIENT_SCOPES', message: 'nope' }] });
    await expect(githubGraphQL('tok', 'q', {})).rejects.toThrow(/nope/);
  });
});
