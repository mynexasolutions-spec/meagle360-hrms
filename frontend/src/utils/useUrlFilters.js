import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

// Filter state kept in the URL, so refresh, back and shared links keep it.
// Returns [filters, update]; a value equal to its default is left out of the URL.
export default function useUrlFilters(defaults) {
  const [params, setParams] = useSearchParams();
  const filters = {};
  for (const key of Object.keys(defaults)) filters[key] = params.get(key) ?? defaults[key];

  const update = useCallback((patch) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '' || value === defaults[key]) next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
    // Defaults are constants for the life of a page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setParams]);

  return [filters, update];
}
