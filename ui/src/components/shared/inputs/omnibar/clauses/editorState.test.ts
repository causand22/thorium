import { describe, expect, it } from 'vitest';
import { Clause, ClauseCondition } from './ClauseTypes';
import { EditorAction, EditorContext, EditorState, initialEditorState, reduceEditor } from './editorState';
import { OmnibarKey, OmnibarRegistry } from './parse';

// spec: ../SPEC.md

function field(key: string, over: Partial<OmnibarKey> = {}): OmnibarKey {
  return { key, kind: 'field', category: key, conditions: [ClauseCondition.Is], orCapable: false, creatable: true, values: [], ...over };
}

// value suggestions sort alphabetically, so fixtures use values whose order is unambiguous — the
// first group is 'alpha' and the first arch is 'arm'
function registry(): OmnibarRegistry {
  return {
    fields: [
      field('group', {
        values: ['alpha', 'beta'],
        creatable: false,
        orCapable: true,
        conditions: [ClauseCondition.Is, ClauseCondition.IsOneOf],
      }),
    ],
    tags: [
      { key: 'arch', kind: 'tag', category: 'tag', conditions: [ClauseCondition.Is], orCapable: false, creatable: true, values: ['arm', 'x86'] },
    ],
    tagTemplate: { category: 'tag', conditions: [ClauseCondition.Is], orCapable: false },
    text: field('text', { category: 'text' }),
  };
}

function ctxWith(clauses: Clause[] = []): EditorContext {
  return { clauses, registry: registry(), tagsCaseInsensitive: true };
}

/** Run a sequence of actions, threading both state and the clause list. */
function run(actions: EditorAction[], start: Clause[] = []): { state: EditorState; clauses: Clause[] } {
  let state = { ...initialEditorState(), focused: true };
  let clauses = start;
  for (const action of actions) {
    const result = reduceEditor(state, action, { clauses, registry: registry(), tagsCaseInsensitive: true });
    state = result.state;
    if (result.clauses) clauses = result.clauses;
  }
  return { state, clauses };
}

const type = (buffer: string): EditorAction => ({ type: 'setBuffer', buffer });
const enter: EditorAction = { type: 'enter' };
const tab: EditorAction = { type: 'tab' };
const down: EditorAction = { type: 'move', delta: 1 };
const up: EditorAction = { type: 'move', delta: -1 };

const groupAlpha: Clause = { category: 'group', field: 'group', condition: ClauseCondition.Is, value: { value: 'alpha' } };

describe('Enter', () => {
  it('commits the typed text literally when nothing is highlighted', () => {
    const { clauses, state } = run([type('group=alp'), enter]);
    // 'alp' is not a known group and group is a closed set, so nothing commits
    expect(clauses).toEqual([]);
    expect(state.buffer).toBe('group=alp');
  });

  it('commits a complete clause and clears the buffer', () => {
    const { clauses, state } = run([type('group=alpha'), enter]);
    expect(clauses).toEqual([groupAlpha]);
    expect(state.buffer).toBe('');
  });

  it('commits a bare word as a text clause', () => {
    const { clauses } = run([type('malware'), enter]);
    expect(clauses).toEqual([{ category: 'text', field: 'text', condition: ClauseCondition.Is, value: { value: 'malware' } }]);
  });

  it('is inert on an empty value', () => {
    const { clauses, state } = run([type('group='), enter]);
    expect(clauses).toEqual([]);
    expect(state.buffer).toBe('group=');
  });

  it('accepts the highlighted row after ArrowDown', () => {
    const { clauses } = run([type('arch=ar'), down, enter]);
    expect(clauses).toEqual([{ category: 'tag', field: 'arch', condition: ClauseCondition.Is, value: { value: 'arm' } }]);
  });

  // on an or-capable key accepting a value invites another, so committing takes a second Enter
  it('takes a second Enter to commit on an or-capable key', () => {
    const { clauses } = run([type('group=alp'), down, enter, enter]);
    expect(clauses).toEqual([groupAlpha]);
  });
});

