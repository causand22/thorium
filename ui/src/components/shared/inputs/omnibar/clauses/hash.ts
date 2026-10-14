/**
 * Jumping straight to a file when the buffer is exactly one sha256.
 *
 * This file is pure and router-free: it only recognises a bare hash and describes the two side effects
 * a page must supply (see {@link HashJump}). Looking the file up and navigating to it belong to the
 * page, so the omnibar itself stays independent of the router and the API client.
 */

// project imports
import { isValidSha256 } from '@utilities/files';

// spec: ../SPEC.md

/**
 * What a page supplies to enable the hash jump on its omnibar. Bars without one are unchanged.
 *
 * `lookup` must never reject: any failure (404, network, 500) is a plain `false`. It also cannot tell a
 * missing file from one the user may not see, since the API answers both with a 404.
 */
export type HashJump = {
  /** Whether a file with this sha256 exists and is visible to the user. */
  lookup: (sha256: string) => Promise<boolean>;
  /** Go to the file's page. Called only after `lookup` resolved `true` and nothing changed meanwhile. */
  open: (sha256: string) => void;
};

/**
 * The lowercased sha256 when the whole buffer is exactly one, otherwise `undefined`.
 *
 * Surrounding whitespace is ignored. A quoted hash is deliberately not a hash: in the grammar a quoted
 * buffer is verbatim free text, and quoting is how someone searches for the literal string.
 */
export function asBareSha256(buffer: string): string | undefined {
  const trimmed = buffer.trim();
  return isValidSha256(trimmed) ? trimmed.toLowerCase() : undefined;
}
