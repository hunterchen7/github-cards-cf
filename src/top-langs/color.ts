// Color resolution ported from github-readme-stats' src/common/color.js.
// Users pass bare hex (no '#'); fallbackColor prepends it. Only bgColor may be a
// gradient (string[]). A minimal `themes` table is embedded (just enough named
// themes are unnecessary here — the card is driven by explicit *_color params).

const DEFAULT_THEME = {
  title_color: '2f80ed',
  icon_color: '4c71f2',
  text_color: '434d58',
  bg_color: 'fffefe',
  border_color: 'e4e2e2',
};

// The reference project supports named themes; here we only ship `default` since
// callers of this card pass explicit colors. Unknown theme names fall back to it.
const themes: Record<string, Partial<typeof DEFAULT_THEME>> = { default: DEFAULT_THEME };

export function isValidHexColor(hexColor: string): boolean {
  return new RegExp(/^([A-Fa-f0-9]{8}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3}|[A-Fa-f0-9]{4})$/).test(
    hexColor,
  );
}

export function isValidGradient(colors: string[]): boolean {
  return colors.length > 2 && colors.slice(1).every((color) => isValidHexColor(color));
}

export function fallbackColor(
  color: string | undefined,
  fallback: string | string[],
): string | string[] {
  let gradient: string[] | null = null;
  const colors = color ? color.split(',') : [];
  if (colors.length > 1 && isValidGradient(colors)) {
    gradient = colors;
  }
  return (gradient ? gradient : isValidHexColor(color ?? '') && `#${color}`) || fallback;
}

export interface CardColors {
  titleColor: string;
  iconColor: string;
  textColor: string;
  bgColor: string | string[];
  borderColor: string;
}

export interface GetCardColorsArgs {
  title_color?: string;
  text_color?: string;
  icon_color?: string;
  bg_color?: string;
  border_color?: string;
  theme?: string;
}

export function getCardColors({
  title_color,
  text_color,
  icon_color,
  bg_color,
  border_color,
  theme,
}: GetCardColorsArgs): CardColors {
  const defaultTheme = themes['default'];
  const isThemeProvided = theme !== null && theme !== undefined;
  const selectedTheme = (isThemeProvided ? themes[theme] : defaultTheme) ?? defaultTheme;

  const defaultBorderColor =
    'border_color' in selectedTheme ? selectedTheme.border_color! : defaultTheme.border_color!;

  const titleColor = fallbackColor(
    title_color || selectedTheme.title_color,
    '#' + defaultTheme.title_color,
  );
  const iconColor = fallbackColor(
    icon_color || selectedTheme.icon_color,
    '#' + defaultTheme.icon_color,
  );
  const textColor = fallbackColor(
    text_color || selectedTheme.text_color,
    '#' + defaultTheme.text_color,
  );
  const bgColor = fallbackColor(bg_color || selectedTheme.bg_color, '#' + defaultTheme.bg_color);
  const borderColor = fallbackColor(border_color || defaultBorderColor, '#' + defaultBorderColor);

  if (
    typeof titleColor !== 'string' ||
    typeof textColor !== 'string' ||
    typeof iconColor !== 'string' ||
    typeof borderColor !== 'string'
  ) {
    throw new Error('Unexpected behavior, all colors except background should be string.');
  }

  return { titleColor, iconColor, textColor, bgColor, borderColor };
}
