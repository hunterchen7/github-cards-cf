// Cached dataset accessors. Each wraps a GitHub fetcher in the KV last-known-good
// cache, keyed per-username (theme/params never affect the cache key — they only
// affect rendering). One `profile` blob feeds profile-details + stats; one `repos`
// blob feeds repos-per-language + top-langs.

import { readConfig, type Env } from '../env';
import { withKvCache, type CacheResult } from './kv';
import { fetchProfileData, type ProfileData } from '../github/profile';
import { fetchReposData, type RepoNode } from '../github/repos';
import { fetchCommitLangData, type CommitRepoNode } from '../github/commit-langs';

function key(dataset: string, username: string): string {
  return `data:v1:${dataset}:${username.toLowerCase()}`;
}

export function getProfile(env: Env, username: string): Promise<CacheResult<ProfileData>> {
  const cfg = readConfig(env);
  return withKvCache(env.CARDS_KV, key('profile', username), cfg.cacheFreshSeconds, () =>
    fetchProfileData(username, env.GITHUB_TOKEN),
  );
}

export function getRepos(env: Env, username: string): Promise<CacheResult<RepoNode[]>> {
  const cfg = readConfig(env);
  return withKvCache(env.CARDS_KV, key('repos', username), cfg.cacheFreshSeconds, () =>
    fetchReposData(username, env.GITHUB_TOKEN),
  );
}

export function getCommitLangs(env: Env, username: string): Promise<CacheResult<CommitRepoNode[]>> {
  const cfg = readConfig(env);
  return withKvCache(env.CARDS_KV, key('commitLangs', username), cfg.cacheFreshSeconds, () =>
    fetchCommitLangData(username, env.GITHUB_TOKEN),
  );
}
