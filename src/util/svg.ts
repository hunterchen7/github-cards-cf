// Minimal SVG string helpers. Because we build SVG as strings (no DOM / jsdom),
// any user-controlled text (name, email, location, language names) MUST be
// escaped before interpolation so it can't break out of a text node or attribute.

const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => XML_ENTITIES[c]);
}

// Round to at most `digits` decimals and drop trailing zeros, so path/coord
// output stays compact and stable (mirrors how d3 emits numbers).
export function round(value: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}
