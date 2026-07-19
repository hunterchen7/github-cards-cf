// Small helpers ported verbatim from github-readme-stats' src/common/ops.js and
// html.js. Pure functions, no Node/DOM APIs.

export function chunkArray<T>(arr: T[], perChunk: number): T[][] {
  return arr.reduce<T[][]>((resultArray, item, index) => {
    const chunkIndex = Math.floor(index / perChunk);
    if (!resultArray[chunkIndex]) {
      resultArray[chunkIndex] = [];
    }
    resultArray[chunkIndex].push(item);
    return resultArray;
  }, []);
}

export function clampValue(number: number, min: number, max: number): number {
  if (Number.isNaN(parseInt(String(number), 10))) {
    return min;
  }
  return Math.max(min, Math.min(number, max));
}

export function lowercaseTrim(name: string): string {
  return name.toLowerCase().trim();
}

export function parseArray(str: string | null | undefined): string[] {
  if (!str) {
    return [];
  }
  return str.split(',');
}

export function parseBoolean(value: string | boolean | null | undefined): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
}

// Original: /[ -香<>&](?!#)/gim then strip //gim.
// Built from escaped strings so the source carries no invisible control chars.
const ENCODE_HTML_RE = new RegExp('[\\u00A0-\\u9999<>&](?!#)', 'gim');
const STRIP_BACKSPACE_RE = new RegExp('\\u0008', 'gim');

export function encodeHTML(str: string): string {
  return str
    .replace(ENCODE_HTML_RE, (i) => '&#' + i.charCodeAt(0) + ';')
    .replace(STRIP_BACKSPACE_RE, '');
}
