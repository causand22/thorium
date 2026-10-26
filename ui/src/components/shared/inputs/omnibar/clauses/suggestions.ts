/**
 * Building the dropdown from the buffer.
 *
 * Every row carries the complete buffer text it would produce, so selecting a suggestion is literally
 * "write this text and re-parse" — the same code path as typing. Headers and hints are non-selectable
 * and are skipped by arrow navigation.
 */

// project imports
import { ClauseCondition, GetValueString } from './ClauseTypes';
import {
  BufferState,
  conditionToSymbol,
  inventedTagKey,
  OmnibarKey,
  OmnibarRegistry,
  OperatorSymbol,
  parseBuffer,
  TAG_PREFIX,
} from './parse';

/** A non-selectable section divider. */
export type HeaderRow = { kind: 'header'; label: string };
/** A non-selectable hint, e.g. "No known values for 'foo'". */
export type HintRow = { kind: 'hint'; label: string };
/**
 * A key picked from the dropdown whose operator hasn't been chosen yet. The buffer can't hold this
 * state — `role` alone is free text — so the editor carries it alongside the buffer (see
 * `EditorState.pendingKey`) and the dropdown lists operators until one is picked.
 */
export type PendingKey = {
  key: OmnibarKey;
  /** Whether the key must be re-emitted with the `tag:` prefix. */
  forcedTag: boolean;
};

/** A selectable row. `insert` is the whole next buffer; `commit` means "and commit it as a chip". */
export type ChoiceRow = {
  kind: 'key' | 'value' | 'text' | 'operator';
  label: string;
  insert: string;
  commit: boolean;
  /** Icon category, matching the chip icons. */
  category: string;
  helpText?: string;
  checked?: boolean;
  /** Set on a key row whose key has a real choice of operator: picking it opens the operator stage. */
  pendingKey?: PendingKey;
};

export type DropdownRow = HeaderRow | HintRow | ChoiceRow;

export function rowIsSelectable(row: DropdownRow): row is ChoiceRow {
  return row.kind === 'key' || row.kind === 'value' || row.kind === 'text' || row.kind === 'operator';
}

/** Index of the first selectable row, or -1 when there is nothing to accept. */
export function firstSelectableIndex(rows: DropdownRow[]): number {
  return rows.findIndex(rowIsSelectable);
}

/**
 * Step `from` to the next selectable row in `delta` direction, skipping headers and hints.
 * Returns -1 when stepping up past the first selectable row (which deactivates the highlight).
 */
export function stepSelectable(rows: DropdownRow[], from: number, delta: 1 | -1): number {
  for (let idx = from + delta; idx >= 0 && idx < rows.length; idx += delta) {
    if (rowIsSelectable(rows[idx])) return idx;
  }
  return delta === 1 ? from : -1;
}

// ---- matching and ranking -----------------------------------------------------------------------

/** 0 for a prefix match, 1 for a substring match, -1 for no match. Always case-insensitive. */
function matchTier(candidate: string, draft: string): number {
  if (draft === '') return 0;
  const haystack = candidate.toLowerCase();
  const needle = draft.toLowerCase();
  if (haystack.startsWith(needle)) return 0;
  return haystack.includes(needle) ? 1 : -1;
}

function rankKeys(keys: OmnibarKey[], draft: string, byCount: boolean): OmnibarKey[] {
  return keys
    .map((key) => ({ key, tier: matchTier(key.key, draft) }))
    .filter((entry) => entry.tier !== -1)
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (byCount) {
        const diff = (b.key.total ?? 0) - (a.key.total ?? 0);
        if (diff !== 0) return diff;
      }
      return a.key.key.localeCompare(b.key.key);
    })
    .map((entry) => entry.key);
}

