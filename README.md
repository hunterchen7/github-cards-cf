# github-cards-cf

GitHub profile cards rendered on **Cloudflare Workers**, with a **KV last-known-good cache** that keeps the cards up even when the GitHub API fails or rate-limits.

It is a from-scratch rewrite that combines two projects onto one Worker:

- The four profile summary cards from [vn7n24fzkq/github-profile-summary-cards](https://github.com/vn7n24fzkq/github-profile-summary-cards) — `profile-details`, `stats`, `repos-per-language`, `most-commit-language`.
- The compact **top languages** card from [anuraghazra/github-readme-stats](https://github.com/anuraghazra/github-readme-stats) — `top-langs`.

No Vercel, no serverless functions on Node — one Worker, SVG built as strings (no `jsdom`), data cached in KV, responses cached at the edge.

## Why

The public instances of these projects go down or rate-limit, and the card in your README turns into a broken image. This version caches each user's data in Workers KV. If GitHub is unavailable on a refresh, the Worker **serves the last good data instead of failing**. A card only errors when the data is both missing from KV *and* GitHub is down.

## Cards

| Path | Card |
| --- | --- |
| `/api/cards/profile-details` | name, total contributions, public repos, join date, email/company/location, and a last-year contribution area chart |
| `/api/cards/stats` | total stars, commits, PRs, issues, contributed-to |
| `/api/cards/repos-per-language` | donut of repositories grouped by primary language |
| `/api/cards/most-commit-language` | donut of languages by commit count |
| `/api/top-langs` | "Most Used Languages" — `compact` / `normal` / `pie` / `donut` / `donut-vertical` |

### Example embed

```html
<img width="600" src="https://github-cards-cf.hunterchen.workers.dev/api/cards/profile-details?username=hunterchen7&theme=github_dark" />

<img src="https://github-cards-cf.hunterchen.workers.dev/api/top-langs?username=hunterchen7&layout=compact&hide_border=false&bg_color=0D1116&border_color=2E353A&title_color=0267D6&text_color=0267D6&hide=jupyter%20notebook,TeX,css,scss,HTML,javascript,html" />
```

## Query parameters

### Summary cards (`/api/cards/:card`)

| Param | Applies to | Default | Notes |
| --- | --- | --- | --- |
| `username` | all | — | **required** |
| `theme` | all | `default` | named theme, e.g. `github_dark` |
| `title_color`, `text_color`, `bg_color`, `border_color`, `icon_color`, `chart_color` | all | theme | bare or `#`-prefixed hex overrides |
| `name` | profile-details | — | override the displayed name |
| `hide_logo` | stats | `false` | hide the large GitHub logo |
| `exclude` | language cards | — | comma list of languages to hide (aliases like `js`, `ts` are resolved) |
| `exclude_repos` | language cards | — | comma list of repo names / `owner/repo` to skip |
| `animation` | all | — | entrance animation: `fade`, `rise`, `draw`, `stagger`, `load`, `sequence`, `tint`, `rgb`, `rgb-soft` (pure CSS, camo-safe; respects `prefers-reduced-motion`) |
| `duration` | all | preset default | animation speed in seconds (0.2–10) |

### Top languages (`/api/top-langs`)

| Param | Default | Notes |
| --- | --- | --- |
| `username` | — | **required** |
| `layout` | `normal` | `compact`, `normal`, `pie`, `donut`, or `donut-vertical` |
| `hide` | — | comma list of languages to hide |
| `langs_count` | 6 (compact) / 5 (normal) | 1–20 |
| `card_width` | 300 | min 280 |
| `title_color`, `text_color`, `bg_color`, `border_color` | theme | bare hex (no `#` needed) |
| `hide_title`, `hide_border`, `hide_progress`, `disable_animations` | `false` | booleans |
| `exclude_repo` | — | comma list of repo names to skip |
| `custom_title` | "Most Used Languages" | override the title |
| `stats_format` | `percentages` | or `bytes` |

> Note: `show_icons` / `icon_color` have no effect on top-langs (they are ignored upstream too).

## Architecture

```
request ──► edge Cache API (keyed on full URL, incl. theme/params)
              │ miss
              ▼
        dataset cache (Workers KV, keyed per username)
          profile      → profile-details + stats
          repos        → repos-per-language + top-langs
          commitLangs  → most-commit-language
              │ fresh?  → serve
              │ stale/miss → refetch GitHub GraphQL
              │              success → update KV, serve
              │              failure → serve stale KV  ◄── resilience
              ▼
        render SVG (string templates; d3-shape/scale/time-format for the chart)
```

- **Cache key is per username, not per theme/params.** Themes and filters only affect rendering, so one cached blob serves every theme and option.
- **Freshness vs retention.** A blob is "fresh" for `CACHE_FRESH_SECONDS` (default **1h**): any access within the window is served straight from KV and GitHub is not touched. After the window the next request refetches. The blob is retained in KV for 30 days, so last-known-good survives a long outage.
- **No Durable Objects.** A read-heavy cached card needs no coordination or strong consistency; KV + the edge Cache API are the right fit.
- **Observability headers** on every card response:
  - `X-Cache-Source` — `fresh-kv` (served from KV, no GitHub), `network` (just fetched from GitHub), or `stale-kv` (GitHub down, served last-known-good).
  - `X-Data-Age` — seconds since the data was fetched from GitHub (climbs to `CACHE_FRESH_SECONDS`, then resets on refetch).
  - `X-Edge-Cache` — `HIT` when the Cloudflare edge served the SVG without running the worker, else `MISS`.

## Setup

You need a Cloudflare account and Node.js 20+.

1. Install the dependencies.

   ```
   npm install
   ```

2. Create the KV namespace.

   ```
   npx wrangler kv namespace create CARDS_KV
   ```

3. Copy the returned `id` into `wrangler.toml`, at `[[kv_namespaces]]` → `id`.

4. Add a GitHub token as a secret. GitHub's GraphQL API requires authentication even for public data, so **any valid classic PAT works — no scopes needed**. Add the `read:user` scope only if you want the email row on the profile-details card (that one field is scope-gated by GitHub even though it's public). The Worker reads only public data.

   ```
   npx wrangler secret put GITHUB_TOKEN
   ```

5. Deploy the Worker.

   ```
   npm run deploy
   ```

## Local development

1. Copy the example variables file.

   ```
   cp .dev.vars.example .dev.vars
   ```

2. Put your GitHub token in `.dev.vars`. This file is git-ignored.

3. Start the local server. Wrangler simulates KV automatically.

   ```
   npm run dev
   ```

4. Open a card in a browser, for example:
   `http://localhost:8787/api/cards/profile-details?username=hunterchen7&theme=github_dark`

## Testing

```
npm test          # vitest: rendering, cache behavior, unit tests
npm run typecheck # tsc --noEmit
```

The render tests write sample SVGs so you can inspect the output visually.

## Configuration

Set these in `wrangler.toml` under `[vars]`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `CACHE_FRESH_SECONDS` | `3600` (1h) | how long a KV blob is fresh before a refetch is attempted |
| `BROWSER_CACHE_SECONDS` | `3600` (1h) | `max-age` sent to the browser / GitHub camo proxy |
| `EDGE_CACHE_SECONDS` | `3600` (1h) | edge Cache API TTL (`s-maxage`) |
| `EXCLUDE_REPO` | — | optional comma list of repos to exclude globally |

## License

MIT. This project ports code from `github-profile-summary-cards` (MIT) and `github-readme-stats` (MIT); see [LICENSE](LICENSE).
