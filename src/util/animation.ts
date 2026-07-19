// Optional, opt-in card entrance animations for the summary cards. Pure declarative
// CSS injected into the finished SVG (no JS) so GitHub's camo proxy — which strips
// <script> but renders CSS animations — still animates them. Ported from
// github-profile-summary-cards' animation.ts.
//
// The animation targets hooks that the summary templates emit: `.gpsc-item`
// (title lines, detail/stat rows, donut legend entries, each carrying a `--gpsc-i`
// index), `.gpsc-chart` (the profile area-chart wrapper), `.arc` (donut arcs), and
// `.gpsc-reveal` (the area-chart reveal clip). The background rect is never
// animated, so the frame shows immediately.

export type AnimationName =
  'fade' | 'rise' | 'draw' | 'stagger' | 'load' | 'sequence' | 'tint' | 'rgb' | 'rgb-soft';

const ANIMATIONS: ReadonlySet<string> = new Set([
  'fade',
  'rise',
  'draw',
  'stagger',
  'load',
  'sequence',
  'tint',
  'rgb',
  'rgb-soft',
]);

const DEFAULT_DURATION: Record<AnimationName, number> = {
  fade: 3,
  rise: 3,
  draw: 2.5,
  stagger: 2.6,
  load: 3,
  sequence: 2.8,
  tint: 3,
  rgb: 5,
  'rgb-soft': 5,
};

const MIN_DURATION = 0.2;
const MAX_DURATION = 10;

export function parseAnimation(value: unknown): AnimationName | undefined {
  return typeof value === 'string' && ANIMATIONS.has(value) ? (value as AnimationName) : undefined;
}

export function parseDuration(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, n));
}

const KEYFRAMES = `
@keyframes gpsc-fade{from{opacity:0}to{opacity:1}}
@keyframes gpsc-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes gpsc-grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes gpsc-pop{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:scale(1)}}
@keyframes gpsc-wipe{from{transform:translateX(calc(-1 * var(--gpsc-w,420px)))}to{transform:translateX(0)}}
@keyframes gpsc-tint{from{filter:sepia(.7) saturate(4) hue-rotate(-70deg)}to{filter:sepia(0) saturate(1) hue-rotate(0)}}
@keyframes gpsc-rgb{0%{filter:hue-rotate(0deg) saturate(1)}50%{filter:hue-rotate(180deg) saturate(1.7)}100%{filter:hue-rotate(360deg) saturate(1)}}`;

const s = (seconds: number): string => `${Number(seconds.toFixed(3))}s`;
const itemDelay = (step: number): string => `calc(var(--gpsc-i,0) * ${s(step)})`;
const GROW = 'transform-box:fill-box;transform-origin:center bottom';
const POP = 'transform-box:fill-box;transform-origin:center';

const PRESETS: Record<AnimationName, (d: number) => string> = {
  fade: (d) => `.gpsc-item,.gpsc-chart,.arc,rect.bar{animation:gpsc-fade ${s(d)} ease both}`,
  rise: (d) =>
    `.gpsc-item,.gpsc-chart,.arc,rect.bar{animation:gpsc-rise ${s(d)} cubic-bezier(.2,.7,.3,1) both ${itemDelay(d * 0.05)}}`,
  draw: (d) =>
    `.gpsc-item{animation:gpsc-fade ${s(d * 0.5)} ease both}` +
    `.arc{animation:gpsc-pop ${s(d * 0.6)} ease both;${POP}}` +
    `rect.bar{animation:gpsc-grow ${s(d)} cubic-bezier(.2,.7,.3,1) both;${GROW}}` +
    `.gpsc-reveal{animation:gpsc-wipe ${s(d)} linear both}`,
  stagger: (d) =>
    `.gpsc-item,.gpsc-chart,.arc,rect.bar{animation:gpsc-fade ${s(d * 0.6)} ease both ${itemDelay(d * 0.08)}}`,
  load: (d) =>
    `.gpsc-item{animation:gpsc-fade ${s(d * 0.4)} ease both ${itemDelay(d * 0.06)}}` +
    `.arc{animation:gpsc-pop ${s(d * 0.4)} ease both ${s(d * 0.45)};${POP}}` +
    `rect.bar{animation:gpsc-grow ${s(d * 0.5)} cubic-bezier(.2,.7,.3,1) both ${s(d * 0.45)};${GROW}}` +
    `.gpsc-reveal{animation:gpsc-wipe ${s(d * 0.6)} linear both ${s(d * 0.4)}}`,
  sequence: (d) =>
    `.gpsc-item{animation:gpsc-fade ${s(d * 0.3)} ease both ${itemDelay(d * 0.12)}}` +
    `.arc{animation:gpsc-pop ${s(d * 0.35)} ease both ${itemDelay(d * 0.12)};${POP}}` +
    `rect.bar{animation:gpsc-grow ${s(d * 0.3)} cubic-bezier(.2,.7,.3,1) both ${itemDelay(d * 0.035)};${GROW}}` +
    `.gpsc-reveal{animation:gpsc-wipe ${s(d * 0.9)} linear both ${itemDelay(d * 0.12)}}`,
  tint: (d) =>
    `.gpsc-item,.gpsc-chart,.arc,rect.bar{animation:gpsc-fade ${s(d * 0.5)} ease both,gpsc-tint ${s(d)} ease both}`,
  rgb: (d) => `.gpsc-root{animation:gpsc-rgb ${s(d)} linear infinite}`,
  'rgb-soft': (d) =>
    `.gpsc-item,.gpsc-chart,.arc,rect.bar{animation:gpsc-rgb ${s(d)} linear infinite}`,
};

const REDUCED_MOTION = `@media (prefers-reduced-motion:reduce){.gpsc-root,.gpsc-root *,.gpsc-item,.gpsc-chart,rect.bar,.arc,.gpsc-reveal{animation:none!important}}`;

// Inject animation CSS into a rendered summary-card SVG. No-op for unknown/absent
// presets. `durationRaw` is the raw query value (falls back to the preset default).
export function applyAnimation(
  svg: string,
  name: AnimationName | undefined,
  durationRaw?: unknown,
): string {
  if (!name) return svg;
  const d = parseDuration(durationRaw, DEFAULT_DURATION[name]);
  const css = `${KEYFRAMES}${PRESETS[name](d)}${REDUCED_MOTION}`;
  return svg.replace(/(<svg\b[^>]*>)/, `$1<style>${css}</style>`);
}