/** Numeric-aware value sort, so `depth` lists 1,2,…,10 rather than 1,10,2. */
function compareValues(a: string, b: string): number {
  const aNum = Number(a);
  const bNum = Number(b);
  if (a.trim() !== '' && b.trim() !== '' && !Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
  return a.localeCompare(b);
}

// ---- rows ---------------------------------------------------------------------------------------

/**
 * A key's default operator: the symbol for its **first** allowed condition.
 *
 * Ordering `conditions` is how a registry picks it. A key with a single operator inserts it straight
 * away; a key with a choice opens the operator stage with this one highlighted — `name` on the
 * Pipelines bar lists `Includes` first so it starts on substring matching, which is what people want
 * when hunting a pipeline by partial name.
 */
function defaultSymbol(key: OmnibarKey): OperatorSymbol {
  return conditionToSymbol(key.conditions[0] ?? ClauseCondition.Is);
}

/** Operators shown in the operator stage, in this order on every bar. */
const OPERATOR_DISPLAY_ORDER: OperatorSymbol[] = ['=', '!=', '~'];

const OPERATOR_LABELS: Record<OperatorSymbol, string> = { '=': 'is', '!=': 'is not', '~': 'includes' };

/** The distinct operator symbols a key accepts, in display order. `is` and `is one of` both read as `=`. */
export function keyOperators(key: OmnibarKey): OperatorSymbol[] {
  const symbols = new Set(key.conditions.map(conditionToSymbol));
  return OPERATOR_DISPLAY_ORDER.filter((symbol) => symbols.has(symbol));
}

function keyRow(key: OmnibarKey, withPrefix: boolean): ChoiceRow {
  const head = `${withPrefix ? TAG_PREFIX : ''}${key.key}`;
  const row: ChoiceRow = {
    kind: 'key',
    label: key.key,
    insert: `${head}${defaultSymbol(key)}`,
    commit: false,
    category: key.category,
    helpText: key.helpText ?? (key.total ? key.total.toLocaleString() : undefined),
  };
  // a key with a real choice of operator opens the operator stage instead of guessing one
  if (keyOperators(key).length > 1) return { ...row, insert: head, pendingKey: { key, forcedTag: withPrefix } };
  return row;
}

/** Row index the operator stage starts on: the key's own default operator, below the header. */
export function operatorStageActiveRow({ key }: PendingKey): number {
  const index = keyOperators(key).indexOf(defaultSymbol(key));
  return 1 + Math.max(index, 0);
}

function buildOperatorRows({ key, forcedTag }: PendingKey): DropdownRow[] {
  const head = `${forcedTag ? TAG_PREFIX : ''}${key.key}`;
  return [
    { kind: 'header', label: `Operator for ${key.key}` },
    ...keyOperators(key).map(
      (symbol): ChoiceRow => ({
        kind: 'operator',
        label: OPERATOR_LABELS[symbol],
        insert: `${head}${symbol}`,
        commit: false,
        category: key.category,
        helpText: symbol,
      }),
    ),
  ];
}

function buildKeyRows(state: BufferState, buffer: string, registry: OmnibarRegistry): DropdownRow[] {
  const forcedTag = state.keyDraft.startsWith(TAG_PREFIX);
  const draft = forcedTag ? state.keyDraft.slice(TAG_PREFIX.length) : state.keyDraft;
  const rows: DropdownRow[] = [];

  if (!forcedTag) {
    const fields = rankKeys(registry.fields, draft, false);
    if (fields.length > 0) {
      rows.push({ kind: 'header', label: 'Fields' });
      rows.push(...fields.map((key) => keyRow(key, false)));
    }
  }

  const tags = rankKeys(registry.tags, draft, true);
  // a tag key shadowed by a reserved field is only reachable through the prefix, so show it that way
  const shadowed = new Set(registry.fields.map((entry) => entry.key.toLowerCase()));
  if (tags.length > 0) {
    rows.push({ kind: 'header', label: 'Tags' });
    rows.push(
      ...tags.map((key) => {
        const needsPrefix = forcedTag || shadowed.has(key.key.toLowerCase());
        const row = keyRow(key, needsPrefix);
        return needsPrefix ? { ...row, label: `${TAG_PREFIX}${key.key}` } : row;
      }),
    );
  }

  // offer the typed key as a brand-new tag key when it doesn't match one we know
  const trimmed = draft.trim();
  if (registry.tagTemplate && trimmed !== '' && !registry.tags.some((key) => key.key.toLowerCase() === trimmed.toLowerCase())) {
    // a reserved field of this name would shadow the invented key, so it needs the prefix for the same
    // reason a known shadowed tag does — without it the row writes a buffer that parses as the *field*,
    // and offers whatever operators the tag template allows rather than the field's
    const needsPrefix = forcedTag || shadowed.has(trimmed.toLowerCase());
    const row = keyRow(inventedTagKey(trimmed, registry.tagTemplate), needsPrefix);
    rows.push({ ...row, label: needsPrefix ? `${TAG_PREFIX}${trimmed}` : row.label, helpText: 'Use as a tag key' });
  }

  // free text is reachable only by typing a bare word, so advertise it rather than offering a `text=`
  // key the grammar doesn't accept. Last, so Tab still completes a real key.
  if (registry.text && buffer.trim() !== '' && state.result.kind === 'clause') {
    // label with the parsed value, not the raw buffer, so a quoted buffer doesn't read as `""a=b""`
    const value = state.result.clause.category === 'text' ? GetValueString(state.result.clause) : buffer;
    rows.push({ kind: 'text', label: `Search for "${value}"`, insert: buffer, commit: true, category: 'text' });
  }

  return rows;
}

function buildValueRows(state: BufferState): DropdownRow[] {
  const key = state.key;
  if (!key) return [{ kind: 'hint', label: state.result.kind === 'error' ? state.result.message : 'Unknown filter' }];

  // everything before the caret's segment, which the row re-emits so selection is additive
  const head = `${state.forcedTag ? TAG_PREFIX : ''}${key.key}${state.operator ?? '='}`;
  const committed = state.committedValues;
  // only `=` can take a list: the parser rejects `!=a,b` and `~a,b`, so those operators commit on pick
  const listable = key.orCapable && (state.operator ?? '=') === '=';

  const valueRow = (value: string): ChoiceRow => {
    const checked = committed.includes(value);
    const next = checked ? committed.filter((entry) => entry !== value) : [...committed, value];
    // list-capable operators invite another value with a trailing comma; the rest commit outright
    const insert = listable ? `${head}${next.join(',')}${next.length > 0 ? ',' : ''}` : `${head}${value}`;
    return { kind: 'value', label: value, insert, commit: !listable, category: '', checked };
  };

  const matches = key.values
    .map((value) => ({ value, tier: matchTier(value, state.valueDraft) }))
    .filter((entry) => entry.tier !== -1)
    .sort((a, b) => {
      // prioritize prefix matches over substring matches
      if (a.tier !== b.tier) return a.tier - b.tier;
      // within the same tier, sort numerically-aware alphabetically
      return compareValues(a.value, b.value);
    })
    .map((entry) => entry.value);
  const rows: DropdownRow[] = matches.map(valueRow);

  if (rows.length === 0) {
    const label =
      key.values.length === 0 ? `No known values for '${key.key}' — type a value, then Enter` : `No values match '${state.valueDraft}'`;
    rows.push({ kind: 'hint', label });
  }

  // let an open key take the typed value directly, mirroring the "use as a tag key" affordance
  const trimmed = state.valueDraft.trim();
  if (key.creatable && trimmed !== '' && !key.values.includes(trimmed)) {
    rows.push({
      kind: 'value',
      label: trimmed,
      insert: listable ? `${head}${[...committed, trimmed].join(',')},` : `${head}${trimmed}`,
      commit: !listable,
      category: '',
      helpText: `Use '${trimmed}'`,
    });
  }

  return rows;
}

/**
 * Build the dropdown rows for the current buffer. While `pendingKey` is set the buffer is just the
 * bare key, so the dropdown offers operators instead of parsing it.
 */
export function buildRows(
  buffer: string,
  registry: OmnibarRegistry,
  tagsCaseInsensitive: boolean,
  pendingKey?: PendingKey | null,
): DropdownRow[] {
  if (pendingKey) return buildOperatorRows(pendingKey);
  const state = parseBuffer(buffer, registry, tagsCaseInsensitive);
  return state.stage === 'key' ? buildKeyRows(state, buffer, registry) : buildValueRows(state);
}
