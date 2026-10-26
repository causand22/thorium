import { describe, expect, it } from 'vitest';
import { ClauseCondition } from './ClauseTypes';
import { OmnibarKey, OmnibarRegistry, parseBuffer } from './parse';
import { buildRows, ChoiceRow, operatorStageActiveRow, PendingKey, rowIsSelectable } from './suggestions';

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
    field('name', { conditions: [ClauseCondition.Includes, ClauseCondition.Is, ClauseCondition.IsNot] }),
    field('depth', { values: ['1', '2'] }),
  ],
  // `role` here is a tag shadowed by the `role` field, so it is only reachable as `tag:role`
  tags: [
    {
      key: 'role',
      kind: 'tag',
      category: 'tag',
      conditions: [ClauseCondition.Is, ClauseCondition.IsNot],
      orCapable: false,
      creatable: true,
      values: [],
    },
  ],
  tagTemplate: { category: 'tag', conditions: [ClauseCondition.Is, ClauseCondition.IsNot], orCapable: false },
};

function choices(buffer: string): ChoiceRow[] {
  return buildRows(buffer, registry, true).filter(rowIsSelectable);
}

function keyRowFor(buffer: string, label: string): ChoiceRow {
  const row = choices(buffer).find((entry) => entry.kind === 'key' && entry.label === label);
  if (!row) throw new Error(`no key row '${label}' for '${buffer}'`);
  return row;
}

function pendingFor(buffer: string, label: string): PendingKey {
  const { pendingKey } = keyRowFor(buffer, label);
  if (!pendingKey) throw new Error(`key row '${label}' does not open the operator stage`);
  return pendingKey;
}

describe('key rows', () => {
  it('open the operator stage when the key has a choice of operators', () => {
    const row = keyRowFor('rol', 'role');
    expect(row.insert).toBe('role');
    expect(row.pendingKey?.key.key).toBe('role');
    expect(row.pendingKey?.forcedTag).toBe(false);
  });

  it('write the operator straight away when the key only has one', () => {
    const row = keyRowFor('dep', 'depth');
    expect(row.insert).toBe('depth=');
    expect(row.pendingKey).toBeUndefined();
  });

  it('open the stage for a shadowed tag, keeping the `tag:` prefix', () => {
    const row = keyRowFor('rol', 'tag:role');
    expect(row.insert).toBe('tag:role');
    expect(row.pendingKey?.forcedTag).toBe(true);
  });

  it('open the stage for a tag key the user invents when the template allows `!=`', () => {
    const row = keyRowFor('zzz', 'zzz');
    expect(row.helpText).toBe('Use as a tag key');
    expect(row.insert).toBe('zzz');
    expect(row.pendingKey?.key.category).toBe('tag');
  });
});

// `depth` is a reserved field that is NOT also a known tag key, so it reaches the invented-key path
// while still being shadowed. A registry where every shadowed name is also a known tag (as `role` is)
// cannot exercise this.
describe('invented tag keys shadowed by a reserved field', () => {
  function operatorRow(buffer: string, label: string, symbol: string): ChoiceRow {
    const row = buildRows(buffer, registry, true, pendingFor(buffer, label))
      .filter(rowIsSelectable)
      .find((entry) => entry.helpText === symbol);
    if (!row) throw new Error(`no '${symbol}' operator row for '${buffer}'`);
    return row;
  }

  it('carries the `tag:` prefix, like a known shadowed tag does', () => {
    const row = keyRowFor('depth', 'tag:depth');
    expect(row.helpText).toBe('Use as a tag key');
    expect(row.insert).toBe('tag:depth');
    expect(row.pendingKey?.forcedTag).toBe(true);
    expect(row.pendingKey?.key.category).toBe('tag');
  });

  it('leaves an unshadowed invented key unprefixed', () => {
    expect(keyRowFor('zzz', 'zzz').pendingKey?.forcedTag).toBe(false);
  });

  // the defect this guards: unprefixed, the row wrote `depth=`, which resolves to the reserved field,
  // so picking a row labelled "Use as a tag key" silently produced a *field* clause instead
  it('writes a buffer that parses back to a tag clause, not the shadowing field', () => {
    const { insert } = operatorRow('depth', 'tag:depth', '=');
    expect(parseBuffer(`${insert}3`, registry, true).result).toEqual({
      kind: 'clause',
      clause: { category: 'tag', field: 'depth', condition: ClauseCondition.Is, value: { value: '3' } },
    });
  });

  // the same defect's other face: the invented key inherits the tag template's operators, so an
  // unprefixed row offered `!=` that the `depth` field rejects — the dropdown suggesting a parse error
  it('offers `!=` from the tag template and that operator parses', () => {
    const { insert } = operatorRow('depth', 'tag:depth', '!=');
    expect(insert).toBe('tag:depth!=');
    expect(parseBuffer(`${insert}3`, registry, true).result).toEqual({
      kind: 'clause',
      clause: { category: 'tag', field: 'depth', condition: ClauseCondition.IsNot, value: { value: '3' } },
    });
  });

  it('still offers the reserved field itself as its own row', () => {
    expect(keyRowFor('depth', 'depth').insert).toBe('depth=');
  });
});

describe('operator stage rows', () => {
  const stageRows = (buffer: string, label: string) => buildRows(buffer, registry, true, pendingFor(buffer, label));
  const operators = (rows: ReturnType<typeof stageRows>) => rows.filter(rowIsSelectable);

  it('lists is and is not for a key without substring matching, under a header', () => {
    const rows = stageRows('rol', 'role');
    expect(rows[0]).toEqual({ kind: 'header', label: 'Operator for role' });
    expect(operators(rows).map((row) => [row.label, row.insert, row.helpText])).toEqual([
      ['is', 'role=', '='],
      ['is not', 'role!=', '!='],
    ]);
  });

  it('always orders is, is not, includes, whatever the key lists first', () => {
    const rows = stageRows('nam', 'name');
    expect(operators(rows).map((row) => row.insert)).toEqual(['name=', 'name!=', 'name~']);
  });

  it('keeps the `tag:` prefix on a shadowed tag', () => {
    const rows = stageRows('rol', 'tag:role');
    expect(operators(rows).map((row) => row.insert)).toEqual(['tag:role=', 'tag:role!=']);
  });

  it('never commits on pick', () => {
    expect(operators(stageRows('rol', 'role')).every((row) => !row.commit)).toBe(true);
  });

  it('starts on the key default, below the header', () => {
    expect(operatorStageActiveRow(pendingFor('rol', 'role'))).toBe(1);
    expect(operatorStageActiveRow(pendingFor('nam', 'name'))).toBe(3);
  });
});

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
