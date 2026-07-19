// Donut chart card (repos-per-language / most-commit-language legend + donut).
// Ported from github-profile-summary-cards' donut-chart-card.ts: the d3-selection
// + jsdom DOM building is replaced with template strings, but the geometry and
// the DOM-free d3-shape generators (pie, arc) are identical.

import { pie as d3pie, arc as d3arc, type PieArcDatum } from 'd3-shape';
import { Card } from './card';
import type { Theme } from '../themes/theme';
import { escapeXml } from '../util/svg';

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

export function createDonutChartCard(title: string, data: DonutDatum[], theme: Theme): string {
  const card = new Card(title, 340, 200, theme);

  const margin = 10;
  const radius = (Math.min(card.width, card.height) - 2 * margin - card.yPadding) / 2;
  const labelHeight = 14;

  const pieGen = d3pie<DonutDatum>().value((d) => d.value);
  const pieData = pieGen(data);
  const arcGen = d3arc<PieArcDatum<DonutDatum>>()
    .outerRadius(radius - 10)
    .innerRadius(radius / 2);

  // Legend (colored swatch + language name), one row per slice.
  const legendItems = pieData
    .map((d) => {
      const rectY = labelHeight * d.index * 1.8 + card.height / 2 - radius - 12;
      const textY = labelHeight * d.index * 1.8 + card.height / 2 - radius;
      const rect =
        `<rect y="${rectY}" width="${labelHeight}" height="${labelHeight}" class="gpsc-item" ` +
        `style="--gpsc-i:${d.index}" fill="${d.data.color}" stroke="${theme.background}" stroke-width="1px"/>`;
      const text =
        `<text x="${labelHeight * 1.2}" y="${textY}" class="gpsc-item" ` +
        `style="--gpsc-i:${d.index};fill:${theme.text};font-size:${labelHeight}px">${escapeXml(d.data.name)}</text>`;
      return rect + text;
    })
    .join('');
  const legend = `<g transform="translate(${card.xPadding + margin},0)">${legendItems}</g>`;

  // Donut arcs.
  const arcs = pieData
    .map(
      (d) =>
        `<g class="arc" style="--gpsc-i:${d.index}"><path d="${arcGen(d)}" fill="${d.data.color}" ` +
        `stroke="${theme.background}" style="stroke-width:2px"/></g>`,
    )
    .join('');
  const pieGroup =
    `<g transform="translate(${card.width - radius - margin - card.xPadding},` +
    `${(card.height - card.yPadding) / 2})">${arcs}</g>`;

  card.append(legend + pieGroup);
  return card.render();
}
