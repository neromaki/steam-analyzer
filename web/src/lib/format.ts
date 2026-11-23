// Display formatting shared by every page.

const nf = new Intl.NumberFormat('en-GB');
const cf = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtInt = (n: number | null | undefined) => (n == null ? '–' : nf.format(n));
export const fmtCompact = (n: number | null | undefined) => (n == null ? '–' : cf.format(n));
export const fmtPct = (x: number | null | undefined, digits = 1) =>
  x == null || !Number.isFinite(x) ? '–' : `${x.toFixed(digits)}%`;

export function fmtDate(iso: string | null | undefined, comingSoon = false): string {
  if (!iso) return comingSoon ? 'Coming soon' : '–';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export const yearOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 4) : '');

export function fmtPrice(price: number | null | undefined, isFree: boolean): string {
  if (isFree) return 'Free';
  return price == null ? '–' : `£${Number(price).toFixed(2)}`;
}

/** SteamDB-style colour band for a review score; games with few reviews stay neutral. */
export function ratingTone(pctPositive: number | null | undefined, reviews: number): 'good' | 'mixed' | 'bad' | 'none' {
  if (pctPositive == null || reviews < 10) return 'none';
  if (pctPositive >= 70) return 'good';
  if (pctPositive >= 40) return 'mixed';
  return 'bad';
}

export const steamUrl = (appid: number) => `https://store.steampowered.com/app/${appid}/`;
