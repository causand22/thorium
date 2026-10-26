/**
 * The omnibar editor as a pure reducer.
 *
 * Keeping the keyboard and commit logic out of the component means the behaviour that used to live in
 * a staged state machine inside `ClauseEditor` is directly testable without a DOM. The reducer owns
 * only the buffer and the dropdown highlight; the clause list belongs to the parent, so actions that
 * change it return a new list alongside the new state.
 */

// project imports
import { Clause, ClauseCondition, clauseValues } from './ClauseTypes';
import { clausesEqual, OmnibarRegistry, parseBuffer, resolveKey, serializeClause } from './parse';
import { sanitizePastedText, splitPastedSegments } from './paste';
import {
  buildRows,
  ChoiceRow,
  DropdownRow,
  firstSelectableIndex,
  operatorStageActiveRow,
  PendingKey,
  rowIsSelectable,
  stepSelectable,
} from './suggestions';

export type EditorState = {
  /** The in-progress clause text. */
  buffer: string;
  /** Index of the chip being edited in place, or `null` when appending a new clause. */
  editingIndex: number | null;
  /** Highlighted dropdown row, or -1 for "nothing active" — in which case Enter commits literally. */
  activeRow: number;
  focused: boolean;
  /**
   * Set between picking a key that has a choice of operators and picking the operator. The buffer is
   * just the bare key (which parses as free text), so while this is set the dropdown lists operators
   * and nothing reads the buffer as a clause. Any edit to the buffer clears it.
   */
  pendingKey: PendingKey | null;
};

/** Everything the reducer needs that it does not own. */
export type EditorContext = {
  clauses: Clause[];
  registry: OmnibarRegistry;
  tagsCaseInsensitive: boolean;
};

export type EditorAction =
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'setBuffer'; buffer: string }
  | { type: 'enter' }
  | { type: 'tab' }
  | { type: 'move'; delta: 1 | -1 }
  | { type: 'backspace' }
  | { type: 'escape' }
  | { type: 'selectRow'; index: number }
  | { type: 'hoverRow'; index: number }
  | { type: 'editChip'; index: number }
  | { type: 'deleteChip'; index: number }
  /** A paste resolved to 2+ segments (see `./paste`); only sent when not editing a chip in place. */
  | { type: 'pasteMulti'; mergedText: string };

/** A reducer result. `clauses` is present only when the action changed the clause list. */
export type EditorResult = { state: EditorState; clauses?: Clause[] };

export function initialEditorState(): EditorState {
  return { buffer: '', editingIndex: null, activeRow: -1, focused: false, pendingKey: null };
}

// ---- merging ------------------------------------------------------------------------------------

/** The only conditions that union cleanly; `!=` and `~` change meaning if folded into a list. */
const MERGEABLE_CONDITIONS: ClauseCondition[] = [ClauseCondition.Is, ClauseCondition.IsOneOf];

function isMergeable(clause: Clause): boolean {
  return MERGEABLE_CONDITIONS.includes(clause.condition);
}

/** Append `clause` unless an identical chip is already present. */
function appendUnlessDuplicate(clauses: Clause[], clause: Clause): Clause[] {
  return clauses.some((entry) => clausesEqual(entry, clause)) ? clauses : [...clauses, clause];
}

/**
 * Add `clause` to the list, folding it into an existing chip for the same key when that key is
 * or-capable and both chips use `=`. Anything else appends — a different operator, or a key that
 * isn't or-capable: two values for one tag key genuinely AND on the Scylla routes, so two chips is
 * the honest rendering. An exact duplicate of an existing chip is dropped.
 */
export function mergeOrAppend(clauses: Clause[], clause: Clause, ctx: EditorContext): Clause[] {
  if (clause.category === 'text') return appendUnlessDuplicate(clauses, clause);

  const key = resolveKey(clause.field, clause.category === 'tag', ctx.registry, ctx.tagsCaseInsensitive);
  if (!key?.orCapable || !isMergeable(clause)) return appendUnlessDuplicate(clauses, clause);

  const idx = clauses.findIndex((entry) => entry.category === clause.category && entry.field === clause.field && isMergeable(entry));
  if (idx === -1) return appendUnlessDuplicate(clauses, clause);

  const values = Array.from(new Set([...clauseValues(clauses[idx]), ...clauseValues(clause)]));
  const merged: Clause =
    values.length > 1
      ? { category: clause.category, field: clause.field, condition: ClauseCondition.IsOneOf, value: { values } }
      : { category: clause.category, field: clause.field, condition: ClauseCondition.Is, value: { value: values[0] } };
  return clauses.map((entry, entryIdx) => (entryIdx === idx ? merged : entry));
}