describe('Tab', () => {
  it('completes to the top suggestion without committing', () => {
    const { state, clauses } = run([type('group=alp'), tab]);
    // the trailing comma invites a second value; the parser drops it when the clause commits
    expect(state.buffer).toBe('group=alpha,');
    expect(clauses).toEqual([]);
  });

  it('completes a key to key plus operator', () => {
    const { state } = run([type('gro'), tab]);
    expect(state.buffer).toBe('group=');
  });

  // with no typed value and nothing arrow-highlighted, there's no unambiguous "top" suggestion to
  // accept — grabbing the first row of the full, unfiltered list would be surprising
  it('does nothing on an empty value draft with no row highlighted', () => {
    const { state, clauses } = run([type('group='), tab]);
    expect(state.buffer).toBe('group=');
    expect(clauses).toEqual([]);
  });

  it('accepts the arrow-highlighted row even with an empty draft', () => {
    const { state } = run([type('group='), down, tab]);
    expect(state.buffer).toBe('group=alpha,');
  });
});

describe('arrow navigation', () => {
  it('starts inactive so typing is never hijacked', () => {
    expect(run([type('group=alp')]).state.activeRow).toBe(-1);
  });

  it('deactivates when arrowing up past the first row', () => {
    expect(run([type('group=alp'), down, up]).state.activeRow).toBe(-1);
  });

  it('skips non-selectable header rows', () => {
    // the key-stage dropdown opens with a 'Fields' header, which must not be landable
    const { state } = run([type('g'), down]);
    expect(state.activeRow).toBeGreaterThan(0);
  });

  it('resets the highlight when typing resumes', () => {
    expect(run([type('group=alp'), down, type('group=alph')]).state.activeRow).toBe(-1);
  });
});

const archArm: Clause = { category: 'tag', field: 'arch', condition: ClauseCondition.Is, value: { value: 'arm' } };

describe('merging and duplicates', () => {
  it('merges a second value for an or-capable key into one chip', () => {
    const { clauses } = run([type('group=beta'), enter], [groupAlpha]);
    expect(clauses).toEqual([
      { category: 'group', field: 'group', condition: ClauseCondition.IsOneOf, value: { values: ['alpha', 'beta'] } },
    ]);
  });

  // two values for one tag key genuinely AND on the Scylla routes, so they stay separate chips
  it('appends a second chip for a key that is not or-capable', () => {
    const { clauses } = run([type('arch=x86'), enter], [archArm]);
    expect(clauses).toHaveLength(2);
  });

  it('never merges text clauses', () => {
    const foo: Clause = { category: 'text', field: 'text', condition: ClauseCondition.Is, value: { value: 'foo' } };
    const { clauses } = run([type('bar'), enter], [foo]);
    expect(clauses).toHaveLength(2);
  });
});

describe('Backspace', () => {
  it('pops the last chip back into the buffer as text', () => {
    const { state, clauses } = run([{ type: 'backspace' }], [groupAlpha]);
    expect(state.buffer).toBe('group=alpha');
    expect(clauses).toEqual([]);
  });

  it('does nothing when the buffer is not empty', () => {
    const { state, clauses } = run([type('x'), { type: 'backspace' }], [groupAlpha]);
    expect(state.buffer).toBe('x');
    expect(clauses).toEqual([groupAlpha]);
  });
});

describe('chip editing', () => {
  it('loads the chip text into the buffer and edits in place', () => {
    const { state } = run([{ type: 'editChip', index: 0 }], [groupAlpha, archArm]);
    expect(state.buffer).toBe('group=alpha');
    expect(state.editingIndex).toBe(0);
  });

  it('replaces in place, preserving clause order', () => {
    const { clauses } = run([{ type: 'editChip', index: 0 }, type('group=beta'), enter], [groupAlpha, archArm]);
    expect(clauses).toEqual([
      { category: 'group', field: 'group', condition: ClauseCondition.Is, value: { value: 'beta' } },
      archArm,
    ]);
  });

  it('leaves the chip untouched when the edit is abandoned', () => {
    const { clauses, state } = run([{ type: 'editChip', index: 0 }, type('group=bet'), { type: 'escape' }], [groupAlpha]);
    expect(clauses).toEqual([groupAlpha]);
    expect(state.editingIndex).toBeNull();
  });

  it('shifts the edit index when an earlier chip is deleted', () => {
    const { state } = run([{ type: 'editChip', index: 1 }, { type: 'deleteChip', index: 0 }], [groupAlpha, archArm]);
    expect(state.editingIndex).toBe(0);
  });
});

