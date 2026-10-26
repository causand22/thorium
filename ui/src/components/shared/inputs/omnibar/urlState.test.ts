import { describe, it, expect } from 'vitest';

// project imports
import { Clause, ClauseCondition, DEFAULT_HIDDEN_TAGS } from './clauses/ClauseTypes';
import { AbsoluteSelection, RelativeSelection, TimeSelection } from './timepicker/utils';
import {
  clausesAndTimeToParams,
  clausesCodec,
  defaultOmnibarSettings,
  MAX_LIMIT,
  paramsToClauses,
  paramsToClausesAndTime,
  paramsToSettings,
  paramsToTime,
  settingsCodec,
  settingsToParams,
} from './urlState';

const single = (category: string, field: string, value: string, condition = ClauseCondition.Is): Clause =>
  ({ category, field, condition, value: { value } }) as Clause;
const multi = (category: string, field: string, values: string[], condition = ClauseCondition.IsOneOf): Clause =>
  ({ category, field, condition, value: { values } }) as Clause;

const NO_DEFAULTS = { clauses: [] as Clause[], time: { mode: 'all' } as TimeSelection, settings: defaultOmnibarSettings() };

/** Defaults for a page that hides the standard tag keys, e.g. entity browsing. */
const HIDING_DEFAULTS = { ...defaultOmnibarSettings(), hiddenTags: DEFAULT_HIDDEN_TAGS };

// encode -> decode and compare the resulting clause set, order-insensitively
function roundTripClauses(clauses: Clause[]): Clause[] {
  const params = clausesAndTimeToParams(clauses, { mode: 'all' });
  return paramsToClauses(params);
}

describe('clause url round-trips', () => {
  it('round-trips text clauses as query params', () => {
    const out = roundTripClauses([single('text', 'text', 'evil.exe')]);
    expect(out).toEqual([single('text', 'text', 'evil.exe')]);
  });

  it('round-trips a single group as `Is` and multiple groups as `IsOneOf`', () => {
    expect(roundTripClauses([single('group', 'group', 'corp')])).toEqual([single('group', 'group', 'corp')]);
    expect(roundTripClauses([multi('group', 'group', ['corp', 'team-a'])])).toEqual([multi('group', 'group', ['corp', 'team-a'])]);
  });

  it('round-trips indexes', () => {
    expect(roundTripClauses([multi('index', 'index', ['SampleResults', 'SampleTags'])])).toEqual([
      multi('index', 'index', ['SampleResults', 'SampleTags']),
    ]);
  });

  it('round-trips tag clauses as tags[KEY]=value', () => {
    const params = clausesAndTimeToParams([single('tag', 'family', 'emotet')], { mode: 'all' });
    expect(params.getAll('tags[family]')).toEqual(['emotet']);
    expect(paramsToClauses(params)).toEqual([single('tag', 'family', 'emotet')]);
  });

  it('routes a negated clause through the generic fallback, which carries the condition', () => {
    const clauses = [single('tag', 'arch', 'x86', ClauseCondition.IsNot)];
    const params = clausesAndTimeToParams(clauses, { mode: 'all' });
    expect(params.getAll('c')).toHaveLength(1);
    expect(params.getAll('tags[arch]')).toEqual([]);
    expect(paramsToClauses(params)).toEqual(clauses);
  });

  it('routes a substring clause through the generic fallback', () => {
    const clauses = [single('name', 'name', 'unpack', ClauseCondition.Includes)];
    expect(roundTripClauses(clauses)).toEqual(clauses);
  });

  it('round-trips arbitrary fields through the generic fallback', () => {
    const clauses = [single('Users', 'username', 'alice', ClauseCondition.Includes), multi('role', 'role', ['Admin', 'Analyst'])];
    const params = clausesAndTimeToParams(clauses, { mode: 'all' });
    expect(params.getAll('c').length).toBe(2);
    expect(paramsToClauses(params)).toEqual(clauses);
  });

  it('preserves values containing separators through the generic fallback', () => {
    const clauses = [single('Owners', 'owner', 'a|b,c')];
    expect(roundTripClauses(clauses)).toEqual(clauses);
  });

  // a user-invented tag key can share a name with a reserved field; it must stay a tag
  it('keeps a tag keyed `text` or `index` distinct from the reserved fields', () => {
    const clauses = [single('tag', 'text', 'foo'), single('tag', 'index', 'SampleResults')];
    const params = clausesAndTimeToParams(clauses, { mode: 'all' });
    expect(params.getAll('query')).toEqual([]);
    expect(params.getAll('indexes')).toEqual([]);
    expect(paramsToClauses(params)).toEqual(clauses);
  });
});

