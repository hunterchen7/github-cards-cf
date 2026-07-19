// Top-languages card (compact + normal layouts), ported from
// github-readme-stats' src/cards/top-languages.js. Only the layouts needed for
// the requested embed are implemented; pie/donut/donut-vertical fall back to
// normal. Aggregation consumes the shared repos dataset (languages by size).

import { Card } from './card';
import { getCardColors } from './color';
import { formatBytes } from './fmt';
import { chunkArray, clampValue, lowercaseTrim } from './ops';
import { createProgressNode, flexLayout, measureText } from './render';
import type { RepoNode } from '../github/repos';

export interface Lang {
  name: string;
  color: string | null;
  size: number;
  count: number;
}

export interface TopLangOptions {
  hide_title?: boolean;
  hide_border?: boolean;
  card_width?: number;
  title_color?: string;
  text_color?: string;
  bg_color?: string;
  hide?: string[];
  hide_progress?: boolean;
  theme?: string;
  layout?: string;
  custom_title?: string;
  langs_count?: number;
  border_radius?: number;
  border_color?: string;
  disable_animations?: boolean;
  stats_format?: string;
}

const DEFAULT_CARD_WIDTH = 300;
const MIN_CARD_WIDTH = 280;
const DEFAULT_LANG_COLOR = '#858585';
const CARD_PADDING = 25;
const COMPACT_LAYOUT_BASE_HEIGHT = 90;
const MAXIMUM_LANGS_COUNT = 20;
const NORMAL_LAYOUT_DEFAULT_LANGS_COUNT = 5;
const COMPACT_LAYOUT_DEFAULT_LANGS_COUNT = 6;

const LANG_CARD_TITLE = 'Most Used Languages';
const NO_DATA_TEXT = 'No languages data.';

// --- aggregation (fetchTopLanguages, minus the network) ---

/**
 * Aggregate the repos dataset into per-language byte sizes. Mirrors the original
 * fetcher's reduce chain. Defaults (size_weight=1, count_weight=0) => size.
 */
export function aggregateTopLanguages(
  repos: RepoNode[],
  excludeRepo: string[] = [],
  sizeWeight = 1,
  countWeight = 0,
): Record<string, Lang> {
  const repoToHide: Record<string, boolean> = {};
  for (const name of excludeRepo) {
    repoToHide[name] = true;
  }

  const visible = repos.filter((repo) => !repoToHide[repo.name]);

  let repoCount = 0;
  const acc = visible
    .filter((node) => node.languages.edges.length > 0)
    .reduce<RepoNode['languages']['edges']>((all, curr) => curr.languages.edges.concat(all), [])
    .reduce<Record<string, Lang>>((result, prev) => {
      let langSize = prev.size;
      if (result[prev.node.name] && prev.node.name === result[prev.node.name].name) {
        langSize = prev.size + result[prev.node.name].size;
        repoCount += 1;
      } else {
        repoCount = 1;
      }
      return {
        ...result,
        [prev.node.name]: {
          name: prev.node.name,
          color: prev.node.color,
          size: langSize,
          count: repoCount,
        },
      };
    }, {});

  Object.keys(acc).forEach((name) => {
    acc[name].size = Math.pow(acc[name].size, sizeWeight) * Math.pow(acc[name].count, countWeight);
  });

  const topLangs = Object.keys(acc)
    .sort((a, b) => acc[b].size - acc[a].size)
    .reduce<Record<string, Lang>>((result, key) => {
      result[key] = acc[key];
      return result;
    }, {});

  return topLangs;
}

// --- layout helpers ---

const getLongestLang = (arr: Lang[]): Lang =>
  arr.reduce<Lang>((saved, lang) => (lang.name.length > saved.name.length ? lang : saved), {
    name: '',
    size: 0,
    color: '',
    count: 0,
  });

const calculateCompactLayoutHeight = (totalLangs: number): number =>
  COMPACT_LAYOUT_BASE_HEIGHT + Math.round(totalLangs / 2) * 25;

const calculateNormalLayoutHeight = (totalLangs: number): number => 45 + (totalLangs + 1) * 40;

const getDefaultLanguagesCountByLayout = ({
  layout,
  hide_progress,
}: {
  layout?: string;
  hide_progress?: boolean;
}): number =>
  layout === 'compact' || hide_progress === true
    ? COMPACT_LAYOUT_DEFAULT_LANGS_COUNT
    : NORMAL_LAYOUT_DEFAULT_LANGS_COUNT;

