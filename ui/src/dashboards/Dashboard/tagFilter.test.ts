import { describe, expect, it } from 'vitest';

// project imports
import { activeTagValues, resetFilterClauses, toggleTagValue } from './tagFilter';
import { ClauseCondition, type Clause } from '@components/shared/inputs/omnibar/clauses/ClauseTypes';

// spec: ./SPEC.md

/** Build a single-value `Is` tag clause — the only shape a tag filter takes (SPEC §14.2). */
function tagClause(key: string, value: string): Clause {
  return { category: 'tag', field: key, condition: ClauseCondition.Is, value: { value } };
}

/** Build a legacy multi-value tag clause, as an older shared link may still encode. */
function legacyMultiTagClause(key: string, values: string[]): Clause {
  return { category: 'tag', field: key, condition: ClauseCondition.IsOneOf, value: { values } };
}

/** Build a single-value `Is` tag clause (the pre-merge shape used elsewhere). */
function includeClause(value: string): Clause {
  return { category: 'Include', field: 'Include', condition: ClauseCondition.Is, value: { value } };
}

/** Build a depth clause. */
function depthClause(depth: number): Clause {
  return { category: 'depth', field: 'depth', condition: ClauseCondition.Is, value: { value: String(depth) } };
}

describe('toggleTagValue', () => {
  it('creates a fresh single-value clause when the key is absent', () => {
    expect(toggleTagValue([], 'FileType', 'PE32')).toEqual([tagClause('FileType', 'PE32')]);
  });

  // the Scylla census ANDs values for one key, so two selected values must read as two chips rather
  // than one chip implying an OR the query never performs
  it('adds a second value as its own clause', () => {
    const result = toggleTagValue([tagClause('FileType', 'PE32')], 'FileType', 'ELF');
    expect(result).toEqual([tagClause('FileType', 'PE32'), tagClause('FileType', 'ELF')]);
  });

  it('removes a value already present', () => {
    const clauses = [tagClause('FileType', 'PE32'), tagClause('FileType', 'ELF')];
    expect(toggleTagValue(clauses, 'FileType', 'PE32')).toEqual([tagClause('FileType', 'ELF')]);
  });

  it('drops the last clause for a key when its value is removed', () => {
    expect(toggleTagValue([tagClause('FileType', 'PE32')], 'FileType', 'PE32')).toEqual([]);
  });

  it('preserves other clauses and their order', () => {
    const clauses = [depthClause(2), tagClause('FileType', 'PE32'), includeClause('Device')];
    expect(toggleTagValue(clauses, 'FileType', 'ELF')).toEqual([
      depthClause(2),
      tagClause('FileType', 'PE32'),
      tagClause('FileType', 'ELF'),
      includeClause('Device'),
    ]);
  });

  it('appends a new key clause after existing clauses, preserving order', () => {
    const clauses = [depthClause(2), includeClause('Device')];
    expect(toggleTagValue(clauses, 'FileType', 'PE32')).toEqual([depthClause(2), includeClause('Device'), tagClause('FileType', 'PE32')]);
  });

  it('does not touch clauses for a different tag key', () => {
    const clauses = [tagClause('FileType', 'PE32'), tagClause('os', 'linux')];
    expect(toggleTagValue(clauses, 'os', 'windows')).toEqual([
      tagClause('FileType', 'PE32'),
      tagClause('os', 'linux'),
      tagClause('os', 'windows'),
    ]);
  });

  // a link shared before this change can still carry one multi-value clause; a toggle normalises it
  it('expands a legacy multi-value clause into single-value clauses', () => {
    const clauses = [legacyMultiTagClause('FileType', ['PE32', 'ELF'])];
    expect(toggleTagValue(clauses, 'FileType', 'MachO')).toEqual([
      tagClause('FileType', 'PE32'),
      tagClause('FileType', 'ELF'),
      tagClause('FileType', 'MachO'),
    ]);
  });

  it('toggling the same value twice removes it', () => {
    const once = toggleTagValue([], 'FileType', 'PE32');
    expect(toggleTagValue(once, 'FileType', 'PE32')).toEqual([]);
  });
});

describe('activeTagValues', () => {
  const valuesFor = (clauses: Clause[], key: string) => Array.from(activeTagValues(clauses).get(key) ?? []);

  it('reports no active values for an empty clause list', () => {
    expect(activeTagValues([]).size).toBe(0);
  });

  // the regression: toggleTagValue emits single-value `Is` clauses, so matching only `IsOneOf` here
  // reported nothing active and blanked every chip's highlight
  it('reports single-value `is` clauses as active', () => {
    expect(valuesFor([tagClause('FileType', 'PE32')], 'FileType')).toEqual(['PE32']);
  });

  it('reports a legacy multi-value clause from an older link as active', () => {
    expect(valuesFor([legacyMultiTagClause('FileType', ['PE32', 'ELF'])], 'FileType')).toEqual(['PE32', 'ELF']);
  });

  it('keeps each key separate and ignores non-tag clauses', () => {
    const clauses = [tagClause('FileType', 'PE32'), tagClause('arch', 'x86'), includeClause('File'), depthClause(3)];
    const active = activeTagValues(clauses);
    expect(Array.from(active.keys()).sort()).toEqual(['FileType', 'arch']);
    expect(valuesFor(clauses, 'FileType')).toEqual(['PE32']);
    expect(valuesFor(clauses, 'arch')).toEqual(['x86']);
  });

  // the invariant that ties the two together: a chip is highlighted exactly when clicking it would
  // toggle the value back off. Asserting it here is what stops the pair drifting apart again.
  it('stays in lockstep with toggleTagValue across a toggle on and off', () => {
    const on = toggleTagValue([], 'FileType', 'PE32');
    expect(valuesFor(on, 'FileType')).toEqual(['PE32']);

    const both = toggleTagValue(on, 'FileType', 'ELF');
    expect(valuesFor(both, 'FileType').sort()).toEqual(['ELF', 'PE32']);

    const off = toggleTagValue(both, 'FileType', 'PE32');
    expect(valuesFor(off, 'FileType')).toEqual(['ELF']);

    expect(activeTagValues(toggleTagValue(off, 'FileType', 'ELF')).size).toBe(0);
  });

  it('reports a legacy multi-value clause as active after it is normalised by a toggle', () => {
    const normalised = toggleTagValue([legacyMultiTagClause('FileType', ['PE32', 'ELF'])], 'FileType', 'MachO');
    expect(valuesFor(normalised, 'FileType')).toEqual(['PE32', 'ELF', 'MachO']);
  });
});

describe('resetFilterClauses', () => {
  it('returns an empty list for empty input', () => {
    expect(resetFilterClauses([])).toEqual([]);
  });

  it('keeps depth clauses, dropping the rest', () => {
    const clauses = [
      depthClause(3),
      tagClause('FileType', 'PE32'),
      includeClause('Device'),
      { category: 'text', field: 'text', condition: ClauseCondition.Is, value: { value: 'foo' } } as Clause,
    ];
    expect(resetFilterClauses(clauses)).toEqual([depthClause(3)]);
  });

  // hidden tags are no longer clauses, so a reset cannot disturb them
  it('preserves the order of kept clauses', () => {
    const clauses = [depthClause(1), tagClause('FileType', 'PE32'), depthClause(2)];
    expect(resetFilterClauses(clauses)).toEqual([depthClause(1), depthClause(2)]);
  });
});
