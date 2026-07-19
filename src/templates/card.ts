import type { Theme } from '../themes/theme';
import { escapeXml } from '../util/svg';

// Vertical space each additional title line occupies. Cards with multi-line
// titles (profile-details) grow their canvas by the same amount.
export const TITLE_LINE_HEIGHT = 24;

const FONT_STYLE = `* {
          font-family: 'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif
        }`;

/**
 * String-based re-implementation of github-profile-summary-cards' Card frame.
 * The original built the SVG through d3-selection + jsdom; on Workers there is
 * no DOM, so we assemble the same geometry as a string. Body content is added
 * via `append()` and rendered inside a group translated below the title block.
 */
export class Card {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly xPadding: number;
  readonly yPadding: number;
  private readonly theme: Theme;
  private readonly bodyParts: string[] = [];

  constructor(
    title: string,
    width: number,
    height: number,
    theme: Theme,
    xPadding = 30,
    yPadding = 40,
  ) {
    this.title = title;
    this.width = width;
    this.height = height;
    this.theme = theme;
    this.xPadding = xPadding;
    this.yPadding = yPadding;
  }

  /** Append raw SVG markup into the translated body group. */
  append(svg: string): void {
    this.bodyParts.push(svg);
  }

  private titleLines(): string[] {
    return this.title === '' ? [] : this.title.split('\n');
  }

  /** Y-offset applied to the body group so it clears the rendered title block. */
  bodyOffset(): number {
    const lines = this.titleLines();
    return lines.length <= 1 ? 40 : 40 + (lines.length - 1) * TITLE_LINE_HEIGHT;
  }

  render(): string {
    const strokeWidth = 1;
    const heightPct = ((this.height - 2 * strokeWidth) / this.height) * 100;
    const widthPct = ((this.width - 2 * strokeWidth) / this.width) * 100;

    const rect =
      `<rect x="1" y="1" rx="5" ry="5" ` +
      `height="${heightPct}%" width="${widthPct}%" ` +
      `stroke="${this.theme.stroke}" stroke-width="${strokeWidth}" ` +
      `fill="${this.theme.background}" stroke-opacity="${this.theme.strokeOpacity}"/>`;

    const titles = this.titleLines()
      .map((line, i) => {
        const y = this.yPadding + i * TITLE_LINE_HEIGHT;
        return (
          `<text x="${this.xPadding}" y="${y}" class="gpsc-item" ` +
          `style="--gpsc-i:${i};font-size:22px;fill:${this.theme.title}">${escapeXml(line)}</text>`
        );
      })
      .join('');

    const body = `<g transform="translate(0,${this.bodyOffset()})">${this.bodyParts.join('')}</g>`;

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" ` +
      `viewBox="0 0 ${this.width} ${this.height}">` +
      `<style>${FONT_STYLE}</style>` +
      `<g class="gpsc-root">${rect}${titles}${body}</g>` +
      `</svg>`
    );
  }
}