// ---- helpers ------------------------------------------------------------------------------------

function rowsFor(state: EditorState, ctx: EditorContext): DropdownRow[] {
  return buildRows(state.buffer, ctx.registry, ctx.tagsCaseInsensitive, state.pendingKey);
}

function cleared(state: EditorState): EditorState {
  return { ...state, buffer: '', editingIndex: null, activeRow: -1, pendingKey: null };
}

/** Write `row` into the buffer. A key row with a choice of operators opens the operator stage. */
function acceptRow(state: EditorState, row: ChoiceRow): EditorState {
  const pendingKey = row.pendingKey ?? null;
  return {
    ...state,
    buffer: row.insert,
    activeRow: pendingKey ? operatorStageActiveRow(pendingKey) : -1,
    pendingKey,
  };
}

/** Commit `clause`, replacing the chip under edit or merging/appending a new one. */
function commit(state: EditorState, ctx: EditorContext, clause: Clause): EditorResult {
  if (state.editingIndex !== null) {
    const clauses = ctx.clauses.map((entry, idx) => (idx === state.editingIndex ? clause : entry));
    return { state: cleared(state), clauses };
  }
  return { state: cleared(state), clauses: mergeOrAppend(ctx.clauses, clause, ctx) };
}

/** Commit whatever the buffer currently holds, if it holds a complete clause. */
function commitBuffer(state: EditorState, ctx: EditorContext): EditorResult {
  const result = parseBuffer(state.buffer, ctx.registry, ctx.tagsCaseInsensitive).result;
  if (result.kind !== 'clause') return { state };
  return commit(state, ctx, result.clause);
}

/**
 * Commit every segment of a multi-line paste that parses into a clause, in paste order, applying the
 * same merge/dedup rules as a single Enter (see {@link mergeOrAppend}). A segment that doesn't
 * resolve — a `ParseError` or an `Incomplete` bare word — is kept rather than dropped: the single-line
 * buffer can't render several leftover lines separately, so they're joined with `" | "` for the user to
 * see and fix, instead of silently vanishing the way an `Incomplete` typed buffer normally would.
 *
 * Expects `mergedText` to already contain 2+ non-blank segments — the paste handler only dispatches
 * `pasteMulti` once it has checked that itself, since a single segment is just an ordinary paste.
 */
function commitMultiPaste(state: EditorState, ctx: EditorContext, mergedText: string): EditorResult {
  let clauses = ctx.clauses;
  const leftover: string[] = [];

  for (const segment of splitPastedSegments(mergedText)) {
    const sanitized = sanitizePastedText(segment);
    const result = parseBuffer(sanitized, ctx.registry, ctx.tagsCaseInsensitive).result;
    if (result.kind === 'clause') {
      clauses = mergeOrAppend(clauses, result.clause, ctx);
    } else {
      leftover.push(sanitized);
    }
  }

  return { state: { ...cleared(state), buffer: leftover.join(' | ') }, clauses };
}

/** Apply a dropdown row: write its text into the buffer, and commit when the row says to. */
function applyRow(state: EditorState, ctx: EditorContext, rows: DropdownRow[], index: number): EditorResult {
  const row = rows[index];
  if (!row || !rowIsSelectable(row)) return { state };
  const next = acceptRow(state, row);
  return row.commit ? commitBuffer(next, ctx) : { state: next };
}

// ---- reducer ------------------------------------------------------------------------------------

