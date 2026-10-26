/**
 * Serialize omnibar state (clauses + time selection + settings) to/from the URL query string.
 *
 * Well-known fields use readable, legacy-compatible param keys (`query`, `groups`, `indexes`,
 * `tags[KEY]`, `limit`, `hide`, `start`/`end`/`last`) so existing link producers (TagBadge,
 * buildCollectionsBrowsingUrl) and old bookmarks keep working. Those keys can't carry a condition, so
 * any clause with a non-default one (`!=`, `~`) rides the generic, lossless fallback (`c=`) instead.
 *
 * Clauses, time and settings are exposed as three independent {@link ParamCodec}s so they can be bound
 * to the URL separately (they own disjoint keys and never clobber one another). Built on the generic
 * codec seam (`@utilities/url`); knows nothing about React.
 */

// project imports
import { Clause, ClauseCondition, clauseValues, CondIsMulti, NewTextClause, parseClauseCondition } from './clauses/ClauseTypes';
import { RelativeUnit, TimeSelection } from './timepicker/utils';
import type { ParamCodec } from '@utilities/url/codecs';

// spec: ./SPEC.md

/**
 * Request-shaping settings independent of any single clause.
 *
 * `hiddenTags` lives here rather than in a clause because it has no `key <operator> value` form: it is
 * a display filter over which tag keys are rendered, not a query filter (SPEC §10).
 */
export type OmnibarSettings = { tagsCaseInsensitive: boolean; limit: number; hiddenTags: string[] };

export function defaultOmnibarSettings(): OmnibarSettings {
  return { tagsCaseInsensitive: true, limit: 25, hiddenTags: [] };
}

/** Largest page size the UI will request. The API enforces no cap of its own, so this bounds it here. */
export const MAX_LIMIT = 500;

/** Clamp a page size into `1..=MAX_LIMIT`. */
export function clampLimit(limit: number): number {
  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}

export type OmniState = { clauses: Clause[]; time: TimeSelection; settings: OmnibarSettings };

// Param keys owned by the clause codec (excluding the dynamic `tags[KEY]` keys).
// These are disjoint from the dashboard's own keys — its seed keys (`sample`/`entity`/`repo`/`tag`/`depth`)
// and its `hidden`/`flagged` state keys — so a dashboard URL can merge omnibar and dashboard params without
// collision.
const CLAUSE_STATIC_KEYS = ['query', 'groups', 'indexes', 'c'];
// Param keys owned by the time codec.
const TIME_KEYS = ['last', 'round', 'start', 'end'];
// Param keys owned by the settings codec. `limit`, `hide` and `nohide` keep their existing,
// legacy-compatible names even though hidden tags are no longer clauses. `nohide` is the sentinel
// marking "hidden tags explicitly cleared" so it can be distinguished from "unset". Note the
// near-collision: `hide` holds hidden TAG KEYS, whereas the dashboard's `hidden` holds hidden NODE IDS.
const SETTINGS_KEYS = ['limit', 'caseInsensitive', 'hide', 'nohide'];

const UNIT_TO_ABBR: Record<RelativeUnit, string> = {
  minute: 'min',
  hour: 'h',
  day: 'd',
  week: 'w',
  month: 'mo',
  year: 'y',
};
const ABBR_TO_UNIT: Record<string, RelativeUnit> = Object.fromEntries(
  Object.entries(UNIT_TO_ABBR).map(([unit, abbr]) => [abbr, unit as RelativeUnit]),
);

// build a correctly-typed clause from raw parts, choosing single vs multi by condition
function makeClause(category: string, field: string, condition: ClauseCondition, values: string[]): Clause {
  if (CondIsMulti(condition)) {
    return { category, field, condition, value: { values } };
  }
  return { category, field, condition, value: { value: values[0] ?? '' } };
}

// a list-valued field is `Is` when it has one value, `IsOneOf` when it has several
function multiCondition(values: string[]): ClauseCondition {
  return values.length > 1 ? ClauseCondition.IsOneOf : ClauseCondition.Is;
}

/** Whether the readable param keys can represent this clause without losing its condition. */
function hasDefaultCondition(clause: Clause): boolean {
  return clause.condition === ClauseCondition.Is || clause.condition === ClauseCondition.IsOneOf;
}

// ---- generic fallback (any clause without a readable key) ---------------------------------------

function encodeGenericClause(clause: Clause): string {
  const valuesPart = clauseValues(clause).map(encodeURIComponent).join(',');
  return [clause.category, clause.field, clause.condition, valuesPart].map(encodeURIComponent).join('|');
}

