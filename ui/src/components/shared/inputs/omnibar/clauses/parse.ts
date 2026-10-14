/**
 * The omnibar grammar: turning the text buffer into a {@link Clause} and back.
 *
 * The buffer holds exactly one in-progress clause, so the value is simply "the rest of the buffer" —
 * no quoting is needed for spaces and there are no escape sequences anywhere in the grammar. See
 * `../SPEC.md` for the full specification; the short version is:
 *
 *     "…"              -> text clause, one outer quote pair stripped
 *     <no operator>    -> text clause, verbatim
 *     [tag:]key OP val -> field or tag clause, OP being `=`, `!=` or `~`
 *
 * {@link parseBuffer} is the single source of truth for the editor: it drives the dropdown (via
 * `stage`/`keyDraft`/`valueDraft`) *and* the commit (via `result`), so there is no second
 * representation of "where am I" that can drift out of sync.
 */

// project imports
import { Clause, ClauseCondition, ClauseIsMulti, CondIsMulti, NewTextClause } from './ClauseTypes';

// spec: ../SPEC.md

/** The prefix that forces a key to be read as a tag, shadowing any same-named reserved field. */
export const TAG_PREFIX = 'tag:';

/** Operator symbols, longest first so a greedy scan prefers `!=` over `=`. */
export const OPERATORS = ['!=', '~', '='] as const;

export type OperatorSymbol = (typeof OPERATORS)[number];

/** Whether a key names a reserved field or a tag. Drives the dropdown section and the chip icon. */
export type OmnibarKeyKind = 'field' | 'tag';

/** One typeable key in a bar's vocabulary. */
export type OmnibarKey = {
  /** The key as typed, e.g. `group`, `arch`. */
  key: string;
  kind: OmnibarKeyKind;
  /** Legacy clause category — drives the chip icon and the extractors in `./utils`. */
  category: string;
  /** Operators this key accepts **on this bar**; an operator outside this list is a parse error. */
  conditions: ClauseCondition[];
  /** Whether the backend ORs comma-separated values for this key (see SPEC §6). */
  orCapable: boolean;
  /** Whether a value outside {@link values} is accepted. `false` means a closed enumeration. */
  creatable: boolean;
  /** Known values, for suggestions and (when `creatable` is false) validation. */
  values: string[];
  /** Documents carrying this key, when known. Ranks the dropdown's Tags section. */
  total?: number;
  helpText?: string;
};

/** The shape applied to tag keys the user invents, i.e. keys absent from {@link OmnibarRegistry.tags}. */
export type TagTemplate = Pick<OmnibarKey, 'category' | 'conditions' | 'orCapable'>;

/** A bar's complete key vocabulary. */
export type OmnibarRegistry = {
  /** Reserved fields, in dropdown order. These shadow same-named tag keys. */
  fields: OmnibarKey[];
  /** Known tag keys, in dropdown order (ranked by document count where available). */
  tags: OmnibarKey[];
  /** Template for user-invented tag keys. Absent means this bar has no tag vocabulary at all. */
  tagTemplate?: TagTemplate;
  /** The free-text key. Absent means bare words never commit on this bar. */
  text?: OmnibarKey;
};

/** A committable clause. */
export type ParseOk = { kind: 'clause'; clause: Clause };
/** The buffer is mid-typing: nothing to commit, but nothing is wrong either. Enter is inert. */
export type ParseIncomplete = { kind: 'incomplete' };
/** The buffer names something this bar can't execute. Enter is blocked and `message` is shown. */
export type ParseFailure = { kind: 'error'; message: string };

export type ParseResult = ParseOk | ParseIncomplete | ParseFailure;

/**
 * Everything the editor needs about the current buffer, derived in one pass.
 *
 * The dropdown reads `stage` to decide whether it is suggesting keys or values, `keyDraft`/`valueDraft`
 * to filter them, and `key`/`committedValues` to resolve the value list and its checkmarks. Enter reads
 * `result`.
 */
export type BufferState = {
  /** Whether the caret is in the key (no operator typed yet) or the value. */
  stage: 'key' | 'value';
  /** The key text typed so far, including any `tag:` prefix. Only meaningful at stage `key`. */
  keyDraft: string;
  /** The resolved key, once an operator has been typed. */
  key?: OmnibarKey;
  /** Whether the key was reached through an explicit `tag:` prefix (so `serialize` re-emits it). */
  forcedTag: boolean;
  operator?: OperatorSymbol;
  /** Values before the last comma — rendered with checkmarks in the dropdown. */
  committedValues: string[];
  /** The value segment after the last comma — filters the value suggestions. */
  valueDraft: string;
  result: ParseResult;
};

// ---- operators ----------------------------------------------------------------------------------

