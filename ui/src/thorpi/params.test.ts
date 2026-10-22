import { describe, it, expect } from 'vitest';

// project imports
import { listFetchKey, toListParams } from './params';

describe('toListParams', () => {
  it('drops hideTags, which no API route accepts', () => {
    const params = toListParams({ limit: 25, hideTags: ['Results'], tags_case_insensitive: true });
    expect(params).toEqual({ limit: 25, tags_case_insensitive: true });
    expect('hideTags' in params).toBe(false);
  });

  it('adds the cursor when given one', () => {
    expect(toListParams({ limit: 25 }, 'abc')).toEqual({ limit: 25, cursor: 'abc' });
  });

  it.each([null, undefined, ''])('omits an empty cursor (%j)', (cursor) => {
    expect('cursor' in toListParams({ limit: 25 }, cursor)).toBe(false);
  });

  it("does not modify the caller's filters", () => {
    const filters = { limit: 25, hideTags: ['Results'] };
    toListParams(filters, 'abc');
    expect(filters).toEqual({ limit: 25, hideTags: ['Results'] });
  });
});

describe('listFetchKey', () => {
  it('ignores hideTags so changing hidden tags does not change the key', () => {
    expect(listFetchKey({ limit: 25, hideTags: ['Results'] })).toBe(listFetchKey({ limit: 25, hideTags: [] }));
    expect(listFetchKey({ limit: 25, hideTags: ['Results'] })).toBe(listFetchKey({ limit: 25 }));
  });

  it('changes when a fetch-relevant filter changes', () => {
    expect(listFetchKey({ limit: 25 })).not.toBe(listFetchKey({ limit: 50 }));
    expect(listFetchKey({ limit: 25 })).not.toBe(listFetchKey({ limit: 25, tags_case_insensitive: true }));
  });

  it('is stable across distinct objects with the same contents', () => {
    expect(listFetchKey({ limit: 25, groups: ['a'] })).toBe(listFetchKey({ limit: 25, groups: ['a'] }));
  });
});
