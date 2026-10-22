import { describe, it, expect } from 'vitest';

// project imports
import { commitSettings, OmnibarContext, settingApplies, settingsForContext } from './settingsRegistry';
import { toggleKey } from './settingsControls/HiddenTagsControl';
import { parseLimitInput } from './settingsControls/LimitControl';
import { defaultOmnibarSettings, MAX_LIMIT } from './urlState';

const keysFor = (context: OmnibarContext) => settingsForContext(context).flatMap((entry) => entry.keys);

describe('settings visibility by context', () => {
  it('shows only the limit on the main search bar', () => {
    expect(keysFor('search')).toEqual(['limit']);
  });

  it('shows hidden tags only when browsing files', () => {
    expect(settingApplies('hiddenTags', 'files')).toBe(true);
    expect(settingApplies('hiddenTags', 'repos')).toBe(false);
    expect(settingApplies('hiddenTags', 'entities')).toBe(false);
    expect(settingApplies('hiddenTags', 'search')).toBe(false);
  });

  it('shows case-insensitive matching on every browse page but not on search', () => {
    expect(settingApplies('tagsCaseInsensitive', 'files')).toBe(true);
    expect(settingApplies('tagsCaseInsensitive', 'repos')).toBe(true);
    expect(settingApplies('tagsCaseInsensitive', 'entities')).toBe(true);
    expect(settingApplies('tagsCaseInsensitive', 'search')).toBe(false);
  });

  it('offers the limit everywhere', () => {
    (['search', 'files', 'repos', 'entities'] as OmnibarContext[]).forEach((context) => {
      expect(settingApplies('limit', context)).toBe(true);
    });
  });

  it('lists each setting at most once per context', () => {
    (['search', 'files', 'repos', 'entities'] as OmnibarContext[]).forEach((context) => {
      const keys = keysFor(context);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });
});

describe('parseLimitInput', () => {
  it('parses a plain number', () => {
    expect(parseLimitInput('40')).toBe(40);
  });

  it('clamps to the maximum', () => {
    expect(parseLimitInput('100000')).toBe(MAX_LIMIT);
  });

  it('resets an empty field to the default', () => {
    expect(parseLimitInput('')).toBe(defaultOmnibarSettings().limit);
    expect(parseLimitInput('  ')).toBe(defaultOmnibarSettings().limit);
  });

  it.each(['0', '-5', '1e3', '2.5', 'abc'])('ignores %j', (raw) => {
    expect(parseLimitInput(raw)).toBeUndefined();
  });
});

describe('toggleKey', () => {
  it('adds a key in sorted order', () => {
    expect(toggleKey(['b'], 'a')).toEqual(['a', 'b']);
  });

  it('removes a key that is present', () => {
    expect(toggleKey(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('commitSettings', () => {
  const baseline = { ...defaultOmnibarSettings(), hiddenTags: ['Results'] };

  it('returns nothing when the popover closes untouched', () => {
    expect(commitSettings(baseline, { ...baseline }, baseline)).toBeUndefined();
  });

  it('treats an equal-but-new hidden tag list as untouched', () => {
    expect(commitSettings(baseline, { ...baseline, hiddenTags: ['Results'] }, baseline)).toBeUndefined();
  });

  it('commits an edited field', () => {
    expect(commitSettings(baseline, { ...baseline, limit: 100 }, baseline)).toEqual({ ...baseline, limit: 100 });
  });

  it('keeps URL changes made to other fields while the popover was open', () => {
    // the user edited only the limit, but back/forward changed the hidden tags in the meantime
    const current = { ...baseline, hiddenTags: ['Parent'] };
    expect(commitSettings(baseline, { ...baseline, limit: 100 }, current)).toEqual({ ...current, limit: 100 });
  });

  it('preserves settings that are not shown in this context', () => {
    // a search popover only edits the limit; its stored hidden tags must come through untouched
    const current = { ...baseline, tagsCaseInsensitive: false };
    expect(commitSettings(baseline, { ...baseline, limit: 50 }, current)).toEqual({ ...current, limit: 50 });
  });
});
