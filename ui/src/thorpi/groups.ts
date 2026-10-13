import { Group, GroupUpdate } from '@models/groups';
import client, { parseRequestError } from './client';

/**
 * Create a new group (`POST /groups/`).
 *
 * @param data - The new group's name and optional description.
 * @param errorHandler - Called with a formatted message if the request fails.
 * @returns `true` if the group was created (HTTP 204), otherwise `false`.
 */
export async function createGroup(data: { name: string; description?: string }, errorHandler: (error: string) => void): Promise<boolean> {
  return client
    .post('/groups/', data)
    .then((res) => {
      if (res?.status == 204) {
        return true;
      }
      return false;
    })
    .catch((error: unknown) => {
      parseRequestError(error, errorHandler, 'Create Group');
      return false;
    });
}

/**
 * Delete a group by name (`DELETE /groups/{group}`).
 *
 * @param group - The name of the group to delete.
 * @param errorHandler - Called with a formatted message if the request fails.
 * @returns `true` if the group was deleted (HTTP 204), otherwise `false`.
 */
export async function deleteGroup(group: string, errorHandler: (error: string) => void): Promise<boolean> {
  const url = '/groups/' + group;
  return client
    .delete(url)
    .then((res) => {
      if (res?.status == 204) {
        return true;
      }
      return false;
    })
    .catch((error: unknown) => {
      parseRequestError(error, errorHandler, 'Delete Group');
      return false;
    });
}

/**
 * Fetch a group's full details, including membership (`GET /groups/{group}/details/`).
 *
 * @param group - The name of the group to fetch.
 * @param errorHandler - Called with a formatted message if the request fails.
 * @returns The {@link Group} details, or `null` if not found or the request failed.
 */
export async function getGroup(group: string, errorHandler: (error: string) => void): Promise<Group | null> {
  const url = '/groups/' + group + '/details/';
  return client
    .get<Group>(url)
    .then((res) => {
      if (res?.status == 200 && res.data) {
        return res.data;
      }
      return null;
    })
    .catch((error: unknown) => {
      parseRequestError(error, errorHandler, 'Get Group');
      return null;
    });
}

interface GroupListResponse {
  cursor?: number;
  names: string[];
}

interface GroupDetailsListResponse {
  cursor?: number;
  details: Group[];
}

/**
 * List group names (`GET /groups/`).
 *
 * @param cursor - Pagination cursor from a previous call, or `null` for the first page.
 * @param limit - Maximum number of groups to return per page (defaults to 1000).
 * @returns An array of {@link Group} names
 */
export async function listGroupNames(cursor: string | null = null, limit = 1000): Promise<string[]> {
  const url = '/groups/';
  const params: { limit: number; cursor?: string } = { limit: limit };
  if (cursor) {
    params['cursor'] = cursor;
  }

  return client.get<GroupListResponse>(url, { params: params }).then((res) => {
    if (res?.status == 200 && res.data) {
      return res.data.names.sort();
    }
    throw new Error('error fetching groups');
  });
}

/**
 * List groups with full details (`GET /groups/details/`).
 *
 * @param cursor - Pagination cursor from a previous call, or `null` for the first page.
 * @param limit - Maximum number of groups to return per page (defaults to 1000).
 * @returns An array of {@link Group} details (when `details`)
 */
export async function listGroupDetails(cursor: string | null = null, limit = 1000): Promise<Group[]> {
  const url = '/groups/details/';
  const params: { limit: number; cursor?: string } = { limit: limit };
  if (cursor) {
    params['cursor'] = cursor;
  }

  return client.get<GroupDetailsListResponse>(url, { params: params }).then((res) => {
    if (res?.status == 200 && res.data) {
      return res.data.details;
    }
    throw new Error('Error fetching groups');
  });
}

/**
 * Update a group's metadata and membership (`PATCH /groups/{group}`).
 *
 * @param group - The name of the group to update.
 * @param data - The group fields to change (description, member add/remove lists, etc.).
 * @param errorHandler - Called with a formatted message if the request fails.
 * @returns `true` if the update succeeded (HTTP 204), otherwise `false`.
 */
export async function updateGroup(group: string, data: GroupUpdate, errorHandler: (error: string) => void): Promise<boolean> {
  const url = '/groups/' + group;
  return client
    .patch(url, data)
    .then((res) => {
      if (res?.status == 204) {
        return true;
      }
      return false;
    })
    .catch((error: unknown) => {
      parseRequestError(error, errorHandler, 'Update Group');
      return false;
    });
}
