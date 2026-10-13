import client from './client';

// project imports
import { Repo } from '@models/repos';
import { Filters } from '@models/search';

interface ApiCursor<T> {
  cursor?: string;
  data: T[];
}

/**
 * List code repositories matching the given filters (`GET /repos/details/`).
 *
 * Results are paginated via an opaque cursor: pass the returned `entityCursor` back in on the
 * next call to fetch the following page (`null` cursor means no more pages).
 *
 * @param data - Search/filter parameters (groups, tags, time range, limit, etc.).
 * @param cursor - Pagination cursor from a previous call, or `null`/omitted for the first page.
 * @returns The page of repos and the next-page cursor (`entityCursor` is `null` when exhausted).
 */
export async function listReposDetails(
  data: Filters,
  cursor?: string | null,
): Promise<{ entityList: Repo[]; entityCursor: string | null }> {
  const url = '/repos/details/';
  if (cursor) {
    data['cursor'] = cursor;
  }
  return client.get<ApiCursor<Repo>>(url, { params: data }).then((res) => {
    if (res?.status == 200 && res.data) {
      const cursor = res.data.cursor ?? null;
      return { entityList: res.data.data, entityCursor: cursor };
    }
    throw new Error('error getting repo list');
  });
}
