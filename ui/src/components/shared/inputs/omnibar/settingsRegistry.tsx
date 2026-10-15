import { useMemo, useState } from 'react';
import { Form } from 'react-bootstrap';
import { styled } from 'styled-components';
import { clampLimit, defaultOmnibarSettings, MAX_LIMIT, OmnibarSettings } from './urlState';

// spec: ./SPEC.md

/**
 * Where an omnibar is being used. Each setting declares the contexts it applies to, and the settings
 * popover only shows (and the page only honors) the settings that apply to the current one.
 *
 * - `search`: the main Elasticsearch-backed search page
 * - `files` / `repos` / `entities`: the Scylla-backed browse pages for that kind
 */
export type OmnibarContext = 'search' | 'files' | 'repos' | 'entities';

/** Contexts that list through the Scylla routes, as opposed to search. */
const BROWSE_CONTEXTS: OmnibarContext[] = ['files', 'repos', 'entities'];
const ALL_CONTEXTS: OmnibarContext[] = ['search', ...BROWSE_CONTEXTS];

export type SettingControlProps = {
  /** The popover's in-progress (uncommitted) settings. */
  draft: OmnibarSettings;
  /** Merge a change into the draft. */
  update: (patch: Partial<OmnibarSettings>) => void;
  /** Tag keys offered by pickers that list tags. */
  tagKeyOptions: string[];
};

export type SettingDescriptor = {
  /** The {@link OmnibarSettings} field(s) this entry edits; used to diff the draft against the baseline. */
  keys: (keyof OmnibarSettings)[];
  /** Contexts where this setting is shown *and* has an effect. Elsewhere its stored value is ignored. */
  contexts: OmnibarContext[];
  Control: React.FC<SettingControlProps>;
};

const SettingsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
`;

const SettingsSection = styled.div``;

const SectionLabel = styled.div`
  margin-bottom: 6px;
`;

const TagList = styled.div`
  max-height: 180px;
  overflow-y: auto;
  margin-top: 6px;
