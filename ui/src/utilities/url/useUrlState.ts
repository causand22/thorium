import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

// project imports
import type { ParamCodec } from './codecs';

/**
 * Bind a typed slice of state to the URL query string, using `codec` to (de)serialize it.
 *
 * The URL is the single source of truth: the returned value is decoded from the current params,
 * and the setter re-encodes into the URL. Writes use a functional updater so independent codecs
 * sharing the URL never clobber one another, and `{ replace: true }` so rapid changes (typing in
 * a filter) don't flood browser history.
 *
 * The setter accepts either a new value or an updater function (like `useState`), resolving the
 * updater against the value decoded from the live URL so it's never stale.
 *
 * This is the generic seam for URL state (pattern A1). Swapping the backing store later (e.g. a
 * batched context provider) means rewriting only this file — call sites keep the same
 * `[value, setValue]` shape.
 */
export function useUrlState<T>(codec: ParamCodec<T>, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  // Call sites build their codec and fallback inline, so these are new objects every render. Read them
  // through a ref so the setter and the memos below always use the latest without re-running on identity.
  const latest = useRef({ codec, fallback });
  latest.current = { codec, fallback };

  const paramsString = searchParams.toString();
  // Narrow the full query string down to only the params THIS codec owns, so the decoded value stays
  // referentially stable when unrelated keys change. A codec composes with others on one URL (see
  // codecs.ts): keying the decode on the whole query string would hand callers a brand-new value
  // reference whenever a sibling feature edits its own keys (e.g. the dashboard builder appending seed
  // params on add), needlessly re-firing their effects — and any refetch those effects drive.
  const scopedString = useMemo(() => {
    const all = new URLSearchParams(paramsString);
    const owned = new URLSearchParams();
    // dedupe: repeated params (e.g. `groups`) and dynamic keys (e.g. `tags[KEY]`) can appear more than once
    new Set(latest.current.codec.keys(all)).forEach((key) => {
      all.getAll(key).forEach((value) => owned.append(key, value));
    });
    return owned.toString();
  }, [paramsString]);
  // The decoded value depends on the owned params and on the fallback/defaults it fills in. Key on the
  // fallback's *content* rather than its identity (it is rebuilt each render), so a call site whose
  // defaults genuinely change re-decodes, but an unchanged one keeps a stable reference.
  const fallbackKey = JSON.stringify(fallback);
  const value = useMemo(() => {
    const decoded = latest.current.codec.decode(new URLSearchParams(scopedString));
    return decoded !== undefined ? decoded : latest.current.fallback;
  }, [scopedString, fallbackKey]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setSearchParams(
        (prev) => {
          const { codec, fallback } = latest.current;
          const out = new URLSearchParams(prev);
          // resolve updater functions against the value currently in the URL (never stale)
          const resolved = typeof next === 'function' ? (next as (p: T) => T)(codec.decode(new URLSearchParams(prev)) ?? fallback) : next;
          // clear this codec's existing keys, then write the new value
          codec.keys(out).forEach((key) => out.delete(key));
          codec.encode(resolved, out);
          return out;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return [value, setValue];
}
