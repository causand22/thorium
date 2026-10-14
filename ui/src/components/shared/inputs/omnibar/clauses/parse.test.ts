import { describe, expect, it } from 'vitest';
import { Clause, ClauseCondition } from './ClauseTypes';
import {
  clausesEqual,
  OmnibarKey,
  OmnibarRegistry,
  parseBuffer,
  resolveKey,
  serializeClause,
  symbolToCondition,
} from './parse';

// spec: ../SPEC.md

// ---- fixtures -----------------------------------------------------------------------------------

function field(key: string, over: Partial<OmnibarKey> = {}): OmnibarKey {
  return { key, kind: 'field', category: key, conditions: [ClauseCondition.Is], orCapable: false, creatable: true, values: [], ...over };
}

function tag(key: string, values: string[] = [], over: Partial<OmnibarKey> = {}): OmnibarKey {
  return { key, kind: 'tag', category: 'tag', conditions: [ClauseCondition.Is], orCapable: false, creatable: true, values, ...over };
}

/** A registry shaped like the main search bar: groups, index, tags, free text, and negation allowed. */
function searchRegistry(): OmnibarRegistry {
  return {
    fields: [
      field('group', {
        values: ['static', 'staging'],
        creatable: false,
        orCapable: true,
        conditions: [ClauseCondition.Is, ClauseCondition.IsOneOf],
      }),
      field('index', {
        values: ['SampleTags', 'RepoTags'],
        creatable: false,
        orCapable: true,
        conditions: [ClauseCondition.Is, ClauseCondition.IsOneOf],
      }),
      field('name', { conditions: [ClauseCondition.Is, ClauseCondition.Includes], values: ['unpacker'] }),
    ],
    tags: [
      tag('arch', ['x86', 'arm'], { conditions: [ClauseCondition.Is, ClauseCondition.IsNot] }),
      tag('Lang', ['Rust', 'C'], { conditions: [ClauseCondition.Is, ClauseCondition.IsNot] }),
      // a tag key shadowed by the reserved `group` field — only reachable via `tag:`
      tag('group', ['shadowed']),
    ],
    tagTemplate: { category: 'tag', conditions: [ClauseCondition.Is, ClauseCondition.IsNot], orCapable: false },
    text: field('text', { category: 'text' }),
  };
}

/** A registry shaped like the Scylla-backed browsing bar: no negation on tags, no free text. */
function browsingRegistry(): OmnibarRegistry {
  return {
    fields: [field('group', { values: ['static'], creatable: false, orCapable: true, conditions: [ClauseCondition.Is, ClauseCondition.IsOneOf] })],
    tags: [tag('arch', ['x86'])],
    tagTemplate: { category: 'tag', conditions: [ClauseCondition.Is], orCapable: false },
  };
}

function parse(buffer: string, registry: OmnibarRegistry = searchRegistry(), caseInsensitive = true) {
  return parseBuffer(buffer, registry, caseInsensitive);
}

function single(category: string, field: string, value: string, condition = ClauseCondition.Is): Clause {
  return { category, field, condition, value: { value } } as Clause;
}

function multi(category: string, field: string, values: string[], condition = ClauseCondition.IsOneOf): Clause {
  return { category, field, condition, value: { values } } as Clause;
}

function expectClause(buffer: string, expected: Clause, registry?: OmnibarRegistry) {
  const result = parse(buffer, registry).result;
  expect(result, `expected '${buffer}' to parse as a clause`).toMatchObject({ kind: 'clause' });
  if (result.kind === 'clause') expect(result.clause).toEqual(expected);
}

function expectError(buffer: string, registry?: OmnibarRegistry) {
  expect(parse(buffer, registry).result.kind, `expected '${buffer}' to be an error`).toBe('error');
}

function expectIncomplete(buffer: string, registry?: OmnibarRegistry) {
  expect(parse(buffer, registry).result.kind, `expected '${buffer}' to be incomplete`).toBe('incomplete');
}

// ---- grammar ------------------------------------------------------------------------------------

