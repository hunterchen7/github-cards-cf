import { readConfig, type Env } from './env';
import { getProfile, getRepos, getCommitLangs } from './cache/datasets';
import { renderProfileDetails } from './cards/profile-details';
import { renderStats } from './cards/stats';
import { renderReposPerLanguage } from './cards/repos-per-language';
import { renderMostCommitLanguage } from './cards/most-commit-language';
import {
  aggregateTopLanguages,
  renderTopLanguages,
  type TopLangOptions,
} from './top-langs/top-languages';
import { parseThemeColorOverride } from './themes/theme';
import { parseExcludeLanguages } from './util/translator';
import { parseArray, parseBoolean } from './top-langs/ops';
import { applyAnimation, parseAnimation } from './util/animation';
import { errorCard } from './templates/error-card';

const USERNAME_RE = /^[A-Za-z0-9-]{1,39}$/;
const SUMMARY_CARDS = new Set([
  'profile-details',
  'stats',
  'repos-per-language',
  'most-commit-language',
]);

class BadRequestError extends Error {}

interface RenderResult {
  svg: string;
  source: string; // fresh-kv | network | stale-kv | n/a
  ageSeconds: number; // seconds since the data was fetched from GitHub
}

function requireUsername(params: URLSearchParams): string {
  const username = params.get('username')?.trim() ?? '';
  if (!username) throw new BadRequestError('Missing "username" query parameter');
  if (!USERNAME_RE.test(username)) throw new BadRequestError(`Invalid username: ${username}`);
  return username;
}

function parseExcludeRepos(params: URLSearchParams, extra: string[]): string[] {
  const fromQuery = (params.get('exclude_repos') ?? '')
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  return [...fromQuery, ...extra];
}

async function renderSummaryCard(card: string, url: URL, env: Env): Promise<RenderResult> {
  const params = url.searchParams;
  const username = requireUsername(params);
  const themeName = params.get('theme') ?? 'default';
  const override = parseThemeColorOverride(params);
  const cfg = readConfig(env);
  // Optional entrance animation (summary cards only).
  const animation = parseAnimation(params.get('animation'));
  const durationRaw = params.get('duration');
  const animate = (svg: string): string => applyAnimation(svg, animation, durationRaw);

  if (card === 'profile-details') {
    const res = await getProfile(env, username);
    const displayName = params.get('name');
    return {
      svg: animate(renderProfileDetails(username, res.data, themeName, override, displayName)),
      source: res.source,
      ageSeconds: res.ageSeconds,
    };
  }
  if (card === 'stats') {
    const res = await getProfile(env, username);
    const hideLogo = parseBoolean(params.get('hide_logo')) === true;
    return {
      svg: animate(renderStats(res.data, themeName, override, hideLogo)),
      source: res.source,
      ageSeconds: res.ageSeconds,
    };
  }

  // language cards
  const exclude = parseExcludeLanguages(params.get('exclude') ?? '');
  const excludeRepos = parseExcludeRepos(params, cfg.excludeRepositories);

  if (card === 'repos-per-language') {
    const res = await getRepos(env, username);
    return {
      svg: animate(renderReposPerLanguage(res.data, exclude, excludeRepos, themeName, override)),
      source: res.source,
      ageSeconds: res.ageSeconds,
    };
  }
  // most-commit-language
  const res = await getCommitLangs(env, username);
  return {
    svg: animate(renderMostCommitLanguage(res.data, exclude, excludeRepos, themeName, override)),
    source: res.source,
    ageSeconds: res.ageSeconds,
  };
}

function parseTopLangsOptions(params: URLSearchParams): TopLangOptions {
  const numOrUndef = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    return Number(raw);
  };
  const cardWidthRaw = params.get('card_width');
  return {
    hide: parseArray(params.get('hide')),
    hide_title: parseBoolean(params.get('hide_title')),
    hide_border: parseBoolean(params.get('hide_border')),
    hide_progress: parseBoolean(params.get('hide_progress')),
    card_width: cardWidthRaw !== null ? parseInt(cardWidthRaw, 10) : undefined,
    title_color: params.get('title_color') ?? undefined,
    text_color: params.get('text_color') ?? undefined,
    bg_color: params.get('bg_color') ?? undefined,
    border_color: params.get('border_color') ?? undefined,
    theme: params.get('theme') ?? undefined,
    layout: params.get('layout') ?? undefined,
    custom_title: params.get('custom_title') ?? undefined,
    langs_count: numOrUndef('langs_count'),
    border_radius: numOrUndef('border_radius'),
    disable_animations: parseBoolean(params.get('disable_animations')),
    stats_format: params.get('stats_format') ?? undefined,
  };
}

