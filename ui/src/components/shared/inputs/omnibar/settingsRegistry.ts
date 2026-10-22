import CaseInsensitiveControl from './settingsControls/CaseInsensitiveControl';
import HiddenTagsControl from './settingsControls/HiddenTagsControl';
import LimitControl from './settingsControls/LimitControl';
import { SettingControlProps } from './settingsControls/types';
import { OmnibarSettings } from './urlState';

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

export type SettingDescriptor = {
  /** The {@link OmnibarSettings} field(s) this entry edits; used to diff the draft against the baseline. */
  keys: (keyof OmnibarSettings)[];
  /** Contexts where this setting is shown *and* has an effect. Elsewhere its stored value is ignored. */
  contexts: OmnibarContext[];
  Control: React.FC<SettingControlProps>;
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
