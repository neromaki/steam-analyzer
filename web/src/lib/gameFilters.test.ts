import { describe, expect, it } from 'vitest';
import { activeFilterCount, applyFilters, filtersFromParams, monthEnd, toQuery } from './gameFilters';
import { OPEN } from './range';

const sp = (s: string) => new URLSearchParams(s);

describe('game filters in the URL', () => {
  it('defaults to most-reviewed first with nothing filtered', () => {
    const f = filtersFromParams(sp(''));
    expect(f).toMatchObject({ sort: 'reviews', dir: 'desc', status: 'all', minRating: null, tags: [], any: false });
    expect(activeFilterCount(f)).toBe(0);
  });

  it('reads every key and ignores junk', () => {
    const f = filtersFromParams(sp('tags=492,x,1036&xtags=7&any=1&q=train&desc=1&status=upcoming&rmin=80&pmin=2&pmax=-1&vmin=abc&sort=name'));
    expect(f).toMatchObject({ tags: [492, 1036], xtags: [7], any: true, q: 'train', desc: true, status: 'upcoming',
      minRating: 80, priceMin: 2, priceMax: null, revMin: null, sort: 'name', dir: 'asc' });
    expect(filtersFromParams(sp('sort=bogus&status=nope')).sort).toBe('reviews');
  });

  it('drops defaults when writing, so URLs stay short', () => {
    const p = sp('floor=strict&sort=rating&dir=asc&rmin=50');
    applyFilters(p, { sort: 'reviews', minRating: null, status: 'all' });
    expect(p.toString()).toBe('floor=strict');
    applyFilters(p, { sort: 'name' });
    expect(p.get('sort')).toBe('name');
    expect(p.has('dir')).toBe(false); // A→Z is name's natural direction
    applyFilters(p, { dir: 'desc' });
    expect(p.get('dir')).toBe('desc');
    expect(p.get('sort')).toBe('name');
  });

  it('round-trips', () => {
    const p = sp('');
    applyFilters(p, { tags: [3, 4], status: 'released', priceMax: 10, revMin: 500, sort: 'released', dir: 'asc' });
    const f = filtersFromParams(p);
    expect(f).toMatchObject({ tags: [3, 4], status: 'released', priceMax: 10, revMin: 500, sort: 'released', dir: 'asc' });
    expect(activeFilterCount(f)).toBe(3);
  });
});

describe('toQuery', () => {
  it('turns the month range into whole-month dates', () => {
    const q = toQuery(filtersFromParams(sp('')), { from: '2024-02', to: '2024-02' });
    expect(q).toMatchObject({ from: '2024-02-01', to: '2024-02-29', sort: 'reviews', dir: 'desc' });
    expect(monthEnd('2023-12')).toBe('2023-12-31');
  });

  it('ignores the range for "Upcoming only" and desc without text', () => {
    const q = toQuery(filtersFromParams(sp('status=upcoming&desc=1&any=1&tags=5')), { from: '2020-01', to: null });
    expect(q.from).toBeUndefined();
    expect(q.desc).toBeUndefined();
    expect(q).toMatchObject({ status: 'upcoming', inc: [5], matchAll: false });
  });

  it('sends nothing extra for the defaults', () => {
    expect(toQuery(filtersFromParams(sp('')), OPEN)).toEqual({ sort: 'reviews', dir: 'desc' });
  });
});
