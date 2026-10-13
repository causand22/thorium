import { Pipeline, PipelineCreate, PipelineUpdate } from '@models/pipelines';
import client, { parseRequestError } from './client';

interface PipelineListResponse {
  cursor?: number;
  names: string[];
}

interface PipelineDetailsListResponse {
  cursor?: number;
  details: Pipeline[];
}

/**
 * Create a new pipeline (`POST /pipelines/`).
 *
 * @param pipeline - The pipeline definition to create (group, name, stage order, triggers, etc.).
 * @param errorHandler - Called with a formatted message if the request fails.
 * @returns `true` if the pipeline was created (HTTP 204), otherwise `false`.
 */
export async function createPipeline(pipeline: PipelineCreate, errorHandler: (error: string) => void): Promise<boolean> {
  return client
    .post('/pipelines/', pipeline)
    .then((res) => {
      if (res?.status == 204) {
        return true;
      }
      return false;
    })
    .catch((error: unknown) => {
      parseRequestError(error, errorHandler, 'Create Pipeline');
      return false;
    });
}

/**
 * Delete a pipeline from a group (`DELETE /pipelines/{group}/{pipeline}`).
 *
 * @param group - The group the pipeline belongs to.
 * @param pipeline - The name of the pipeline to delete.
 * @param errorHandler - Called with a formatted message if the request fails.
 * @returns `true` if the pipeline was deleted (HTTP 204), otherwise `false`.
 */
export async function deletePipeline(group: string, pipeline: string, errorHandler: (error: string) => void): Promise<boolean> {
  const url = '/pipelines/' + group + '/' + pipeline;
  return client
    .delete(url)
    .then((res) => {
      if (res?.status == 204) {
        return true;
      }
      return false;
    })
    .catch((error: unknown) => {
      parseRequestError(error, errorHandler, 'Delete Pipeline');
      return false;
    });
}

/**
 * Fetch a single pipeline by name, scoped to a group (`GET /pipelines/data/{group}/{pipeline}`).
 *
 * @param group - The group the pipeline belongs to.
 * @param pipeline - The name of the pipeline to fetch.
 * @param errorHandler - Called with a formatted message if the request fails.
 * @returns The {@link Pipeline}, or `null` if not found or the request failed.
 */
export async function getPipeline(group: string, pipeline: string, errorHandler: (error: string) => void): Promise<Pipeline | null> {
  const url = '/pipelines/data/' + group + '/' + pipeline;
  return client
    .get<Pipeline>(url)
    .then((res) => {
      if (res?.status == 200 && res.data) {
        return res.data;
      }
      return null;
    })
    .catch((error: unknown) => {
      parseRequestError(error, errorHandler, 'Get Pipeline');
      return null;
    });
}

/**
 * List the pipelines in a group as names
 *
 * @param group - The group whose pipelines to list.
 * @param cursor - Pagination cursor from a previous call, or `null` for the first page.
 * @param limit - Maximum number of pipelines to return per page (defaults to 100).
 * @returns An array of names
 */
export async function listPipelinesSimple(group: string, cursor: string | null = null, limit = 100): Promise<string[]> {
  const url = '/pipelines/list/' + group + '/';
  const params: { limit: number; cursor?: string } = { limit };
  if (cursor) params.cursor = cursor;
  const res = await client.get<PipelineListResponse>(url, { params });
  if (res.status === 200 && res.data) {
    return res.data.names;
  }
  throw new Error('Invalid List Pipelines response');
}

/**
 * List the pipelines in a group with full details (`GET /pipelines/list/{group}/details/`).
 *
 * @param group - The group whose pipelines to list.
 * @param cursor - Pagination cursor from a previous call, or `null` for the first page.
 * @param limit - Maximum number of pipelines to return per page (defaults to 100).
 * @returns An array of {@link Pipeline} details (when `details`)
 */
export async function listPipelinesDetails(group: string, cursor: string | null = null, limit = 100): Promise<Pipeline[]> {
  const url = `/pipelines/list/${group}/details/`;

  const params: { limit: number; cursor?: string } = { limit };
  if (cursor) params.cursor = cursor;

  const res = await client.get<PipelineDetailsListResponse>(url, { params });

  if (res.status === 200 && res.data) {
    return res.data.details;
  }

  throw new Error('Invalid List Pipelines response');
}

/**
 * Update an existing pipeline (`PATCH /pipelines/{group}/{pipeline}`).
 *
 * @param group - The group the pipeline belongs to.
 * @param pipeline - The name of the pipeline to update.
 * @param data - The pipeline fields to change (stage order, SLA, triggers, description, etc.).
 * @param errorHandler - Called with a formatted message if the request fails.
 * @returns `true` if the update succeeded (HTTP 204), otherwise `false`.
 */
export async function updatePipeline(
  group: string,
  pipeline: string,
  data: PipelineUpdate,
  errorHandler: (error: string) => void,
): Promise<boolean> {
  const url = '/pipelines/' + group + '/' + pipeline;
  return client
    .patch(url, data)
    .then((res) => {
      if (res?.status == 204) {
        return true;
      }
      return false;
    })
    .catch((error: unknown) => {
      parseRequestError(error, errorHandler, 'Update Pipeline');
      return false;
    });
}
