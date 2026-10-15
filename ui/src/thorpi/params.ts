import { Filters, SearchFilters } from '@models/search';

/**
 * Query params for a list request. `hideTags` is a client-side display filter that no API route
 * accepts, so it is dropped here rather than sent as an unknown param. Returns a new object: the
 * caller's `filters` (often React state) is not modified.
 */
export function toListParams(filters: Filters, cursor?: string | null): Omit<Filters, 'hideTags'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hideTags, ...params } = filters;
  return cursor ? { ...params, cursor } : params;
}

/**
 * A value-stable key over the filters that affect what a list request returns. Display-only filters
 * (`hideTags`) are left out, so an effect keyed on this refetches only when the request would change, not
 * whenever a new `filters` object is built with the same fetch-relevant contents.
 */
export function listFetchKey(filters: Filters | SearchFilters): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hideTags, ...params } = filters;
  return JSON.stringify(params);
}