function trimTopLanguages(
  topLangs: Record<string, Lang>,
  langs_count: number,
  hide?: string[],
): { langs: Lang[]; totalLanguageSize: number } {
  let langs = Object.values(topLangs);
  const langsToHide: Record<string, boolean> = {};
  const langsCount = clampValue(langs_count, 1, MAXIMUM_LANGS_COUNT);

  if (hide) {
    hide.forEach((langName) => {
      langsToHide[lowercaseTrim(langName)] = true;
    });
  }

  langs = langs
    .sort((a, b) => b.size - a.size)
    .filter((lang) => !langsToHide[lowercaseTrim(lang.name)])
    .slice(0, langsCount);

  const totalLanguageSize = langs.reduce((acc, curr) => acc + curr.size, 0);
  return { langs, totalLanguageSize };
}

const getDisplayValue = (size: number, percentages: number, format: string): string =>
  format === 'bytes' ? formatBytes(size) : `${percentages.toFixed(2)}%`;

function createCompactLangNode({
  lang,
  totalSize,
  hideProgress,
  statsFormat = 'percentages',
  index,
}: {
  lang: Lang;
  totalSize: number;
  hideProgress?: boolean;
  statsFormat?: string;
  index: number;
}): string {
  const percentages = (lang.size / totalSize) * 100;
  const displayValue = getDisplayValue(lang.size, percentages, statsFormat);
  const staggerDelay = (index + 3) * 150;
  const color = lang.color || DEFAULT_LANG_COLOR;

  return `
    <g class="stagger" style="animation-delay: ${staggerDelay}ms">
      <circle cx="5" cy="6" r="5" fill="${color}" />
      <text data-testid="lang-name" x="15" y="10" class='lang-name'>
        ${lang.name} ${hideProgress ? '' : displayValue}
      </text>
    </g>
  `;
}

function createLanguageTextNode({
  langs,
  totalSize,
  hideProgress,
  statsFormat,
}: {
  langs: Lang[];
  totalSize: number;
  hideProgress?: boolean;
  statsFormat?: string;
}): string {
  const longestLang = getLongestLang(langs);
  const chunked = chunkArray(langs, langs.length / 2);
  const layouts = chunked.map((array) => {
    const items = array.map((lang, index) =>
      createCompactLangNode({ lang, totalSize, hideProgress, statsFormat, index }),
    );
    return flexLayout({ items, gap: 25, direction: 'column' }).join('');
  });

  const percent = ((longestLang.size / totalSize) * 100).toFixed(2);
  const minGap = 150;
  const maxGap = 20 + measureText(`${longestLang.name} ${percent}%`, 11);
  return flexLayout({ items: layouts, gap: maxGap < minGap ? minGap : maxGap }).join('');
}

function renderCompactLayout(
  langs: Lang[],
  width: number,
  totalLanguageSize: number,
  hideProgress: boolean | undefined,
  statsFormat = 'percentages',
): string {
  const paddingRight = 50;
  const offsetWidth = width - paddingRight;
  let progressOffset = 0;
  const compactProgressBar = langs
    .map((lang) => {
      const percentage = parseFloat(((lang.size / totalLanguageSize) * offsetWidth).toFixed(2));
      const progress = percentage < 10 ? percentage + 10 : percentage;
      const output = `
        <rect
          mask="url(#rect-mask)"
          data-testid="lang-progress"
          x="${progressOffset}"
          y="0"
          width="${progress}"
          height="8"
          fill="${lang.color || DEFAULT_LANG_COLOR}"
        />
      `;
      progressOffset += percentage;
      return output;
    })
    .join('');

  return `
  ${
    hideProgress
      ? ''
      : `
      <mask id="rect-mask">
          <rect x="0" y="0" width="${offsetWidth}" height="8" fill="white" rx="5"/>
        </mask>
        ${compactProgressBar}
      `
  }
    <g transform="translate(0, ${hideProgress ? '0' : '25'})">
      ${createLanguageTextNode({ langs, totalSize: totalLanguageSize, hideProgress, statsFormat })}
    </g>
  `;
}

