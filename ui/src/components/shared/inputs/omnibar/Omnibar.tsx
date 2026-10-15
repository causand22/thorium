import styled from 'styled-components';
import ClauseEditor from './clauses/ClauseEditor';
import { Clause } from './clauses/ClauseTypes';
import { HashJump } from './clauses/hash';
import { OmnibarRegistry } from './clauses/parse';
import OmnibarSettingsButton from './OmnibarSettingsButton';
import SingleTimePicker from './timepicker/SingleTimePicker';
import { TimeSelection } from './timepicker/utils';
import { OmnibarContext, settingApplies } from './settingsRegistry';
import { OmnibarSettings } from './urlState';

// spec: ./SPEC.md

const OmnibarWrapperContainer = styled.div`
  max-width: 1000px;
  width: 100%;
  display: flex;
  justify-content: center;
  position: relative;
  margin-bottom: 20px;
`;

type OmnibarProps = {
  clauses: Clause[];
  setClauses: (next: Clause[]) => void;
  /** This bar's key vocabulary — which keys are typeable and which operators each accepts. */
  registry: OmnibarRegistry;
  placeholder?: string;
  /**
   * Extra removable tiles rendered inside the entry field alongside the clause chips (before the input) —
   * for state that reads as a filter tile but isn't a {@link Clause} (e.g. the dashboard's hidden nodes).
   */
  extraChips?: React.ReactNode;
  /** Time range state. Omit both `time` and `setTime` to render without a time picker. */
  time?: TimeSelection;
  setTime?: (next: TimeSelection) => void;
  /**
   * Request-shaping settings. Omit `settings`, `setSettings` or `settingsContext` to render without a
   * settings button. Only the settings that apply to `settingsContext` are shown or honored.
   */
  settings?: OmnibarSettings;
  setSettings?: (next: OmnibarSettings) => void;
  settingsContext?: OmnibarContext;
  /** Tag keys offered by settings that pick tags (e.g. hidden tags). */
  tagKeyOptions?: string[];
  /** Opt in to jumping straight to a file when Enter is pressed on a bare sha256. */
  hashJump?: HashJump;
};

const Omnibar: React.FC<OmnibarProps> = ({
  clauses,
  setClauses,
  registry,
  placeholder,
  extraChips,
  time,
  setTime,
  settings,
  setSettings,
  settingsContext,
  tagKeyOptions = [],
  hashJump,
}) => {
  // a stored case-sensitivity value is ignored where the setting isn't offered (e.g. search)
  const tagsCaseInsensitive =
    settings !== undefined && settingsContext !== undefined && settingApplies('tagsCaseInsensitive', settingsContext)
      ? settings.tagsCaseInsensitive
      : true;
  return (
    <OmnibarWrapperContainer>
      <ClauseEditor
        clauses={clauses}
        setClauses={setClauses}
        registry={registry}
        tagsCaseInsensitive={tagsCaseInsensitive}
        placeholder={placeholder}
        timepickerVisible={time !== undefined && setTime !== undefined}
        extraChips={extraChips}
        hashJump={hashJump}
      />
      {time !== undefined && setTime !== undefined && <SingleTimePicker time={time} setTime={setTime} />}
      {settings !== undefined && setSettings !== undefined && settingsContext !== undefined && (
        <OmnibarSettingsButton settings={settings} setSettings={setSettings} context={settingsContext} tagKeyOptions={tagKeyOptions} />
      )}
    </OmnibarWrapperContainer>
  );
};

export default Omnibar;