describe('parseBuffer: free text', () => {
  it('treats a bare word as text', () => {
    expectClause('searchQuery', single('text', 'text', 'searchQuery'));
  });

  it('keeps spaces in text without quoting', () => {
    expectClause('foo bar baz', single('text', 'text', 'foo bar baz'));
  });

  it('treats a reserved key with no operator as text', () => {
    expectClause('group', single('text', 'text', 'group'));
  });

  it('strips exactly one outer quote pair', () => {
    expectClause('"group=static"', single('text', 'text', 'group=static'));
  });

  it('keeps inner quotes when stripping the outer pair', () => {
    expectClause('""hello""', single('text', 'text', '"hello"'));
  });

  it('treats an operator at index 0 as text', () => {
    expectClause('=foo', single('text', 'text', '=foo'));
  });

  it('is incomplete on an empty buffer', () => {
    expectIncomplete('');
  });

  it('is incomplete on an empty quoted string', () => {
    expectIncomplete('""');
  });

  // the user may be part-way through typing a key, so this is silent rather than an error
  it('stays incomplete when the bar has no text vocabulary', () => {
    expectIncomplete('searchQuery', browsingRegistry());
  });
});

describe('parseBuffer: field and tag clauses', () => {
  it('parses a reserved field', () => {
    expectClause('group=static', single('group', 'group', 'static'));
  });

  it('parses an unknown key as a tag', () => {
    expectClause('foo=bar', single('tag', 'foo', 'bar'));
  });

  it('parses a known tag key', () => {
    expectClause('arch=x86', single('tag', 'arch', 'x86'));
  });

  it('keeps spaces in a value', () => {
    expectClause('comment=looks like a dropper', single('tag', 'comment', 'looks like a dropper'));
  });

  it('keeps a later operator inside the value', () => {
    expectClause('comment=a=b', single('tag', 'comment', 'a=b'));
  });

  it('parses negation where the key allows it', () => {
    expectClause('arch!=x86', single('tag', 'arch', 'x86', ClauseCondition.IsNot));
  });

  it('prefers != over the = inside it', () => {
    expect(parse('arch!=x86').operator).toBe('!=');
  });

  it('parses substring matching', () => {
    expectClause('name~unpack', single('name', 'name', 'unpack', ClauseCondition.Includes));
  });

  it('is incomplete when the value is empty', () => {
    expectIncomplete('group=');
  });
});

describe('parseBuffer: tag: prefix and shadowing', () => {
  it('resolves a shadowed tag key through the prefix', () => {
    expectClause('tag:group=shadowed', single('tag', 'group', 'shadowed'));
  });

  it('resolves the reserved field without the prefix', () => {
    expectClause('group=static', single('group', 'group', 'static'));
  });

  it('invents a tag key through the prefix', () => {
    expectClause('tag:brandnew=1', single('tag', 'brandnew', '1'));
  });
});

describe('parseBuffer: comma / OR', () => {
  it('ORs values on an or-capable key', () => {
    expectClause('group=static,staging', multi('group', 'group', ['static', 'staging']));
  });

  it('drops a trailing empty segment', () => {
    expectClause('group=static,', single('group', 'group', 'static'));
  });

  it('rejects a comma on a key that is not or-capable', () => {
    expectError('arch=x86,arm');
  });

  it('rejects multiple values with negation', () => {
    expectError('group!=static,staging');
  });

  it('reports committed values and the draft separately', () => {
    const state = parse('group=static,sta');
    expect(state.committedValues).toEqual(['static']);
    expect(state.valueDraft).toBe('sta');
  });
});

describe('parseBuffer: executability gating', () => {
  it('rejects negation on a bar whose backend cannot run it', () => {
    expectError('arch!=x86', browsingRegistry());
  });

  it('allows the same clause on a bar that can run it', () => {
    expectClause('arch!=x86', single('tag', 'arch', 'x86', ClauseCondition.IsNot));
  });

  it('rejects an unknown value on a closed enumeration', () => {
    expectError('group=nope');
  });

  it('accepts any value on an open key', () => {
    expectClause('arch=brandnew', single('tag', 'arch', 'brandnew'));
  });

  it('rejects an unknown key when the bar has no tag vocabulary', () => {
    const noTags: OmnibarRegistry = { fields: [field('role', { values: ['Admin'], creatable: false })], tags: [] };
    expectError('whatever=1', noTags);
  });
});

