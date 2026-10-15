import { describe, it, expect } from 'vitest';

// project imports
import { restoreClauses } from './clear';
import type { Clause } from './ClauseTypes';

const clause = (id: string) => ({ id }) as unknown as Clause;

describe('restoreClauses', () => {
  it('restores the cleared clauses into an empty omnibar', () => {
    const cleared = [clause('a'), clause('b')];
    expect(restoreClauses(cleared, [])).toEqual(cleared);
  });

  it('keeps clauses added since the clear after the restored ones', () => {
    expect(restoreClauses([clause('a')], [clause('new')])).toEqual([clause('a'), clause('new')]);
  });
});