describe('clause decoding', () => {
  it('an empty URL yields no clauses', () => {
    expect(paramsToClauses(new URLSearchParams(''))).toEqual([]);
  });

  // hand-edited or truncated links must never throw while the page is rendering
  it('drops a clause whose percent-encoding is malformed and keeps the rest', () => {
    const params = new URLSearchParams();
    params.append('c', 'tag|arch|is%|x86');
    params.append('c', 'tag|%zz|is|x86');
    params.append('c', ['tag', 'arch', ClauseCondition.IsNot, 'x86'].join('|'));
    expect(() => paramsToClauses(params)).not.toThrow();
    expect(paramsToClauses(params)).toEqual([single('tag', 'arch', 'x86', ClauseCondition.IsNot)]);
  });

  it('drops a clause whose inner value encoding is malformed', () => {
    const params = new URLSearchParams();
    params.append('c', ['tag', 'arch', ClauseCondition.IsNot, '%25zz%25'].join('|'));
    expect(paramsToClauses(params)).toEqual([]);
  });

  it('decodes repeated tags[KEY] values as separate clauses, matching the AND the backend performs', () => {
    const out = paramsToClauses(new URLSearchParams('tags[arch]=x86&tags[arch]=arm'));
    expect(out).toEqual([single('tag', 'arch', 'x86'), single('tag', 'arch', 'arm')]);
  });
});

// hidden tags moved from the clause codec to the settings codec, but keep the same param names so
// existing shared links keep resolving (SPEC §10, §12)
describe('hidden tags (settings codec, nohide sentinel)', () => {
  it('emits hide params for a non-default set', () => {
    const params = new URLSearchParams();
    settingsToParams({ ...HIDING_DEFAULTS, hiddenTags: ['OnlyThis'] }, params, HIDING_DEFAULTS);
    expect(params.getAll('hide')).toEqual(['OnlyThis']);
  });

  it('emits nohide=1 when the defaults hide tags but the user cleared them', () => {
    const params = new URLSearchParams();
    settingsToParams({ ...HIDING_DEFAULTS, hiddenTags: [] }, params, HIDING_DEFAULTS);
    expect(params.get('nohide')).toBe('1');
  });

  it('does not re-inject defaults when nohide is present', () => {
    expect(paramsToSettings(new URLSearchParams('nohide=1'), HIDING_DEFAULTS).hiddenTags).toEqual([]);
  });

  it('does not override an explicit hide param with defaults', () => {
    expect(paramsToSettings(new URLSearchParams('hide=OnlyThis'), HIDING_DEFAULTS).hiddenTags).toEqual(['OnlyThis']);
  });

  it('injects defaults for a fresh (empty) URL', () => {
    expect(paramsToSettings(new URLSearchParams(), HIDING_DEFAULTS).hiddenTags).toEqual(DEFAULT_HIDDEN_TAGS);
  });

  it('never emits nohide for pages whose defaults hide nothing', () => {
    const defaults = defaultOmnibarSettings();
    const params = new URLSearchParams();
    settingsToParams(defaults, params, defaults);
    expect(params.get('nohide')).toBeNull();
  });

  it('round-trips a cleared state through the settings codec', () => {
    const codec = settingsCodec(HIDING_DEFAULTS);
    const params = new URLSearchParams();
    codec.encode({ ...HIDING_DEFAULTS, hiddenTags: [] }, params);
    expect(codec.decode(params)?.hiddenTags).toEqual([]);
  });

  it('is no longer owned by the clause codec', () => {
    const codec = clausesCodec();
    const params = new URLSearchParams();
    codec.encode([], params);
    expect(params.get('nohide')).toBeNull();
    expect(codec.keys(new URLSearchParams())).not.toContain('hide');
  });
});

describe('time url round-trips', () => {
  it('encodes `all` to nothing and decodes back to `all`', () => {
    const params = clausesAndTimeToParams([], { mode: 'all' });
    expect(params.toString()).toBe('');
    expect(paramsToTime(params)).toEqual({ mode: 'all' });
  });

  it('round-trips a relative selection (with rounding)', () => {
    const sel: RelativeSelection = { mode: 'relative', amount: 7, unit: 'day', round: true };
    const params = clausesAndTimeToParams([], sel);
    expect(params.get('last')).toBe('7d');
    expect(params.get('round')).toBe('1');
    expect(paramsToTime(params)).toEqual(sel);
  });

  it('round-trips a relative selection without rounding', () => {
    const sel: RelativeSelection = { mode: 'relative', amount: 3, unit: 'month', round: false };
    const params = clausesAndTimeToParams([], sel);
    expect(params.get('last')).toBe('3mo');
    expect(paramsToTime(params)).toEqual(sel);
  });

  it('round-trips an absolute selection', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-02-01T00:00:00.000Z');
    const sel: AbsoluteSelection = { mode: 'absolute', start, end };
    const params = clausesAndTimeToParams([], sel);
    const decoded = paramsToTime(params);
    expect(decoded).toEqual(sel);
  });

  // open-ended collections set only one bound; the missing side is filled rather than dropped
  it('decodes a `start`-only range, filling `end` with now', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const decoded = paramsToTime(new URLSearchParams({ start: start.toISOString() }));
    expect(decoded.mode).toBe('absolute');
    if (decoded.mode === 'absolute') {
      expect(decoded.start).toEqual(start);
      expect(decoded.end.getTime()).toBeGreaterThan(start.getTime());
    }
  });

  it('decodes an `end`-only range, filling `start` with the epoch', () => {
    const end = new Date('2026-02-01T00:00:00.000Z');
    const decoded = paramsToTime(new URLSearchParams({ end: end.toISOString() }));
    expect(decoded).toEqual({ mode: 'absolute', start: new Date(0), end });
  });

  it('falls back to the default when an only-bound is unparseable', () => {
    expect(paramsToTime(new URLSearchParams({ start: 'not-a-date' }))).toEqual({ mode: 'all' });
  });
});