`;

const CaseInsensitiveControl: React.FC<SettingControlProps> = ({ draft, update }) => (
  <SettingsRow>
    <Form.Label htmlFor="omnibar-settings-case-insensitive" className="m-0">
      Case-insensitive tag matching
    </Form.Label>
    <Form.Check
      type="switch"
      id="omnibar-settings-case-insensitive"
      checked={draft.tagsCaseInsensitive}
      onChange={(e) => update({ tagsCaseInsensitive: e.target.checked })}
    />
  </SettingsRow>
);

/**
 * Keeps its own text so the field can be emptied while typing. A valid number is clamped into the
 * draft immediately; an empty field resets to the default; anything else leaves the draft alone, and
 * the field snaps back to the draft's value on blur.
 */
const LimitControl: React.FC<SettingControlProps> = ({ draft, update }) => {
  const [text, setText] = useState(String(draft.limit));
  return (
    <SettingsRow>
      <Form.Label htmlFor="omnibar-settings-limit" className="m-0">
        Result limit
      </Form.Label>
      <Form.Control
        type="number"
        id="omnibar-settings-limit"
        min={1}
        max={MAX_LIMIT}
        style={{ width: '90px' }}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const next = parseLimitInput(e.target.value);
          if (next !== undefined) {
            update({ limit: next });
          }
        }}
        onBlur={() => setText(String(draft.limit))}
      />
    </SettingsRow>
  );
};

const HiddenTagsControl: React.FC<SettingControlProps> = ({ draft, update, tagKeyOptions }) => {
  const [tagFilter, setTagFilter] = useState('');

  // always offer the already-hidden keys, so one can be un-hidden even when it is absent from the
  // (sampled, cache-backed) option list
  const tagKeys = useMemo(() => {
    const all = Array.from(new Set([...draft.hiddenTags, ...tagKeyOptions])).sort();
    const needle = tagFilter.trim().toLowerCase();
    return needle === '' ? all : all.filter((key) => key.toLowerCase().includes(needle));
  }, [draft.hiddenTags, tagKeyOptions, tagFilter]);

  const toggleHidden = (key: string) => {
    update({ hiddenTags: toggleKey(draft.hiddenTags, key) });
  };

  return (
    <SettingsSection>
      <SectionLabel>Hidden tags</SectionLabel>
      <Form.Control
        type="search"
        placeholder="Filter tag keys..."
        aria-label="Filter tag keys"
        value={tagFilter}
        onChange={(e) => setTagFilter(e.target.value)}
      />
      <TagList>
        {tagKeys.length === 0 && <Form.Text>No tag keys available</Form.Text>}
        {tagKeys.map((key) => (
          <Form.Check
            key={key}
            type="checkbox"
            id={`omnibar-hidden-tag-${key}`}
            label={key}
            checked={draft.hiddenTags.includes(key)}
            onChange={() => toggleHidden(key)}
          />
        ))}
      </TagList>
    </SettingsSection>
  );
};

/**
 * Every setting the popover can show, in display order.
 *
 * To add a setting: add its field to {@link OmnibarSettings} and `defaultOmnibarSettings`, give it URL
 * (de)serialization in `urlState.ts` (`settingsToParams` / `paramsToSettings` / `SETTINGS_KEYS`), and
 * add an entry here declaring its contexts and control. The popover, its commit logic and the
 * "hide the button when nothing applies" behavior need no changes.
 */
export const SETTINGS_REGISTRY: SettingDescriptor[] = [
  {
    // the Scylla list routes honor this; the Elasticsearch search route does not
    keys: ['tagsCaseInsensitive'],
    contexts: BROWSE_CONTEXTS,
    Control: CaseInsensitiveControl,
  },
  { keys: ['limit'], contexts: ALL_CONTEXTS, Control: LimitControl },
  {
    // a client-side display filter that only the file rows implement
    keys: ['hiddenTags'],
    contexts: ['files'],
    Control: HiddenTagsControl,
  },
];

/** The settings entries shown for `context`, in display order. */
export function settingsForContext(context: OmnibarContext): SettingDescriptor[] {
  return SETTINGS_REGISTRY.filter((entry) => entry.contexts.includes(context));
}

/** Whether `key` is shown, and so honored, in `context`. */
export function settingApplies(key: keyof OmnibarSettings, context: OmnibarContext): boolean {
  return settingsForContext(context).some((entry) => entry.keys.includes(key));
}

/**
 * Parse the limit field. Returns the clamped limit, the default for an empty field, or `undefined`
 * for input that is not a usable number (the draft is then left unchanged).
 */
export function parseLimitInput(raw: string): number | undefined {
  if (raw.trim() === '') {
    return defaultOmnibarSettings().limit;
  }
  if (!/^\d+$/.test(raw.trim())) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return parsed > 0 ? clampLimit(parsed) : undefined;
}

/** Add `key` to a sorted key list, or remove it if already present. */
export function toggleKey(keys: string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((entry) => entry !== key) : [...keys, key].sort();
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The settings to commit when the popover closes: `current` with only the fields the user actually
 * edited (`draft` vs the `baseline` taken when it opened) applied. Merging a patch rather than
 * writing the whole draft means a URL change made while the popover was open (back/forward) and
 * settings hidden in this context are never overwritten with stale values. Returns `undefined` when
 * nothing was edited, so closing an untouched popover doesn't touch the URL.
 */
export function commitSettings(baseline: OmnibarSettings, draft: OmnibarSettings, current: OmnibarSettings): OmnibarSettings | undefined {
  const edited = (Object.keys(draft) as (keyof OmnibarSettings)[]).filter((key) => !sameValue(draft[key], baseline[key]));
  if (edited.length === 0) {
    return undefined;
  }
  const next = { ...current };
  edited.forEach((key) => {
    // each field is assigned from the same key of `draft`, so the types line up
    (next as Record<string, unknown>)[key] = draft[key];
  });
  return next;
}
