import { OmnibarSettings } from '../urlState';

// spec: ../SPEC.md

export type SettingControlProps = {
  /** The popover's in-progress (uncommitted) settings. */
  draft: OmnibarSettings;
  /** Merge a change into the draft. */
  update: (patch: Partial<OmnibarSettings>) => void;
  /** Tag keys offered by pickers that list tags. */
  tagKeyOptions: string[];
};
