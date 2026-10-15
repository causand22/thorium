import type { Clause } from './ClauseTypes';

// spec: ../SPEC.md

/**
 * The clauses to bring back when the user undoes a clear-all.
 *
 * Normally the omnibar is still empty and this is just the cleared clauses. If the user has started a new
 * filter in the meantime, theirs are kept after the restored ones, so an undo never discards newer edits.
 *
 * @param cleared - The clauses that were removed.
 * @param current - The clauses present when the undo is clicked.
 * @returns The clause list to set.
 */
export function restoreClauses(cleared: Clause[], current: Clause[]): Clause[] {
  return [...cleared, ...current];
}
