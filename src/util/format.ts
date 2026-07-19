// Single import point for number abbreviation so every card formats identically
// to github-profile-summary-cards (which uses this same package).
import { abbreviateNumber as _abbr } from 'js-abbreviation-number';

export function abbreviateNumber(value: number, decimalPlaces: number): string {
  return _abbr(value, decimalPlaces);
}
