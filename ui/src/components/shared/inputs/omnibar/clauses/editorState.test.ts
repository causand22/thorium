import { describe, expect, it } from 'vitest';
import { Clause, ClauseCondition } from './ClauseTypes';
import { EditorAction, EditorContext, EditorState, initialEditorState, mergeOrAppend, reduceEditor } from './editorState';
import { OmnibarKey, OmnibarRegistry } from './parse';

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
      // keys with a real choice of operator open the operator stage; `name` defaults to substring
      field('role', {
        values: ['admin', 'analyst'],
        creatable: false,
        orCapable: true,
        conditions: [ClauseCondition.Is, ClauseCondition.IsOneOf, ClauseCondition.IsNot],
      }),
      field('name', { conditions: [ClauseCondition.Includes, ClauseCondition.Is, ClauseCondition.IsNot] }),
    ],
    tags: [
      {
        key: 'arch',
        kind: 'tag',
        category: 'tag',
        conditions: [ClauseCondition.Is],
        orCapable: false,
        creatable: true,
        values: ['arm', 'x86'],
      },
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
const groupBeta: Clause = { category: 'group', field: 'group', condition: ClauseCondition.Is, value: { value: 'beta' } };
const groupNotAlpha: Clause = { category: 'group', field: 'group', condition: ClauseCondition.IsNot, value: { value: 'alpha' } };
const groupNotBeta: Clause = { category: 'group', field: 'group', condition: ClauseCondition.IsNot, value: { value: 'beta' } };

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

  // folding into a negated chip would silently turn "not alpha" into "alpha or beta"
  it('does not merge into a chip with a different operator', () => {
    const { clauses } = run([type('group=beta'), enter], [groupNotAlpha]);
    expect(clauses).toEqual([groupNotAlpha, groupBeta]);
  });

  it('does not merge a negated clause into an existing chip', () => {
    expect(mergeOrAppend([groupAlpha], groupNotBeta, ctxWith([groupAlpha]))).toEqual([groupAlpha, groupNotBeta]);
  });

  it('merges into the mergeable chip even when a negated chip for the same key comes first', () => {
    const { clauses } = run([type('group=beta'), enter], [groupNotAlpha, groupAlpha]);
    expect(clauses).toEqual([
      groupNotAlpha,
      { category: 'group', field: 'group', condition: ClauseCondition.IsOneOf, value: { values: ['alpha', 'beta'] } },
    ]);
  });

  it('ignores an exact duplicate of an existing chip', () => {
    expect(run([type('arch=arm'), enter], [archArm]).clauses).toEqual([archArm]);
    expect(mergeOrAppend([groupNotAlpha], groupNotAlpha, ctxWith([groupNotAlpha]))).toEqual([groupNotAlpha]);
  });

  it('ignores an exact duplicate text clause', () => {
    const foo: Clause = { category: 'text', field: 'text', condition: ClauseCondition.Is, value: { value: 'foo' } };
    expect(run([type('foo'), enter], [foo]).clauses).toEqual([foo]);
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
    expect(clauses).toEqual([{ category: 'group', field: 'group', condition: ClauseCondition.Is, value: { value: 'beta' } }, archArm]);
  });

  it('leaves the chip untouched when the edit is abandoned', () => {
    const { clauses, state } = run([{ type: 'editChip', index: 0 }, type('group=bet'), { type: 'escape' }], [groupAlpha]);
    expect(clauses).toEqual([groupAlpha]);
    expect(state.editingIndex).toBeNull();
  });

  it('shifts the edit index when an earlier chip is deleted', () => {
    const { state } = run(
      [
        { type: 'editChip', index: 1 },
        { type: 'deleteChip', index: 0 },
      ],
      [groupAlpha, archArm],
    );
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
    expect(clauses).toEqual([{ category: 'text', field: 'text', condition: ClauseCondition.Is, value: { value: 'malware' } }, groupAlpha]);
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

describe('operator stage', () => {
  const escape: EditorAction = { type: 'escape' };
  // 'rol' and 'nam' each match exactly one field, so Tab picks it
  const pickRole = [type('rol'), tab];
  const pickName = [type('nam'), tab];

  it('opens for a key with a choice of operators, leaving the bare key in the buffer', () => {
    const { state } = run(pickRole);
    expect(state.buffer).toBe('role');
    expect(state.pendingKey?.key.key).toBe('role');
  });

  it('is skipped for a key with a single operator', () => {
    const { state } = run([type('gro'), tab]);
    expect(state.buffer).toBe('group=');
    expect(state.pendingKey).toBeNull();
  });

  it('is skipped when the operator is typed', () => {
    expect(run([type('role=')]).state.pendingKey).toBeNull();
  });

  it('starts on the key default: `is` for role, `includes` for name', () => {
    expect(run(pickRole).state.activeRow).toBe(1);
    expect(run(pickName).state.activeRow).toBe(3);
  });

  it('accepts the highlighted operator on Enter and Tab', () => {
    expect(run([...pickRole, enter]).state.buffer).toBe('role=');
    expect(run([...pickRole, tab]).state.buffer).toBe('role=');
    expect(run([...pickName, enter]).state.buffer).toBe('name~');
  });

  it('closes the stage once an operator is chosen', () => {
    expect(run([...pickRole, enter]).state.pendingKey).toBeNull();
  });

  it('picks another operator with the arrow keys', () => {
    expect(run([...pickRole, down, enter]).state.buffer).toBe('role!=');
    expect(run([...pickName, up, enter]).state.buffer).toBe('name!=');
  });

  it('picks an operator by clicking its row', () => {
    expect(run([...pickRole, { type: 'selectRow', index: 2 }]).state.buffer).toBe('role!=');
  });

  it('never clears the highlight', () => {
    expect(run([...pickRole, up]).state.activeRow).toBe(1);
    expect(run([...pickRole, down, down, down]).state.activeRow).toBe(2);
    expect(run([...pickRole, down, { type: 'hoverRow', index: -1 }]).state.activeRow).toBe(1);
  });

  it('does not commit the bare key as free text if nothing is highlighted', () => {
    const { state } = run(pickRole);
    const result = reduceEditor({ ...state, activeRow: -1 }, enter, ctxWith());
    expect(result.clauses).toBeUndefined();
    expect(result.state.buffer).toBe('role');
  });

  it('hands over to the value stage, which commits a negated clause', () => {
    const { clauses } = run([...pickRole, down, enter, type('role!=admin'), enter]);
    expect(clauses).toEqual([{ category: 'role', field: 'role', condition: ClauseCondition.IsNot, value: { value: 'admin' } }]);
  });

  it('steps back to the key stage on Escape, then clears on a second Escape', () => {
    const back = run([...pickRole, escape]).state;
    expect(back.pendingKey).toBeNull();
    expect(back.buffer).toBe('role');
    expect(back.activeRow).toBe(-1);
    expect(run([...pickRole, escape, escape]).state.buffer).toBe('');
  });

  it('steps back to the key stage when the buffer is edited', () => {
    const { state } = run([...pickRole, type('rol')]);
    expect(state.pendingKey).toBeNull();
    expect(state.buffer).toBe('rol');
  });

  it('is dropped without committing anything when focus leaves', () => {
    const { state, clauses } = run([...pickRole, { type: 'blur' }]);
    expect(clauses).toEqual([]);
    expect(state.buffer).toBe('');
    expect(state.pendingKey).toBeNull();
    expect(state.focused).toBe(false);
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