/** Map an operator symbol to its condition. `=` becomes `IsOneOf` when more than one value is given. */
export function symbolToCondition(symbol: OperatorSymbol, multi: boolean): ClauseCondition {
  switch (symbol) {
    case '!=':
      return ClauseCondition.IsNot;
    case '~':
      return ClauseCondition.Includes;
    case '=':
      return multi ? ClauseCondition.IsOneOf : ClauseCondition.Is;
  }
}

/** Map a condition back to the symbol that produces it. */
export function conditionToSymbol(condition: ClauseCondition): OperatorSymbol {
  switch (condition) {
    case ClauseCondition.IsNot:
      return '!=';
    case ClauseCondition.Includes:
      return '~';
    default:
      return '=';
  }
}

/**
 * Find the earliest operator in `buffer`. On an equal index the longer symbol wins, so `a!=b` reads as
 * `!=` rather than `=`.
 */
export function findOperator(buffer: string): { symbol: OperatorSymbol; index: number } | undefined {
  let best: { symbol: OperatorSymbol; index: number } | undefined;
  for (const symbol of OPERATORS) {
    const index = buffer.indexOf(symbol);
    if (index === -1) continue;
    if (!best || index < best.index || (index === best.index && symbol.length > best.symbol.length)) {
      best = { symbol, index };
    }
  }
  return best;
}

// ---- key resolution -----------------------------------------------------------------------------

/** Build the key used for a tag the registry doesn't know about. */
export function inventedTagKey(name: string, template: TagTemplate): OmnibarKey {
  return { key: name, kind: 'tag', creatable: true, values: [], ...template };
}

/**
 * Resolve a typed key name against a bar's vocabulary.
 *
 * Resolution order: an explicit `tag:` prefix wins; then a reserved field matched case-insensitively;
 * then a tag key. Tag keys match case-insensitively only when `tagsCaseInsensitive` is set, mirroring
 * the backend flag that lowercases both key and value. An unmatched name becomes an invented tag key
 * with the typed casing preserved.
 */
export function resolveKey(
  name: string,
  forcedTag: boolean,
  registry: OmnibarRegistry,
  tagsCaseInsensitive: boolean,
): OmnibarKey | undefined {
  const lower = name.toLowerCase();

  if (!forcedTag) {
    const field = registry.fields.find((entry) => entry.key.toLowerCase() === lower);
    if (field) return field;
  }

  const tag =
    registry.tags.find((entry) => entry.key === name) ??
    (tagsCaseInsensitive ? registry.tags.find((entry) => entry.key.toLowerCase() === lower) : undefined);
  if (tag) return tag;

  return registry.tagTemplate ? inventedTagKey(name, registry.tagTemplate) : undefined;
}

/** Whether a reserved field shadows `key`, meaning a tag clause on it needs the `tag:` prefix. */
export function keyIsShadowed(key: string, registry: OmnibarRegistry): boolean {
  const lower = key.toLowerCase();
  return registry.fields.some((entry) => entry.key.toLowerCase() === lower);
}

// ---- parse --------------------------------------------------------------------------------------

/**
 * A buffer with no operator: either a free-text clause, or a key the user is still typing.
 *
 * On a bar with no text vocabulary this stays `Incomplete` rather than erroring — the user is
 * part-way through typing a key, and the dropdown (which offers no "Search for…" row there) is the
 * signal that bare words won't commit.
 */
function textState(buffer: string, value: string, registry: OmnibarRegistry): BufferState {
  const base = { stage: 'key' as const, keyDraft: buffer, forcedTag: false, committedValues: [], valueDraft: '' };
  if (value === '' || !registry.text) {
    return { ...base, result: { kind: 'incomplete' } };
  }
  return { ...base, result: { kind: 'clause', clause: NewTextClause(value) } };
}

/**
 * Parse the editor buffer into {@link BufferState}.
 *
 * @param buffer - The raw text in the input. Not trimmed: a trailing space is part of a value.
 * @param registry - The bar's key vocabulary.
 * @param tagsCaseInsensitive - The omnibar setting; relaxes tag-key matching when set.
 */
