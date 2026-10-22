import { describe, it, expect } from 'vitest';

// project imports
import { OmniClauseAndTimeToFilter } from './search';
import { Clause, ClauseCondition } from '@components/shared/inputs/omnibar/clauses/ClauseTypes';
import { AbsoluteSelection } from '@components/shared/inputs/omnibar/timepicker/utils';
import { defaultOmnibarSettings } from '@components/shared/inputs/omnibar/urlState';

function multi(category: string, field: string, values: string[]): Clause {
  return { category, field, condition: ClauseCondition.IsOneOf, value: { values } };
}

function single(category: string, field: string, value: string): Clause {
  return { category, field, condition: ClauseCondition.Is, value: { value } };
}

describe('OmniClauseAndTimeToFilter', () => {
  it("uses the given settings and empty ranges for 'all' time and no clauses", () => {
    expect(OmniClauseAndTimeToFilter([], { mode: 'all' }, defaultOmnibarSettings())).toEqual({
      limit: 25,
      groups: [],
      tags: {},
      start: null,
      end: null,
      hideTags: [],
      tags_case_insensitive: true,
    });
  });

  it('extracts tag clauses into Filters.tags', () => {
    const clauses: Clause[] = [single('tag', 'family', 'emotet'), single('tag', 'family', 'trickbot'), single('tag', 'av', 'malicious')];
    const filter = OmniClauseAndTimeToFilter(clauses, { mode: 'all' }, defaultOmnibarSettings());
    expect(filter.tags).toEqual({ family: ['emotet', 'trickbot'], av: ['malicious'] });
  });

  it('takes limit and case-sensitivity from settings, not from clauses', () => {
    const filter = OmniClauseAndTimeToFilter([], { mode: 'all' }, { limit: 50, tagsCaseInsensitive: false, hiddenTags: [] });
    expect(filter.limit).toBe(50);
    expect(filter.tags_case_insensitive).toBe(false);
  });

  it('extracts groups from clauses and hidden tags from settings', () => {
    const clauses: Clause[] = [multi('group', 'group', ['team-a', 'team-b'])];
    const settings = { ...defaultOmnibarSettings(), hiddenTags: ['Results', 'Parent'] };
    const filter = OmniClauseAndTimeToFilter(clauses, { mode: 'all' }, settings);
    expect(filter.groups).toEqual(['team-a', 'team-b']);
    expect(filter.hideTags).toEqual(['Results', 'Parent']);
  });

  it('maps an absolute range into the inverted Filters start/end (start = latest, end = earliest)', () => {
    const earlier = new Date('2026-01-01T00:00:00.000Z');
    const later = new Date('2026-02-01T00:00:00.000Z');
    const sel: AbsoluteSelection = { mode: 'absolute', start: earlier, end: later };
    const filter = OmniClauseAndTimeToFilter([], sel, defaultOmnibarSettings());
    // Filters.start is documented as the latest date to start listing from (paging backwards)
    expect(filter.start).toBe(later.toISOString());
    expect(filter.end).toBe(earlier.toISOString());
  });
});
