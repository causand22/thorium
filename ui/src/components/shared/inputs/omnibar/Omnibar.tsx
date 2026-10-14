import styled from 'styled-components';
import ClauseEditor from './clauses/ClauseEditor';
import { Clause } from './clauses/ClauseTypes';
import { OmnibarRegistry } from './clauses/parse';
import OmnibarSettingsButton from './OmnibarSettingsButton';
import SingleTimePicker from './timepicker/SingleTimePicker';
import { TimeSelection } from './timepicker/utils';
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
  /** Request-shaping settings (case sensitivity, limit, hidden tags). Omit both to render without a settings button. */
  settings?: OmnibarSettings;
  setSettings?: (next: OmnibarSettings) => void;
  /** Tag keys offered in the settings popover's hidden-tags picker. */
  hiddenTagOptions?: string[];
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
  hiddenTagOptions = [],
}) => {
  return (
    <OmnibarWrapperContainer>
      <ClauseEditor
        clauses={clauses}
        setClauses={setClauses}
        registry={registry}
        tagsCaseInsensitive={settings?.tagsCaseInsensitive ?? true}
        placeholder={placeholder}
        timepickerVisible={time !== undefined && setTime !== undefined}
        extraChips={extraChips}
      />
      {time !== undefined && setTime !== undefined && <SingleTimePicker time={time} setTime={setTime} />}
      {settings !== undefined && setSettings !== undefined && (
        <OmnibarSettingsButton settings={settings} setSettings={setSettings} hiddenTagOptions={hiddenTagOptions} />
      )}
    </OmnibarWrapperContainer>
  );
};

export default Omnibar;
