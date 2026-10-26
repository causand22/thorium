import { describe, expect, it } from 'vitest';
import { asBareSha256 } from './hash';

const HASH = 'a'.repeat(32) + 'B'.repeat(32);

describe('asBareSha256', () => {
  it('recognises a 64-character hex string and lowercases it', () => {
    expect(asBareSha256(HASH)).toBe(HASH.toLowerCase());
  });

  it('ignores surrounding whitespace, as a pasted hash often carries a trailing newline', () => {
    expect(asBareSha256(`  ${HASH}\n`)).toBe(HASH.toLowerCase());
  });

  it('rejects the wrong length', () => {
    expect(asBareSha256(HASH.slice(1))).toBeUndefined();
    expect(asBareSha256(`${HASH}0`)).toBeUndefined();
  });

  it('rejects non-hex characters', () => {
    expect(asBareSha256('g' + HASH.slice(1))).toBeUndefined();
  });

  it('rejects the shorter md5 and sha1 lengths, which have no lookup route', () => {
    expect(asBareSha256('a'.repeat(32))).toBeUndefined();
    expect(asBareSha256('a'.repeat(40))).toBeUndefined();
  });

  it('rejects a quoted hash, which the grammar reads as verbatim free text', () => {
    expect(asBareSha256(`"${HASH}"`)).toBeUndefined();
  });

  it('rejects a hash inside a clause or among other text', () => {
    expect(asBareSha256(`sha256=${HASH}`)).toBeUndefined();
    expect(asBareSha256(`${HASH} malware`)).toBeUndefined();
    expect(asBareSha256(`${HASH}\n${HASH}`)).toBeUndefined();
  });

  it('rejects an empty buffer', () => {
    expect(asBareSha256('')).toBeUndefined();
  });
});
