// formatBytes ported from github-readme-stats' src/common/fmt.js (for stats_format=bytes).
export function formatBytes(bytes: number): string {
  if (bytes < 0) {
    throw new Error('Bytes must be a non-negative number');
  }
  if (bytes === 0) {
    return '0 B';
  }
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  const base = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(base));
  if (i >= sizes.length) {
    throw new Error('Bytes is too large to convert to a human-readable string');
  }
  return `${(bytes / Math.pow(base, i)).toFixed(1)} ${sizes[i]}`;
}
