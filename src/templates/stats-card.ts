// Stats card: five icon + label + value rows, with an optional large GitHub logo.
// Ported from github-profile-summary-cards' stats-card.ts.

import { Card } from './card';
import { Icon } from '../const/icon';
import type { Theme } from '../themes/theme';
import { escapeXml } from '../util/svg';

export interface StatRow {
  index: number;
  icon: string; // raw octicon <path> markup
  name: string;
  value: string;
}

export function createStatsCard(
  title: string,
  stats: StatRow[],
  theme: Theme,
  hideLogo = false,
): string {
  const card = new Card(title, hideLogo ? 250 : 340, 200, theme);
  const labelHeight = 14;

  const icons = stats
    .map(
      (d) =>
        `<g class="gpsc-item" style="--gpsc-i:${d.index}">` +
        `<g transform="translate(0,${labelHeight * d.index * 1.8})" fill="${theme.icon}">${d.icon}</g></g>`,
    )
    .join('');
  const names = stats
    .map(
      (d) =>
        `<text x="${labelHeight * 1.5}" y="${labelHeight * d.index * 1.8 + labelHeight}" ` +
        `class="gpsc-item" style="--gpsc-i:${d.index};fill:${theme.text};font-size:${labelHeight}px">${escapeXml(d.name)}</text>`,
    )
    .join('');
  const values = stats
    .map(
      (d) =>
        `<text x="130" y="${labelHeight * d.index * 1.8 + labelHeight}" ` +
        `class="gpsc-item" style="--gpsc-i:${d.index};fill:${theme.text};font-size:${labelHeight}px">${escapeXml(d.value)}</text>`,
    )
    .join('');

  let body = `<g transform="translate(30,20)">${icons}${names}${values}</g>`;
  if (!hideLogo) {
    body += `<g transform="translate(220,20)"><g transform="scale(6)" style="fill:${theme.icon}">${Icon.GITHUB}</g></g>`;
  }

  card.append(body);
  return card.render();
}