function decodeGenericClause(raw: string): Clause | undefined {
  // links are user-editable, so a malformed escape drops this clause rather than throwing mid-render
  try {
    const parts = raw.split('|').map(decodeURIComponent);
    if (parts.length !== 4) return undefined;
    const [category, field, condStr, valuesStr] = parts;
    const condition = parseClauseCondition(condStr);
    if (!condition) return undefined;
    const values = valuesStr ? valuesStr.split(',').map(decodeURIComponent) : [];
    return makeClause(category, field, condition, values);
  } catch (error) {
    if (error instanceof URIError) return undefined;
    throw error;
  }
}

// ---- clauses <-> params ------------------------------------------------------------------------

/** Encode omnibar clauses into `params` (mutates in place). */
export function clausesToParams(clauses: Clause[], params: URLSearchParams): void {
  clauses.forEach((clause) => {
    const values = clauseValues(clause);
    // `!=` and `~` have no readable encoding, so they fall through to the generic form
    if (!hasDefaultCondition(clause)) {
      params.append('c', encodeGenericClause(clause));
    } else if (clause.field === 'text' && clause.category === 'text') {
      values.forEach((value) => params.append('query', value));
    } else if (clause.field === 'group' && clause.category === 'group') {
      values.forEach((value) => params.append('groups', value));
    } else if (clause.field === 'index' && clause.category === 'index') {
      values.forEach((value) => params.append('indexes', value));
    } else if (clause.category === 'tag' && clause.condition === ClauseCondition.Is) {
      params.append(`tags[${clause.field}]`, values[0]);
    } else {
      params.append('c', encodeGenericClause(clause));
    }
  });
}

/** Decode omnibar clauses from `params`. */
export function paramsToClauses(params: URLSearchParams): Clause[] {
  const clauses: Clause[] = [];

  params.getAll('query').forEach((value) => clauses.push(NewTextClause(value)));

  const groups = params.getAll('groups');
  if (groups.length > 0) {
    clauses.push(makeClause('group', 'group', multiCondition(groups), groups));
  }

  const indexes = params.getAll('indexes');
  if (indexes.length > 0) {
    clauses.push(makeClause('index', 'index', multiCondition(indexes), indexes));
  }

  // tags[KEY]=value -> one `Is` clause per value. Several values for one key stay separate clauses
  // because that is what the backend computes: they intersect rather than union.
  for (const [key, value] of params.entries()) {
    const match = /^tags\[(.+)\]$/.exec(key);
    if (match) {
      clauses.push(makeClause('tag', match[1], ClauseCondition.Is, [value]));
    }
  }

  params.getAll('c').forEach((raw) => {
    const clause = decodeGenericClause(raw);
    if (clause) {
      clauses.push(clause);
    }
  });

  return clauses;
}

// ---- time <-> params ---------------------------------------------------------------------------

/** Encode a time selection into `params` (mutates in place). `all` encodes to nothing. */
export function timeToParams(time: TimeSelection, params: URLSearchParams): void {
  if (time.mode === 'relative') {
    params.set('last', `${time.amount}${UNIT_TO_ABBR[time.unit]}`);
    if (time.round) {
      params.set('round', '1');
    }
  } else if (time.mode === 'absolute') {
    params.set('start', time.start.toISOString());
    params.set('end', time.end.toISOString());
  }
}

/** Decode a time selection from `params`, falling back to `defaultTime` when no time params exist. */
export function paramsToTime(params: URLSearchParams, defaultTime: TimeSelection = { mode: 'all' }): TimeSelection {
  const last = params.get('last');
  if (last) {
    const match = /^(\d+)(min|h|d|w|mo|y)$/.exec(last);
    if (match) {
      const unit = ABBR_TO_UNIT[match[2]];
      if (unit) {
        return { mode: 'relative', amount: Number.parseInt(match[1], 10), unit, round: params.get('round') === '1' };
      }
    }
  }
  // Accept a single-sided range: collections (and legacy links) may specify only `start` or only
  // `end` because each bound is independently optional in the data model. The omnibar's absolute
  // selection requires both, so fill the missing side — open start -> epoch, open end -> now — to
  // preserve the date filter instead of silently dropping it back to "all".
  const start = params.get('start');
  const end = params.get('end');
  if (start || end) {
    const startDate = start ? new Date(start) : new Date(0);
    const endDate = end ? new Date(end) : new Date();
    if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
      return { mode: 'absolute', start: startDate, end: endDate };
    }
  }
  return defaultTime;
}

