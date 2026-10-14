import { describe, expect, it } from 'vitest';
import { ClauseCondition } from './ClauseTypes';
import { OmnibarKey, OmnibarRegistry } from './parse';
import { buildRows, ChoiceRow, rowIsSelectable } from './suggestions';

// spec: ../SPEC.md

function field(key: string, over: Partial<OmnibarKey> = {}): OmnibarKey {
  return { key, kind: 'field', category: key, conditions: [ClauseCondition.Is], orCapable: false, creatable: true, values: [], ...over };
}

// `role` mirrors the Users bar: or-capable, and negatable
const registry: OmnibarRegistry = {
  fields: [
    field('role', {
      values: ['Admin', 'Analyst'],
      creatable: false,
      orCapable: true,
      conditions: [ClauseCondition.Is, ClauseCondition.IsOneOf, ClauseCondition.IsNot],
    }),
    field('label', {
      values: ['red', 'blue'],
      creatable: true,
      orCapable: true,
      conditions: [ClauseCondition.Is, ClauseCondition.IsOneOf, ClauseCondition.IsNot],
    }),
  ],
  tags: [],
};

function choices(buffer: string): ChoiceRow[] {
  return buildRows(buffer, registry, true).filter(rowIsSelectable);
}

describe('value rows for an or-capable key', () => {
  it('offers multi-select under `=`: a trailing comma and no commit', () => {
    const [first] = choices('role=');
    expect(first.insert).toBe('role=Admin,');
    expect(first.commit).toBe(false);
  });

  it('keeps the earlier picks when adding another under `=`', () => {
    const rows = choices('role=Admin,');
    expect(rows.find((row) => row.label === 'Analyst')?.insert).toBe('role=Admin,Analyst,');
  });

  // the parser rejects `role!=Admin,Analyst`, so the dropdown must not walk the user into it
  it('commits a single value on pick under `!=`', () => {
    const [first] = choices('role!=');
    expect(first.insert).toBe('role!=Admin');
    expect(first.commit).toBe(true);
  });

  it('commits a typed custom value outright under `!=`', () => {
    const custom = choices('label!=green').find((row) => row.label === 'green');
    expect(custom?.insert).toBe('label!=green');
    expect(custom?.commit).toBe(true);
  });

  it('still invites a further custom value under `=`', () => {
    const custom = choices('label=green').find((row) => row.label === 'green');
    expect(custom?.insert).toBe('label=green,');
    expect(custom?.commit).toBe(false);
  });
});