export function parseBuffer(buffer: string, registry: OmnibarRegistry, tagsCaseInsensitive: boolean): BufferState {
  // a fully quoted buffer is always free text, with exactly one outer pair stripped
  if (buffer.length >= 2 && buffer.startsWith('"') && buffer.endsWith('"')) {
    return textState(buffer, buffer.slice(1, -1), registry);
  }

  const operator = findOperator(buffer);
  // no operator, or an operator with nothing before it (`=foo`), is free text
  if (!operator || operator.index === 0) {
    return textState(buffer, buffer, registry);
  }

  const rawKey = buffer.slice(0, operator.index);
  const forcedTag = rawKey.startsWith(TAG_PREFIX);
  const keyName = forcedTag ? rawKey.slice(TAG_PREFIX.length) : rawKey;
  if (keyName === '') {
    return textState(buffer, buffer, registry);
  }

  const key = resolveKey(keyName, forcedTag, registry, tagsCaseInsensitive);
  const rawValue = buffer.slice(operator.index + operator.symbol.length);

  // split the value for display purposes regardless of whether the key turns out to allow it, so the
  // dropdown still has something sensible to filter on while the user is mid-typing
  const segments = rawValue.split(',');
  const valueDraft = segments[segments.length - 1];
  const committedValues = segments.slice(0, -1).filter((segment) => segment !== '');
  const values = segments.filter((segment) => segment !== '');

  const state: BufferState = {
    stage: 'value',
    keyDraft: rawKey,
    key,
    forcedTag,
    operator: operator.symbol,
    committedValues,
    valueDraft,
    result: { kind: 'incomplete' },
  };

  const fail = (message: string): BufferState => ({ ...state, result: { kind: 'error', message } });

  if (!key) {
    return fail(`'${keyName}' is not a filter you can use here`);
  }
  if (!key.orCapable && rawValue.includes(',')) {
    return fail(`'${key.key}' can only match a single value here`);
  }
  if (values.length > 1 && operator.symbol !== '=') {
    return fail(`'${operator.symbol}' can only take a single value`);
  }

  const condition = symbolToCondition(operator.symbol, values.length > 1);
  if (!key.conditions.includes(condition)) {
    return fail(conditionRejection(key, operator.symbol, condition));
  }

  // an empty value is not an error — the user is still typing, and the dropdown stays open
  if (values.length === 0) return state;

  // a closed enumeration rejects values outside it — but only for exact-match conditions, since a
  // substring match is never expected to be a member of the list
  if (!key.creatable && key.values.length > 0 && condition !== ClauseCondition.Includes) {
    const unknown = values.find((value) => !key.values.includes(value));
    if (unknown !== undefined) {
      return fail(`'${unknown}' is not a known ${key.key}`);
    }
  }

  const base = { category: key.category, field: key.key };
  const clause: Clause = CondIsMulti(condition)
    ? { ...base, condition, value: { values } }
    : { ...base, condition, value: { value: values[0] } };

  return { ...state, result: { kind: 'clause', clause } };
}

/** Phrase the rejection of an operator in terms of what the user typed. */
function conditionRejection(key: OmnibarKey, symbol: OperatorSymbol, condition: ClauseCondition): string {
  if (condition === ClauseCondition.IsOneOf) {
    return `'${key.key}' can only match a single value here`;
  }
  if (symbol === '!=') {
    return `'${key.key}' can't be negated on this page`;
  }
  if (symbol === '~') {
    return `'${key.key}' doesn't support substring matching`;
  }
  return `'${key.key}' doesn't support '${symbol}'`;
}

// ---- serialize ----------------------------------------------------------------------------------

/** Structural equality for clauses, used to verify that a serialization round-trips. */
export function clausesEqual(a: Clause, b: Clause): boolean {
  if (a.category !== b.category || a.field !== b.field || a.condition !== b.condition) return false;
  const aValues = ClauseIsMulti(a) ? a.value.values : [a.value.value];
  const bValues = ClauseIsMulti(b) ? b.value.values : [b.value.value];
  return aValues.length === bValues.length && aValues.every((value, idx) => value === bValues[idx]);
}

function roundTrips(candidate: string, clause: Clause, registry: OmnibarRegistry, tagsCaseInsensitive: boolean): boolean {
  const result = parseBuffer(candidate, registry, tagsCaseInsensitive).result;
  return result.kind === 'clause' && clausesEqual(result.clause, clause);
}

/**
 * Render a clause back to buffer text, for chip editing and the Backspace pop.
 *
 * Self-verifying: the candidate is parsed back and quoted on mismatch, so the round-trip invariant
 * (`parse(serialize(c)) ≡ c`) holds for cases nobody enumerated rather than only for the ones the
 * quoting heuristic anticipates.
 *
 * @returns The buffer text, or `undefined` when the clause cannot be expressed in this bar's
 *   vocabulary — e.g. a clause decoded from a URL whose key this bar doesn't offer. Callers should
 *   treat such a chip as delete-only rather than editable.
 */
export function serializeClause(clause: Clause, registry: OmnibarRegistry, tagsCaseInsensitive: boolean): string | undefined {
  if (clause.category === 'text' && clause.field === 'text' && !ClauseIsMulti(clause)) {
    const raw = clause.value.value;
    if (roundTrips(raw, clause, registry, tagsCaseInsensitive)) return raw;
    const quoted = `"${raw}"`;
    return roundTrips(quoted, clause, registry, tagsCaseInsensitive) ? quoted : undefined;
  }

  const prefix = clause.category === 'tag' && keyIsShadowed(clause.field, registry) ? TAG_PREFIX : '';
  const values = ClauseIsMulti(clause) ? clause.value.values : [clause.value.value];
  const candidate = `${prefix}${clause.field}${conditionToSymbol(clause.condition)}${values.join(',')}`;
  return roundTrips(candidate, clause, registry, tagsCaseInsensitive) ? candidate : undefined;
}