function createProgressTextNode({
  width,
  color,
  name,
  size,
  totalSize,
  statsFormat,
  index,
}: {
  width: number;
  color: string;
  name: string;
  size: number;
  totalSize: number;
  statsFormat: string;
  index: number;
}): string {
  const staggerDelay = (index + 3) * 150;
  const paddingRight = 95;
  const progressTextX = width - paddingRight + 10;
  const progressWidth = width - paddingRight;
  const progress = (size / totalSize) * 100;
  const displayValue = getDisplayValue(size, progress, statsFormat);

  return `
    <g class="stagger" style="animation-delay: ${staggerDelay}ms">
      <text data-testid="lang-name" x="2" y="15" class="lang-name">${name}</text>
      <text x="${progressTextX}" y="34" class="lang-name">${displayValue}</text>
      ${createProgressNode({
        x: 0,
        y: 25,
        color,
        width: progressWidth,
        progress,
        progressBarBackgroundColor: '#ddd',
        delay: staggerDelay + 300,
      })}
    </g>
  `;
}

function renderNormalLayout(
  langs: Lang[],
  width: number,
  totalLanguageSize: number,
  statsFormat: string,
): string {
  return flexLayout({
    items: langs.map((lang, index) =>
      createProgressTextNode({
        width,
        name: lang.name,
        color: lang.color || DEFAULT_LANG_COLOR,
        size: lang.size,
        totalSize: totalLanguageSize,
        statsFormat,
        index,
      }),
    ),
    gap: 40,
    direction: 'column',
  }).join('');
}

function noLanguagesDataNode({ color, text }: { color: string; text: string }): string {
  return `
    <text x="0" y="11" class="stat bold" fill="${color}">${text}</text>
  `;
}

export function renderTopLanguages(
  topLangs: Record<string, Lang>,
  options: TopLangOptions = {},
): string {
  const {
    hide_title = false,
    hide_border = false,
    card_width,
    title_color,
    text_color,
    bg_color,
    hide,
    hide_progress,
    theme,
    layout,
    custom_title,
    langs_count = getDefaultLanguagesCountByLayout({ layout, hide_progress }),
    border_radius,
    border_color,
    disable_animations,
    stats_format = 'percentages',
  } = options;

  const { langs, totalLanguageSize } = trimTopLanguages(topLangs, langs_count, hide);

  let width = card_width
    ? isNaN(card_width)
      ? DEFAULT_CARD_WIDTH
      : card_width < MIN_CARD_WIDTH
        ? MIN_CARD_WIDTH
        : card_width
    : DEFAULT_CARD_WIDTH;
  let height = calculateNormalLayoutHeight(langs.length);

  const colors = getCardColors({ title_color, text_color, bg_color, border_color, theme });

  let finalLayout = '';
  if (langs.length === 0) {
    height = COMPACT_LAYOUT_BASE_HEIGHT;
    finalLayout = noLanguagesDataNode({ color: colors.textColor, text: NO_DATA_TEXT });
  } else if (layout === 'compact' || hide_progress === true) {
    height = calculateCompactLayoutHeight(langs.length) + (hide_progress ? -25 : 0);
    finalLayout = renderCompactLayout(langs, width, totalLanguageSize, hide_progress, stats_format);
  } else {
    // normal (and unsupported pie/donut variants fall back here)
    finalLayout = renderNormalLayout(langs, width, totalLanguageSize, stats_format);
  }

  const card = new Card({
    customTitle: custom_title,
    defaultTitle: LANG_CARD_TITLE,
    width,
    height,
    border_radius,
    colors,
  });

  if (disable_animations) {
    card.disableAnimations();
  }
  card.setHideBorder(hide_border);
  card.setHideTitle(hide_title);
  card.setCSS(`
    @keyframes slideInAnimation {
      from { width: 0; }
      to { width: calc(100%-100px); }
    }
    @keyframes growWidthAnimation {
      from { width: 0; }
      to { width: 100%; }
    }
    .stat {
      font: 600 14px 'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif; fill: ${colors.textColor};
    }
    @supports(-moz-appearance: auto) {
      .stat { font-size:12px; }
    }
    .bold { font-weight: 700 }
    .lang-name {
      font: 400 11px "Segoe UI", Ubuntu, Sans-Serif;
      fill: ${colors.textColor};
    }
    .stagger {
      opacity: 0;
      animation: fadeInAnimation 0.3s ease-in-out forwards;
    }
    #rect-mask rect{
      animation: slideInAnimation 1s ease-in-out forwards;
    }
    .lang-progress{
      animation: growWidthAnimation 0.6s ease-in-out forwards;
    }
  `);

  return card.render(`
    <svg data-testid="lang-items" x="${CARD_PADDING}">
      ${finalLayout}
    </svg>
  `);
}
