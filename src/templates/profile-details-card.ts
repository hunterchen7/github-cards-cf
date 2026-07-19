// Profile-details card: detail rows (icon + value) plus a monthly contribution
// area chart. Ported from github-profile-summary-cards' profile-details-card.ts.
//
// The original built the SVG (and the d3 axes) with d3-selection + jsdom. Here we
// build strings, but keep the DOM-free d3 generators that define the geometry:
// scaleUtc / scaleLinear (d3-scale), area + curveMonotoneX (d3-shape), extent/max
// (d3-array), utcFormat (d3-time-format). The axes are re-emitted as strings that
// reproduce d3-axis' exact domain-path + tick layout.

import { scaleUtc, scaleLinear } from 'd3-scale';
import { area, curveMonotoneX } from 'd3-shape';
import { extent, max } from 'd3-array';
import { utcFormat } from 'd3-time-format';
import { Card, TITLE_LINE_HEIGHT } from './card';
import type { Theme } from '../themes/theme';
import { escapeXml } from '../util/svg';

export interface DetailRow {
  index: number;
  icon: string; // raw octicon <path> markup
  value: string;
}

interface MonthPoint {
  date: Date;
  contributionCount: number;
}

const CHART_RIGHT_MARGIN = 30;

// Group a trailing-year daily series into monthly buckets (sum per UTC month),
// matching the original's d3.timeFormat('%Y-%m') bucketing on a UTC server.
function toMonthly(daily: { date: string; contributionCount: number }[]): MonthPoint[] {
  const months: MonthPoint[] = [];
  const indexByKey = new Map<string, number>();
  for (const day of daily) {
    const dt = new Date(day.date);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth();
    const key = `${y}-${m}`;
    const existing = indexByKey.get(key);
    if (existing !== undefined) {
      months[existing].contributionCount += day.contributionCount;
    } else {
      indexByKey.set(key, months.length);
      months.push({ date: new Date(Date.UTC(y, m, 1)), contributionCount: day.contributionCount });
    }
  }
  return months;
}

// Reproduce d3.axisBottom(scale): domain path + per-tick line/label. `translateX`
// is the group's own x translate (the original uses -CHART_RIGHT_MARGIN).
function bottomAxis(
  scaleX: (d: Date) => number,
  ticks: Date[],
  fmt: (d: Date) => string,
  theme: Theme,
  chartWidth: number,
  chartHeight: number,
): string {
  const offset = 0.5;
  const r0 = 0 + offset;
  const r1 = chartWidth + offset;
  const domain = `<path fill="none" stroke="${theme.text}" d="M${r0},6V${offset}H${r1}V6"/>`;
  const tickStr = ticks
    .map((t) => {
      const tx = scaleX(t) + offset;
      return (
        `<g transform="translate(${tx},0)"><line stroke="${theme.text}" y2="6"/>` +
        `<text fill="${theme.text}" y="9" dy="0.71em" text-anchor="middle">${escapeXml(fmt(t))}</text></g>`
      );
    })
    .join('');
  return `<g transform="translate(${-CHART_RIGHT_MARGIN},${chartHeight})" font-size="10">${domain}${tickStr}</g>`;
}

// Reproduce d3.axisRight(scale).ticks(n): domain path + per-tick line/label.
function rightAxis(
  scaleY: (d: number) => number,
  ticks: number[],
  fmt: (d: number) => string,
  theme: Theme,
  chartWidth: number,
  chartHeight: number,
): string {
  const offset = 0.5;
  const r0 = chartHeight + offset;
  const r1 = 0 + offset;
  const domain = `<path fill="none" stroke="${theme.text}" d="M6,${r0}H${offset}V${r1}H6"/>`;
  const tickStr = ticks
    .map((t) => {
      const ty = scaleY(t) + offset;
      return (
        `<g transform="translate(0,${ty})"><line stroke="${theme.text}" x2="6"/>` +
        `<text fill="${theme.text}" x="9" dy="0.32em" text-anchor="start">${escapeXml(fmt(t))}</text></g>`
      );
    })
    .join('');
  return `<g transform="translate(${chartWidth - CHART_RIGHT_MARGIN},0)" font-size="10">${domain}${tickStr}</g>`;
}

export function createDetailCard(
  title: string,
  userDetails: DetailRow[],
  contributionsData: { date: string; contributionCount: number }[],
  theme: Theme,
  chartCaption = 'contributions in the last year',
): string {
  const extraTitleLines = Math.max(0, title.split('\n').length - 1);
  const card = new Card(title, 700, 200 + extraTitleLines * TITLE_LINE_HEIGHT, theme);

  const labelHeight = 14;

  // --- detail rows (icon + value) ---
  const icons = userDetails
    .map(
      (d) =>
        `<g transform="translate(0,${labelHeight * d.index * 2})" fill="${theme.icon}">${d.icon}</g>`,
    )
    .join('');
  const texts = userDetails
    .map(
      (d) =>
        `<text x="${labelHeight * 1.5}" y="${labelHeight * d.index * 2 + labelHeight}" ` +
        `style="fill:${theme.text};font-size:${labelHeight}px">${escapeXml(d.value)}</text>`,
    )
    .join('');
  card.append(`<g transform="translate(30,30)">${icons}${texts}</g>`);

  // --- contribution area chart ---
  const monthly = toMonthly(contributionsData);

  const chartWidth = card.width - 2 * card.xPadding - CHART_RIGHT_MARGIN - 230; // 380
  const extraTitleHeight = extraTitleLines * TITLE_LINE_HEIGHT;
  const chartHeight = card.height - extraTitleHeight - 2 * card.yPadding - 10; // 110

  if (monthly.length > 0) {
    const x = scaleUtc().range([0, chartWidth]);
    x.domain(extent(monthly, (d) => d.date) as [Date, Date]);

    const yMax = max(monthly, (d) => d.contributionCount) ?? 0;
    const y = scaleLinear().range([chartHeight, 0]);
    y.domain([0, yMax]);
    y.nice();

    const valueline = area<MonthPoint>()
      .x((d) => x(d.date))
      .y0(y(0))
      .y1((d) => y(d.contributionCount))
      .curve(curveMonotoneX);

    const xTickFmt = utcFormat('%y/%m');
    const xTicks = monthly.filter((_, i) => i % 2 === 0).map((d) => d.date);
    const yTicks = y.ticks(8);
    const yTickFmt = y.tickFormat(8);

    const titleIsTall = title.includes('\n') || title.length > 30;

    const path =
      `<path transform="translate(${-CHART_RIGHT_MARGIN},0)" stroke="${theme.chart}" ` +
      `fill="${theme.chart}" opacity="1" d="${valueline(monthly)}"/>`;
    const xAxisSvg = bottomAxis((d) => x(d), xTicks, xTickFmt, theme, chartWidth, chartHeight);
    const yAxisSvg = rightAxis((d) => y(d), yTicks, yTickFmt, theme, chartWidth, chartHeight);
    const caption =
      `<text x="230" y="${titleIsTall ? 140 : -15}" ` +
      `style="fill:${theme.text};font-size:10px">${escapeXml(chartCaption)}</text>`;

    const chartX = card.width - chartWidth - card.xPadding + 5; // 295
    card.append(`<g transform="translate(${chartX},10)">${path}${xAxisSvg}${yAxisSvg}${caption}</g>`);
  }

  return card.render();
}
