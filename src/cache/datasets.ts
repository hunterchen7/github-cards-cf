// Cached dataset accessors. Each wraps a GitHub fetcher in the KV last-known-good
// cache, keyed per-username (theme/params never affect the cache key — they only
// affect rendering). One `profile` blob feeds profile-details + stats; one `repos`
// blob feeds repos-per-language + top-langs.
//
// Request handlers pass `waitUntil` so a stale entry is served immediately and
// refreshed behind the response; the scheduled pre-warmer calls `prewarmDatasets`
// to refresh unconditionally.

import { readConfig, type Env } from '../env';
import { withKvCache, refreshKvCache, type CacheResult } from './kv';
import { fetchProfileData, type ProfileData } from '../github/profile';
import { fetchReposData, type RepoNode } from '../github/repos';
import { fetchCommitLangData, type CommitRepoNode } from '../github/commit-langs';

export type WaitUntil = (promise: Promise<unknown>) => void;

interface DatasetSpec<T> {
  key: string;
  fetch: () => Promise<T>;
}

function key(dataset: string, username: string): string {
  return `data:v1:${dataset}:${username.toLowerCase()}`;
}

// Profile/contribution data can use a dedicated (classic) token; falls back to
// the main token. See GITHUB_CONTRIB_TOKEN in env.ts.
function profileSpec(env: Env, username: string): DatasetSpec<ProfileData> {
  const token = env.GITHUB_CONTRIB_TOKEN || env.GITHUB_TOKEN;
  return { key: key('profile', username), fetch: () => fetchProfileData(username, token) };
}

function reposSpec(env: Env, username: string): DatasetSpec<RepoNode[]> {
  return {
    key: key('repos', username),
    fetch: () => fetchReposData(username, env.GITHUB_TOKEN),
  };
}

function commitLangsSpec(env: Env, username: string): DatasetSpec<CommitRepoNode[]> {
  return {
    key: key('commitLangs', username),
    fetch: () => fetchCommitLangData(username, env.GITHUB_TOKEN),
  };
}

function read<T>(env: Env, spec: DatasetSpec<T>, waitUntil?: WaitUntil): Promise<CacheResult<T>> {
  return withKvCache(env.CARDS_KV, spec.key, readConfig(env).cacheFreshSeconds, spec.fetch, {
    waitUntil,
  });
}

export function getProfile(
  env: Env,
  username: string,
  waitUntil?: WaitUntil,
): Promise<CacheResult<ProfileData>> {
  return read(env, profileSpec(env, username), waitUntil);
}

export function getRepos(
  env: Env,
  username: string,
  waitUntil?: WaitUntil,
): Promise<CacheResult<RepoNode[]>> {
  return read(env, reposSpec(env, username), waitUntil);
}

export function getCommitLangs(
  env: Env,
  username: string,
  waitUntil?: WaitUntil,
): Promise<CacheResult<CommitRepoNode[]>> {
  return read(env, commitLangsSpec(env, username), waitUntil);
}

/**
 * Refetch every dataset for `username` regardless of freshness. Called on a cron
 * so live traffic keeps hitting a fresh cache instead of paying for the refresh.
 * Never rejects — a failed refresh leaves the last-known-good value in place.
 */
export async function prewarmDatasets(env: Env, username: string): Promise<void> {
  // Heterogeneous payloads; only the key + fetcher matter here.
  const specs: DatasetSpec<unknown>[] = [
    profileSpec(env, username),
    reposSpec(env, username),
    commitLangsSpec(env, username),
  ];
  await Promise.all(specs.map((s) => refreshKvCache(env.CARDS_KV, s.key, s.fetch)));
}
