import { describe, it, expect } from 'vitest';

// project imports
import { toListParams } from './params';

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

  it('does not modify the caller\'s filters', () => {
    const filters = { limit: 25, hideTags: ['Results'] };
    toListParams(filters, 'abc');
    expect(filters).toEqual({ limit: 25, hideTags: ['Results'] });
  });
});