describe('resolveKey: casing', () => {
  const registry = searchRegistry();

  it('matches reserved fields case-insensitively', () => {
    expect(resolveKey('GROUP', false, registry, false)?.key).toBe('group');
  });

  it('matches tag keys exactly when the toggle is off', () => {
    expect(resolveKey('lang', false, registry, false)?.key).toBe('lang');
    expect(resolveKey('Lang', false, registry, false)?.values).toEqual(['Rust', 'C']);
  });

  it('matches tag keys case-insensitively when the toggle is on', () => {
    expect(resolveKey('lang', false, registry, true)?.key).toBe('Lang');
  });

  it('preserves typed casing for an invented key', () => {
    expect(resolveKey('MixedCase', false, registry, true)?.key).toBe('MixedCase');
  });
});

describe('symbolToCondition', () => {
  it('maps = to Is, or IsOneOf when multi', () => {
    expect(symbolToCondition('=', false)).toBe(ClauseCondition.Is);
    expect(symbolToCondition('=', true)).toBe(ClauseCondition.IsOneOf);
  });

  it('maps != and ~', () => {
    expect(symbolToCondition('!=', false)).toBe(ClauseCondition.IsNot);
    expect(symbolToCondition('~', false)).toBe(ClauseCondition.Includes);
  });
});

// ---- round-trip ---------------------------------------------------------------------------------

describe('serializeClause', () => {
  const registry = searchRegistry();

  it('emits a bare value for plain text', () => {
    expect(serializeClause(single('text', 'text', 'foo bar'), registry, true)).toBe('foo bar');
  });

  it('quotes text containing an operator', () => {
    expect(serializeClause(single('text', 'text', 'a=b'), registry, true)).toBe('"a=b"');
    expect(serializeClause(single('text', 'text', 'he~llo'), registry, true)).toBe('"he~llo"');
  });

  it('emits the tag: prefix only for a shadowed key', () => {
    expect(serializeClause(single('tag', 'group', 'shadowed'), registry, true)).toBe('tag:group=shadowed');
    expect(serializeClause(single('tag', 'arch', 'x86'), registry, true)).toBe('arch=x86');
  });

  it('joins multi values with commas', () => {
    expect(serializeClause(multi('group', 'group', ['static', 'staging']), registry, true)).toBe('group=static,staging');
  });

  it('returns undefined for a clause this bar cannot express', () => {
    // negation is not available on the browsing bar, so the chip is delete-only there
    expect(serializeClause(single('tag', 'arch', 'x86', ClauseCondition.IsNot), browsingRegistry(), true)).toBeUndefined();
  });
});

/**
 * The invariant the whole chip-editing design rests on. Generated exhaustively over the awkward
 * characters (`=`, `~`, `"`, `,`, spaces) rather than sampled, so the cases that break round-tripping
 * are hit deterministically on every run.
 */
describe('round-trip invariant: parse(serialize(c)) === c', () => {
  const registry = searchRegistry();

  const VALUES = [
    'simple',
    'with space',
    'a=b',
    'he~llo',
    '"quoted"',
    '"unbalanced',
    'trailing"',
    'a="b"',
    'tag:looking',
    '=leading',
    '!=leading',
    'ümlaut',
    '  padded  ',
    '"a=b"',
  ];

  const cases: Clause[] = [
    // text clauses carry the nastiest values, since they are the only free-form ones
    ...VALUES.map((value) => single('text', 'text', value)),
    // tag clauses: open key, so any value is accepted; comma is excluded because the grammar
    // deliberately makes it untypable on a non-or-capable key
    ...VALUES.filter((value) => !value.includes(',')).map((value) => single('tag', 'arch', value)),
    ...VALUES.filter((value) => !value.includes(',')).map((value) => single('tag', 'arch', value, ClauseCondition.IsNot)),
    // a shadowed tag key, exercising the tag: prefix
    single('tag', 'group', 'shadowed'),
    // reserved fields, single and multi
    single('group', 'group', 'static'),
    multi('group', 'group', ['static', 'staging']),
    multi('index', 'index', ['SampleTags', 'RepoTags']),
    single('name', 'name', 'unpacker', ClauseCondition.Includes),
  ];

  it.each(cases.map((clause) => [JSON.stringify(clause), clause] as const))('round-trips %s', (_label, clause) => {
    const text = serializeClause(clause, registry, true);
    expect(text, 'clause should be serializable').toBeDefined();
    const result = parseBuffer(text as string, registry, true).result;
    expect(result.kind).toBe('clause');
    if (result.kind === 'clause') {
      expect(clausesEqual(result.clause, clause), `'${text}' re-parsed to ${JSON.stringify(result.clause)}`).toBe(true);
    }
  });
});
