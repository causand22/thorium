import { useCallback, useEffect, useRef, useState } from 'react';
import { HashJump } from './hash';

// spec: ../SPEC.md

export type HashLookup = {
  /** The sha256 being looked up, or `null` when no lookup is running. */
  lookingUp: string | null;
  /** Message to show after a miss on a bar that can't commit the hash as a chip. */
  miss: string | undefined;
  /** Look the hash up, then open the file, or fall back on a miss. */
  start: (sha256: string) => void;
  /** Discard a lookup in flight and clear the miss message. */
  cancel: () => void;
};

const HASH_NOT_FOUND = 'No file found with that sha256';

/**
 * The async half of the omnibar's hash jump: look a sha256 up, then open its file.
 *
 * On a miss a bar with free text calls `commitMiss` so the hash becomes an ordinary text chip, as Enter
 * would have; a bar without one exposes {@link HashLookup.miss} instead, since the hash can't become a
 * chip. Any `cancel` (an edit, blur or Escape) or an unmount invalidates a lookup in flight, so a stale
 * answer never navigates.
 */
export function useHashLookup(hashJump: HashJump | undefined, hasFreeText: boolean, commitMiss: () => void): HashLookup {
  const [lookingUp, setLookingUp] = useState<string | null>(null);
  const [miss, setMiss] = useState<string | undefined>(undefined);
  // bumped to invalidate a lookup in flight
  const token = useRef(0);
  // the lookup outlives the render that started it, so its callback reads the latest props through this
  const latest = useRef({ hashJump, hasFreeText, commitMiss });
  useEffect(() => {
    latest.current = { hashJump, hasFreeText, commitMiss };
  });

  useEffect(() => {
    const current = token;
    return () => {
      current.current += 1;
    };
  }, []);

  const cancel = useCallback(() => {
    token.current += 1;
    setLookingUp(null);
    setMiss(undefined);
  }, []);

  const start = useCallback((sha256: string) => {
    const { hashJump: jump } = latest.current;
    if (!jump) return;
    const mine = token.current + 1;
    token.current = mine;
    setLookingUp(sha256);
    setMiss(undefined);
    void jump
      .lookup(sha256)
      .catch(() => false)
      .then((found) => {
        if (mine !== token.current) return;
        setLookingUp(null);
        if (found) {
          jump.open(sha256);
        } else if (!latest.current.hasFreeText) {
          setMiss(HASH_NOT_FOUND);
        } else {
          latest.current.commitMiss();
        }
      });
  }, []);

  return { lookingUp, miss, start, cancel };
}
