import { describe, expect, it } from 'vitest';
import { PRESETS, floorFromParams, floorToParams, presetOf, type Floor } from './floor';

const toSp = (p: Record<string, string | null>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null) sp.set(k, v);
  return sp;
};

describe('quality floor', () => {
  it('defaults to the default preset when the URL says nothing', () => {
    expect(floorFromParams(new URLSearchParams())).toEqual(PRESETS.default);
  });

  it('round-trips presets and custom floors', () => {
    for (const f of [PRESETS.off, PRESETS.default, PRESETS.strict]) {
      expect(floorFromParams(toSp(floorToParams(f)))).toEqual(f);
    }
    const custom: Floor = { ...PRESETS.default, minReviews: 25, excludeTags: [1, 22], earlyAccess: false, minRating: 60 };
    expect(presetOf(custom)).toBeNull();
    expect(floorFromParams(toSp(floorToParams(custom)))).toEqual(custom);
  });
});