// ---- settings <-> params ------------------------------------------------------------------------

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, idx) => value === b[idx]);
}

/** Encode settings into `params` (mutates in place). Values equal to `defaultSettings` are omitted. */
export function settingsToParams(settings: OmnibarSettings, params: URLSearchParams, defaultSettings: OmnibarSettings): void {
  if (settings.limit !== defaultSettings.limit) {
    params.set('limit', String(settings.limit));
  }
  if (settings.tagsCaseInsensitive !== defaultSettings.tagsCaseInsensitive) {
    params.set('caseInsensitive', settings.tagsCaseInsensitive ? '1' : '0');
  }
  if (!sameTags(settings.hiddenTags, defaultSettings.hiddenTags)) {
    // an empty list is indistinguishable from "unset" in the URL, so mark it with the sentinel
    if (settings.hiddenTags.length === 0) {
      params.set('nohide', '1');
    } else {
      settings.hiddenTags.forEach((value) => params.append('hide', value));
    }
  }
}

/** Decode settings from `params`, falling back to `defaultSettings` for any absent/unparseable field. */
export function paramsToSettings(params: URLSearchParams, defaultSettings: OmnibarSettings): OmnibarSettings {
  const limitParam = params.get('limit');
  // a plain positive integer only: `Number()` alone would read '' as 0 and '1e3' as 1000
  const parsedLimit = limitParam !== null && /^\d+$/.test(limitParam) ? Number.parseInt(limitParam, 10) : 0;
  // a hand-edited link can ask for any size, so clamp it just like the settings popover does
  const limit = parsedLimit > 0 ? clampLimit(parsedLimit) : defaultSettings.limit;

  const caseParam = params.get('caseInsensitive');
  // only the two values `settingsToParams` writes are meaningful; anything else is a mangled link
  const tagsCaseInsensitive = caseParam === '1' ? true : caseParam === '0' ? false : defaultSettings.tagsCaseInsensitive;

  // preserve default hidden-tag filtering when the URL is silent — but not when the user explicitly
  // cleared it (`nohide` sentinel)
  const hide = params.getAll('hide');
  let hiddenTags: string[];
  if (hide.length > 0) {
    hiddenTags = hide;
  } else if (params.get('nohide') === '1') {
    hiddenTags = [];
  } else {
    hiddenTags = defaultSettings.hiddenTags;
  }

  return { limit, tagsCaseInsensitive, hiddenTags };
}

// ---- combined helpers (for tests and legacy link producers) ------------------------------------

/** Encode both clauses and time into a fresh-or-existing `params`. */
export function clausesAndTimeToParams(
  clauses: Clause[],
  time: TimeSelection,
  params: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  clausesToParams(clauses, params);
  timeToParams(time, params);
  return params;
}

/** Decode clauses, time, and settings, merging in `defaults` where the URL is silent. */
export function paramsToClausesAndTime(params: URLSearchParams, defaults: OmniState): OmniState {
  return {
    clauses: paramsToClauses(params),
    time: paramsToTime(params, defaults.time),
    settings: paramsToSettings(params, defaults.settings),
  };
}

// ---- codecs ------------------------------------------------------------------------------------

/** A {@link ParamCodec} binding omnibar clauses to the URL. */
export function clausesCodec(): ParamCodec<Clause[]> {
  return {
    keys: (params) => [...CLAUSE_STATIC_KEYS, ...Array.from(params.keys()).filter((key) => key.startsWith('tags['))],
    encode: (clauses, params) => clausesToParams(clauses, params),
    decode: (params) => paramsToClauses(params),
  };
}

/** A {@link ParamCodec} binding the time selection to the URL, seeded from `defaultTime`. */
export function timeCodec(defaultTime: TimeSelection): ParamCodec<TimeSelection> {
  return {
    keys: () => TIME_KEYS,
    encode: (time, params) => timeToParams(time, params),
    decode: (params) => paramsToTime(params, defaultTime),
  };
}

/** A {@link ParamCodec} binding omnibar settings to the URL, seeded from `defaultSettings`. */
export function settingsCodec(defaultSettings: OmnibarSettings): ParamCodec<OmnibarSettings> {
  return {
    keys: () => SETTINGS_KEYS,
    encode: (settings, params) => settingsToParams(settings, params, defaultSettings),
    decode: (params) => paramsToSettings(params, defaultSettings),
  };
}