export function reduceEditor(state: EditorState, action: EditorAction, ctx: EditorContext): EditorResult {
  switch (action.type) {
    case 'focus':
      return { state: { ...state, focused: true } };

    case 'blur': {
      // the buffer is only a bare key here, which would commit as a free-text chip; drop it instead
      if (state.pendingKey) return { state: { ...cleared(state), focused: false } };
      // a complete clause left in the buffer is committed rather than silently dropped
      const committed = commitBuffer(state, ctx);
      return { state: { ...cleared(committed.state), focused: false }, clauses: committed.clauses };
    }

    case 'setBuffer':
      // typing always deactivates the highlight, so Enter is never hijacked mid-word
      return { state: { ...state, buffer: action.buffer, activeRow: -1, pendingKey: null } };

    case 'enter': {
      const rows = rowsFor(state, ctx);
      if (state.activeRow >= 0) return applyRow(state, ctx, rows, state.activeRow);
      // never commit the bare key of the operator stage as free text
      if (state.pendingKey) return { state };
      return commitBuffer(state, ctx);
    }

    case 'tab': {
      // in the operator stage the highlight always has a target, so Tab accepts it like Enter
      if (state.pendingKey) return applyRow(state, ctx, rowsFor(state, ctx), state.activeRow);
      // Tab with empty buffer blurs to move to next focusable element
      if (state.buffer === '') {
        return { state: { ...state, focused: false } };
      }
      // With no typed draft at the current stage and nothing arrow-highlighted, there's no
      // unambiguous "top" suggestion to accept — silently grabbing the first row in the full,
      // unfiltered list is surprising when nothing in the dropdown looks selected.
      const parsed = parseBuffer(state.buffer, ctx.registry, ctx.tagsCaseInsensitive);
      const draft = parsed.stage === 'key' ? parsed.keyDraft : parsed.valueDraft;
      if (draft === '' && state.activeRow === -1) return { state };
      const rows = rowsFor(state, ctx);
      const idx = state.activeRow >= 0 ? state.activeRow : firstSelectableIndex(rows);
      if (idx === -1) return { state };
      const row = rows[idx];
      return rowIsSelectable(row) ? { state: acceptRow(state, row) } : { state };
    }

    case 'move': {
      const rows = rowsFor(state, ctx);
      if (state.activeRow === -1) {
        if (action.delta === -1) return { state };
        const idx = firstSelectableIndex(rows);
        return { state: idx === -1 ? state : { ...state, activeRow: idx } };
      }
      const next = stepSelectable(rows, state.activeRow, action.delta);
      // the operator stage's highlight never clears, so stepping up past the top stays on the top row
      const activeRow = state.pendingKey && next === -1 ? firstSelectableIndex(rows) : next;
      return { state: { ...state, activeRow } };
    }

    case 'backspace': {
      // only meaningful with an empty buffer; the input handles ordinary character deletion
      if (state.buffer !== '' || state.editingIndex !== null || ctx.clauses.length === 0) return { state };
      const last = ctx.clauses[ctx.clauses.length - 1];
      const text = serializeClause(last, ctx.registry, ctx.tagsCaseInsensitive);
      return { state: { ...state, buffer: text ?? '', activeRow: -1 }, clauses: ctx.clauses.slice(0, -1) };
    }

    case 'escape': {
      // step back to the key stage: the bare key stays in the buffer, filtering the key list again
      if (state.pendingKey) return { state: { ...state, pendingKey: null, activeRow: -1 } };
      if (state.activeRow >= 0) return { state: { ...state, activeRow: -1 } };
      // abandoning an in-place edit leaves the chip untouched — it was never removed from the list
      if (state.buffer !== '' || state.editingIndex !== null) return { state: cleared(state) };
      return { state: { ...state, focused: false } };
    }

    case 'selectRow':
      return applyRow(state, ctx, rowsFor(state, ctx), action.index);

    case 'hoverRow':
      // leaving the dropdown would clear the highlight; the operator stage returns it to the default
      if (state.pendingKey && action.index === -1) {
        return { state: { ...state, activeRow: operatorStageActiveRow(state.pendingKey) } };
      }
      return { state: { ...state, activeRow: action.index } };

    case 'editChip': {
      const clause = ctx.clauses[action.index];
      if (!clause) return { state };
      const text = serializeClause(clause, ctx.registry, ctx.tagsCaseInsensitive);
      // a clause this bar's vocabulary can't express round-trips to nothing; leave it delete-only
      if (text === undefined) return { state };
      return {
        state: { ...state, buffer: text, editingIndex: action.index, activeRow: -1, focused: true, pendingKey: null },
      };
    }

    case 'deleteChip': {
      const clauses = ctx.clauses.filter((_entry, idx) => idx !== action.index);
      if (state.editingIndex === action.index) return { state: cleared(state), clauses };
      // deleting a chip to the left of the one under edit shifts its index down
      if (state.editingIndex !== null && state.editingIndex > action.index) {
        return { state: { ...state, editingIndex: state.editingIndex - 1 }, clauses };
      }
      return { state, clauses };
    }

    case 'pasteMulti':
      return commitMultiPaste(state, ctx, action.mergedText);
  }
}
