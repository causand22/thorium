import { describe, it, expect } from 'vitest';

// project imports
import {
  Clause,
  ClauseCondition,
  ClauseIsMulti,
  CondIsMulti,
  DEFAULT_HIDDEN_TAGS,
  GetValueString,
  NewTextClause,
  parseClauseCondition,
} from './ClauseTypes';

describe('DEFAULT_HIDDEN_TAGS', () => {
  it('hides the Results/Parent/submitter tags by default', () => {
    expect(DEFAULT_HIDDEN_TAGS).toEqual(['Results', 'Parent', 'submitter']);
  });
});

describe('CondIsMulti / ClauseIsMulti', () => {
  it('classifies multi vs single conditions', () => {
    expect(CondIsMulti(ClauseCondition.IsOneOf)).toBe(true);
    expect(CondIsMulti(ClauseCondition.Is)).toBe(false);
    expect(CondIsMulti(ClauseCondition.IsNot)).toBe(false);
    expect(CondIsMulti(ClauseCondition.Includes)).toBe(false);
  });

  it('narrows a clause by its condition', () => {
    const multi: Clause = { category: 'g', field: 'group', condition: ClauseCondition.IsOneOf, value: { values: ['a'] } };
    const single: Clause = { category: 't', field: 'text', condition: ClauseCondition.Is, value: { value: 'x' } };
    expect(ClauseIsMulti(multi)).toBe(true);
    expect(ClauseIsMulti(single)).toBe(false);
  });
});

describe('parseClauseCondition', () => {
  it('parses known conditions case-insensitively', () => {
    expect(parseClauseCondition('IS')).toBe(ClauseCondition.Is);
    expect(parseClauseCondition(' is one of ')).toBe(ClauseCondition.IsOneOf);
  });

  it('returns undefined for an unknown condition', () => {
    expect(parseClauseCondition('contains')).toBeUndefined();
  });

  it('no longer recognises the removed `are` condition', () => {
    expect(parseClauseCondition('are')).toBeUndefined();
  });
});

describe('GetValueString', () => {
  it('joins multi values with a comma', () => {
    const clause: Clause = { category: 'g', field: 'group', condition: ClauseCondition.IsOneOf, value: { values: ['a', 'b'] } };
    expect(GetValueString(clause)).toBe('a, b');
  });

  it('returns the single value directly', () => {
    expect(GetValueString(NewTextClause('hello'))).toBe('hello');
  });
});

describe('NewTextClause', () => {
  it('builds a text/Is clause from a string', () => {
    expect(NewTextClause('q')).toEqual({ category: 'text', field: 'text', condition: ClauseCondition.Is, value: { value: 'q' } });
  });
});