describe('settings url round-trips', () => {
  it('encodes defaults to nothing and decodes back to defaults', () => {
    const defaults = defaultOmnibarSettings();
    const params = new URLSearchParams();
    settingsToParams(defaults, params, defaults);
    expect(params.toString()).toBe('');
    expect(paramsToSettings(params, defaults)).toEqual(defaults);
  });

  it('round-trips a non-default limit', () => {
    const defaults = defaultOmnibarSettings();
    const params = new URLSearchParams();
    settingsToParams({ ...defaults, limit: 100 }, params, defaults);
    expect(params.get('limit')).toBe('100');
    expect(paramsToSettings(params, defaults)).toEqual({ ...defaults, limit: 100 });
  });

  it('round-trips a non-default case-sensitivity flag', () => {
    const defaults = defaultOmnibarSettings();
    const params = new URLSearchParams();
    settingsToParams({ ...defaults, tagsCaseInsensitive: !defaults.tagsCaseInsensitive }, params, defaults);
    expect(paramsToSettings(params, defaults)).toEqual({ ...defaults, tagsCaseInsensitive: !defaults.tagsCaseInsensitive });
  });

  it.each(['', 'yes', 'true', '2'])('falls back to the default for caseInsensitive=%j', (value) => {
    const defaults = defaultOmnibarSettings();
    const decoded = paramsToSettings(new URLSearchParams({ caseInsensitive: value }), defaults);
    expect(decoded.tagsCaseInsensitive).toBe(defaults.tagsCaseInsensitive);
  });

  it('falls back to defaults for an unparseable limit', () => {
    const defaults = defaultOmnibarSettings();
    expect(paramsToSettings(new URLSearchParams('limit=abc'), defaults)).toEqual(defaults);
  });

  it.each(['', '0', '-5', '1e3', '2.5', ' 5', '5x'])('falls back to the default for limit=%j', (limit) => {
    const defaults = defaultOmnibarSettings();
    expect(paramsToSettings(new URLSearchParams({ limit }), defaults).limit).toBe(defaults.limit);
  });

  it('clamps an oversized limit to the maximum', () => {
    expect(paramsToSettings(new URLSearchParams('limit=100000'), defaultOmnibarSettings()).limit).toBe(MAX_LIMIT);
  });

  it('accepts a limit at the maximum', () => {
    expect(paramsToSettings(new URLSearchParams(`limit=${MAX_LIMIT}`), defaultOmnibarSettings()).limit).toBe(MAX_LIMIT);
  });

  it('accepts a plain positive integer limit', () => {
    expect(paramsToSettings(new URLSearchParams('limit=40'), defaultOmnibarSettings()).limit).toBe(40);
  });

  it('a codec round-trip via encode/decode matches the original settings', () => {
    const defaults = defaultOmnibarSettings();
    const codec = settingsCodec(defaults);
    const settings = { limit: 50, tagsCaseInsensitive: !defaults.tagsCaseInsensitive, hiddenTags: ['Results'] };
    const params = new URLSearchParams();
    codec.encode(settings, params);
    expect(codec.decode(params)).toEqual(settings);
  });
});

describe('legacy link compatibility', () => {
  it('decodes a TagBadge link (?tags[KEY]=v); `limit` is ignored by the clause codec (owned by settings)', () => {
    const out = paramsToClauses(new URLSearchParams('tags[av]=malicious&limit=10'));
    expect(out).toContainEqual(single('tag', 'av', 'malicious'));
    expect(out.some((c) => c.field === 'limit')).toBe(false);
  });

  it('decodes a buildCollectionsBrowsingUrl link (groups + tags + start/end)', () => {
    const params = new URLSearchParams();
    params.append('groups', 'corp');
    params.append('tags[family]', 'emotet');
    params.set('start', '2026-01-01T00:00:00.000Z');
    params.set('end', '2026-02-01T00:00:00.000Z');
    const { clauses, time } = paramsToClausesAndTime(params, NO_DEFAULTS);
    expect(clauses).toContainEqual(single('group', 'group', 'corp'));
    expect(clauses).toContainEqual(single('tag', 'family', 'emotet'));
    expect(time.mode).toBe('absolute');
  });
});
