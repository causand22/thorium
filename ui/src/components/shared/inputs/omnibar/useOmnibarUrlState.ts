// project imports
import { Clause } from './clauses/ClauseTypes';
import { clausesCodec, OmniState, OmnibarSettings, settingsCodec, timeCodec } from './urlState';
import { TimeSelection } from './timepicker/utils';
import { useUrlState } from '@utilities/url/useUrlState';

export type OmnibarUrlState = {
  clauses: Clause[];
  setClauses: (next: Clause[]) => void;
  time: TimeSelection;
  setTime: (next: TimeSelection) => void;
  settings: OmnibarSettings;
  setSettings: (next: OmnibarSettings) => void;
};

/**
 * URL-backed omnibar state: a drop-in replacement for the `useState` triples that browse pages use
 * to hold their omnibar `clauses`, `time`, and `settings`. Each is bound through an independent
 * codec (disjoint URL keys), so the omnibar component itself stays unchanged — only the owner of
 * the lifted state changes from local state to the URL.
 *
 * Pages without a time picker or settings button (Images/Pipelines/Users/Groups) simply ignore the
 * fields they don't render; an `all` time selection and default settings serialize to nothing.
 */
export function useOmnibarUrlState(defaults: OmniState): OmnibarUrlState {
  const [clauses, setClauses] = useUrlState(clausesCodec(), defaults.clauses);
  const [time, setTime] = useUrlState(timeCodec(defaults.time), defaults.time);
  const [settings, setSettings] = useUrlState(settingsCodec(defaults.settings), defaults.settings);
  return { clauses, setClauses, time, setTime, settings, setSettings };
}
