// The quality floor lives in the URL (`floor=` / `fl=`), so it travels with every link and share.
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { floorFromParams, floorToParams, type Floor } from '../lib/floor';
import { useUpdateParams } from '../lib/url';

export function useFloor(): [Floor, (f: Floor) => void] {
  const [sp] = useSearchParams();
  const update = useUpdateParams();
  const key = `${sp.get('floor') ?? ''}|${sp.get('fl') ?? ''}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute only when the floor params change
  const floor = useMemo(() => floorFromParams(sp), [key]);
  const setFloor = useCallback(
    (f: Floor) =>
      update(next => {
        for (const [k, v] of Object.entries(floorToParams(f))) {
          if (v == null) next.delete(k);
          else next.set(k, v);
        }
      }),
    [update],
  );
  return [floor, setFloor];
}
