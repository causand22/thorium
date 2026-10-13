/**
 * Centralized TanStack Query keys used throughout the app.
 *
 * Keeping query keys in one place helps ensure that queries, mutations,
 * cache invalidation, and refetching all reference the same keys consistently.
 * These keys should be used anywhere `useQuery`, `useMutation`,
 * `queryClient.invalidateQueries`, `queryClient.setQueryData`, etc. need to
 * identify or interact with cached server state.
 */
export const queryKeys = {
  groups: {
    details: ['groups', 'details'] as const,
    simple: ['groups', 'simple'] as const,
  },
  files: {
    details: (sha256: string) => ['files', 'details', sha256] as const,
  },
  images: {
    details: (group: string) => ['images', 'details', group] as const,
    simple: (group: string) => ['images', 'simple', group] as const,
  },
  pipelines: {
    all: ['pipelines'] as const,
    details: (group: string) => ['pipelines', 'details', group] as const,
  },
  users: {
    simple: ['users', 'simple'] as const,
  },
  results: (sha256: string) => ['results', sha256] as const,
  entity: (entityId: string) => ['entity', entityId] as const,
  system: {
    stats: ['system', 'stats'] as const,
    settings: ['system', 'settings'] as const,
  },
  login: {
    banner: ['login', 'banner'] as const,
    providers: ['login', 'providers'] as const,
  },
};