describe('Escape', () => {
  it('deactivates the highlight first', () => {
    const { state } = run([type('group=alp'), down, { type: 'escape' }]);
    expect(state.activeRow).toBe(-1);
    expect(state.buffer).toBe('group=alp');
  });

  it('clears the buffer on a second press', () => {
    const { state } = run([type('group=alp'), down, { type: 'escape' }, { type: 'escape' }]);
    expect(state.buffer).toBe('');
  });
});

describe('blur', () => {
  it('commits a complete clause rather than dropping it', () => {
    const { clauses } = run([type('group=alpha'), { type: 'blur' }]);
    expect(clauses).toEqual([groupAlpha]);
  });

  it('discards an incomplete buffer', () => {
    const { clauses, state } = run([type('group='), { type: 'blur' }]);
    expect(clauses).toEqual([]);
    expect(state.buffer).toBe('');
  });
});

describe('pasteMulti', () => {
  const pasteMulti = (mergedText: string): EditorAction => ({ type: 'pasteMulti', mergedText });

  it('commits one chip per line', () => {
    const { clauses, state } = run([pasteMulti('group=alpha\narch=arm')]);
    expect(clauses).toEqual([groupAlpha, archArm]);
    expect(state.buffer).toBe('');
  });

  it('treats a bare line as its own text clause alongside field lines', () => {
    const { clauses } = run([pasteMulti('malware\ngroup=alpha')]);
    expect(clauses).toEqual([
      { category: 'text', field: 'text', condition: ClauseCondition.Is, value: { value: 'malware' } },
      groupAlpha,
    ]);
  });

  it('applies the existing merge rules across pasted lines', () => {
    const { clauses } = run([pasteMulti('group=beta\narch=arm')], [groupAlpha]);
    expect(clauses).toEqual([
      { category: 'group', field: 'group', condition: ClauseCondition.IsOneOf, value: { values: ['alpha', 'beta'] } },
      archArm,
    ]);
  });

  it('sanitizes each line independently', () => {
    const { clauses } = run([pasteMulti(' group=alpha \n  arch=arm ')]);
    expect(clauses).toEqual([groupAlpha, archArm]);
  });

  it('commits valid lines and leaves a single failed line in the buffer', () => {
    const { clauses, state } = run([pasteMulti('group=nope\ngroup=alpha')]);
    expect(clauses).toEqual([groupAlpha]);
    expect(state.buffer).toBe('group=nope');
  });

  it('joins multiple failed/incomplete lines with " | ", preserving the valid ones', () => {
    const { clauses, state } = run([pasteMulti('group=\narch!=arm\ngroup=alpha')]);
    expect(clauses).toEqual([groupAlpha]);
    expect(state.buffer).toBe('group= | arch!=arm');
  });

  it('keeps a quoted multi-line value intact as one text clause', () => {
    const { clauses } = run([pasteMulti('"hello\nworld"\ngroup=alpha')]);
    expect(clauses).toEqual([
      { category: 'text', field: 'text', condition: ClauseCondition.Is, value: { value: 'hello\nworld' } },
      groupAlpha,
    ]);
  });
});

describe('multi-value selection', () => {
  it('appends a comma and keeps the dropdown open for an or-capable key', () => {
    const { state, clauses } = run([type('group='), down, enter]);
    expect(state.buffer).toBe('group=alpha,');
    expect(clauses).toEqual([]);
  });

  it('commits immediately for a key that is not or-capable', () => {
    const { clauses } = run([type('arch='), down, enter]);
    expect(clauses).toEqual([archArm]);
  });
});
