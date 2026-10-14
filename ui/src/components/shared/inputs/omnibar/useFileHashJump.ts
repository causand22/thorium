import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';

// project imports
import { HashJump } from './clauses/hash';
import { getFileDetails } from '@thorpi/files';
import { queryKeys } from '@thorpi/queryKeys';

// spec: ./SPEC.md

/**
 * The page-side half of the omnibar's hash jump: look a sha256 up, then open its file page.
 *
 * Pages call this and pass the result to their omnibar, which keeps the shared omnibar free of the router
 * and the API client. The lookup goes through the query cache under the file page's own key, so a hit
 * is already loaded when `/file/:sha256` renders.
 *
 * A failed lookup of any kind reads as "not found". The API answers a missing file and one the user
 * can't see identically (404), and a network error is not worth a separate message here.
 */
export function useFileHashJump(): HashJump {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMemo(
    () => ({
      lookup: async (sha256) => {
        try {
          await queryClient.fetchQuery({ queryKey: queryKeys.files.details(sha256), queryFn: () => getFileDetails(sha256) });
          return true;
        } catch {
          return false;
        }
      },
      open: (sha256) => void navigate(`/file/${sha256}`),
    }),
    [navigate, queryClient],
  );
}
