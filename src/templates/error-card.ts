import { resolveTheme } from '../themes/theme';
import { escapeXml } from '../util/svg';

// Minimal error card used only when data is both stale-missing AND GitHub is
// unavailable (or the request is malformed). Kept visually consistent with the
// summary cards' frame.
export function errorCard(message: string, themeName = 'default'): string {
  const theme = resolveTheme(themeName);
  const width = 495;
  const height = 120;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>* { font-family: 'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif }</style>` +
    `<rect x="0.5" y="0.5" rx="5" height="99%" width="${width - 1}" ` +
    `fill="${theme.background}" stroke="${theme.stroke}" stroke-opacity="${theme.strokeOpacity}"/>` +
    `<text x="25" y="45" style="font-size:16px;font-weight:600;fill:${theme.title}">Something went wrong</text>` +
    `<text x="25" y="70" style="font-size:12px;fill:${theme.text}">${escapeXml(message)}</text>` +
    `</svg>`
  );
}