async function renderTopLangsCard(url: URL, env: Env): Promise<RenderResult> {
  const params = url.searchParams;
  const username = requireUsername(params);
  const excludeRepo = parseArray(params.get('exclude_repo'));
  const res = await getRepos(env, username);
  const topLangs = aggregateTopLanguages(res.data, excludeRepo);
  return {
    svg: renderTopLanguages(topLangs, parseTopLangsOptions(params)),
    source: res.source,
    ageSeconds: res.ageSeconds,
  };
}

function svgResponse(result: RenderResult, env: Env): Response {
  const cfg = readConfig(env);
  return new Response(result.svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${cfg.browserCacheSeconds}, s-maxage=${cfg.edgeCacheSeconds}`,
      'Access-Control-Allow-Origin': '*',
      // Observability: where the data came from, how old it is (seconds since the
      // GitHub fetch), and whether this response came from the edge Cache API.
      'X-Cache-Source': result.source,
      'X-Data-Age': String(result.ageSeconds),
      'X-Edge-Cache': 'MISS',
    },
  });
}

function errorResponse(message: string, status: number, themeName: string): Response {
  // Rendered as an SVG at 200-ish so it shows inline in an <img>, but with a
  // short cache so a transient failure isn't pinned at the edge.
  return new Response(errorCard(message, themeName), {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'max-age=10',
      'Access-Control-Allow-Origin': '*',
      'X-Error': String(status),
    },
  });
}

const INDEX_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>github-cards-cf</title>
<style>body{font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;color:#c9d1d9;background:#0d1117}a{color:#58a6ff}code{background:#161b22;padding:2px 6px;border-radius:4px;font-size:14px}h1{font-size:1.5rem}li{margin:.3rem 0}</style>
</head><body>
<h1>github-cards-cf</h1>
<p>GitHub profile cards rendered on Cloudflare Workers, cached in KV (last-known-good, survives GitHub outages).</p>
<h2>Endpoints</h2>
<ul>
<li><code>/api/cards/profile-details?username=USER&amp;theme=github_dark</code></li>
<li><code>/api/cards/stats?username=USER&amp;theme=github_dark</code></li>
<li><code>/api/cards/repos-per-language?username=USER&amp;theme=github_dark</code></li>
<li><code>/api/cards/most-commit-language?username=USER&amp;theme=github_dark</code></li>
<li><code>/api/top-langs?username=USER&amp;layout=compact</code></li>
</ul>
<p>See the <a href="https://github.com/hunterchen7/github-cards-cf">README</a> for all query parameters.</p>
</body></html>`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '') {
      return new Response(INDEX_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'max-age=3600' },
      });
    }
    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    // Edge cache: key on the full URL (theme/params included). On a hit the worker
    // does no GitHub/KV work at all — the stored SVG is returned straight from the
    // Cloudflare edge. Re-label it so probes can see it was an edge hit.
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) {
      const edgeHit = new Response(hit.body, hit);
      edgeHit.headers.set('X-Edge-Cache', 'HIT');
      return edgeHit;
    }

    const themeName = url.searchParams.get('theme') ?? 'default';
    let response: Response;
    try {
      let result: RenderResult;
      const cardsMatch = url.pathname.match(/^\/api\/cards\/([a-z-]+)\/?$/);
      if (cardsMatch && SUMMARY_CARDS.has(cardsMatch[1])) {
        result = await renderSummaryCard(cardsMatch[1], url, env);
      } else if (url.pathname === '/api/top-langs' || url.pathname === '/api/top-langs/') {
        result = await renderTopLangsCard(url, env);
      } else {
        return new Response('Not Found', { status: 404 });
      }
      response = svgResponse(result, env);
      // Cache successful (incl. served-stale) renders at the edge.
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    } catch (err) {
      const status = err instanceof BadRequestError ? 400 : 500;
      const message = err instanceof Error ? err.message : 'Unknown error';
      response = errorResponse(message, status, themeName);
    }
    return response;
  },
};
