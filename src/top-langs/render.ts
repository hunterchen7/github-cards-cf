// Layout + measurement helpers ported from github-readme-stats' src/common/render.js.
import { clampValue } from './ops';

export interface FlexLayoutProps {
  items: string[];
  gap: number;
  direction?: 'column' | 'row';
  sizes?: number[];
}

export function flexLayout({ items, gap, direction, sizes = [] }: FlexLayoutProps): string[] {
  let lastSize = 0;
  return items.filter(Boolean).map((item, i) => {
    const size = sizes[i] || 0;
    let transform = `translate(${lastSize}, 0)`;
    if (direction === 'column') {
      transform = `translate(0, ${lastSize})`;
    }
    lastSize += size + gap;
    return `<g transform="${transform}">${item}</g>`;
  });
}

export interface ProgressNodeProps {
  x: number;
  y: number;
  width: number;
  color: string;
  progress: number;
  progressBarBackgroundColor: string;
  delay: number;
}

export function createProgressNode({
  x,
  y,
  width,
  color,
  progress,
  progressBarBackgroundColor,
  delay,
}: ProgressNodeProps): string {
  const progressPercentage = clampValue(progress, 2, 100);
  return `
    <svg width="${width}" x="${x}" y="${y}">
      <rect rx="5" ry="5" x="0" y="0" width="${width}" height="8" fill="${progressBarBackgroundColor}"></rect>
      <svg data-testid="lang-progress" width="${progressPercentage}%">
        <rect
            height="8"
            fill="${color}"
            rx="5" ry="5" x="0" y="0"
            class="lang-progress"
            style="animation-delay: ${delay}ms;"
        />
      </svg>
    </svg>
  `;
}

// Per-character width table (index = char code). Verbatim from render.js.
// prettier-ignore
const WIDTHS = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0.2796875, 0.2765625,
  0.3546875, 0.5546875, 0.5546875, 0.8890625, 0.665625, 0.190625,
  0.3328125, 0.3328125, 0.3890625, 0.5828125, 0.2765625, 0.3328125,
  0.2765625, 0.3015625, 0.5546875, 0.5546875, 0.5546875, 0.5546875,
  0.5546875, 0.5546875, 0.5546875, 0.5546875, 0.5546875, 0.5546875,
  0.2765625, 0.2765625, 0.584375, 0.5828125, 0.584375, 0.5546875,
  1.0140625, 0.665625, 0.665625, 0.721875, 0.721875, 0.665625,
  0.609375, 0.7765625, 0.721875, 0.2765625, 0.5, 0.665625,
  0.5546875, 0.8328125, 0.721875, 0.7765625, 0.665625, 0.7765625,
  0.721875, 0.665625, 0.609375, 0.721875, 0.665625, 0.94375,
  0.665625, 0.665625, 0.609375, 0.2765625, 0.3546875, 0.2765625,
  0.4765625, 0.5546875, 0.3328125, 0.5546875, 0.5546875, 0.5,
  0.5546875, 0.5546875, 0.2765625, 0.5546875, 0.5546875, 0.221875,
  0.240625, 0.5, 0.221875, 0.8328125, 0.5546875, 0.5546875,
  0.5546875, 0.5546875, 0.3328125, 0.5, 0.2765625, 0.5546875,
  0.5, 0.721875, 0.5, 0.5, 0.5, 0.3546875, 0.259375, 0.353125, 0.5890625,
];

const AVG_WIDTH = 0.5279276315789471;

export function measureText(str: string, fontSize = 10): number {
  return (
    str
      .split('')
      .map((c) => (c.charCodeAt(0) < WIDTHS.length ? WIDTHS[c.charCodeAt(0)] : AVG_WIDTH))
      .reduce((cur, acc) => acc + cur) * fontSize
  );
}
