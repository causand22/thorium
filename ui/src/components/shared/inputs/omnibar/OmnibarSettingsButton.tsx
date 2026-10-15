import { useRef, useState } from 'react';
import { Overlay, Popover } from 'react-bootstrap';
import { styled } from 'styled-components';
import { FaGear } from 'react-icons/fa6';
import { commitSettings, OmnibarContext, settingsForContext } from './settingsRegistry';
import { OmnibarSettings } from './urlState';

// spec: ./SPEC.md

const SettingsButton = styled.button`
  border-radius: 5px;
  background-color: var(--thorium-omnibar-bg);
  color: var(--thorium-text);
  border: 1px solid var(--thorium-omnibar-border);
  height: 100%;

  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 10px;
  margin-left: 5px;
`;

const SettingsPopover = styled(Popover)`
  min-width: 280px;
  border: 1px solid var(--thorium-omnibar-border);
  border-radius: 5px;
  padding: 10px;
  background-color: var(--thorium-panel-bg);
  color: var(--thorium-text);
`;

const SettingsEntry = styled.div`
  border-top: 1px solid var(--thorium-omnibar-border);
  padding-top: 10px;
  margin-top: 10px;

  &:first-child {
    border-top: none;
    padding-top: 0;
    margin-top: 0;
  }
`;

type OmnibarSettingsButtonProps = {
  settings: OmnibarSettings;
  setSettings: (next: OmnibarSettings) => void;
  /** Where this omnibar lives; decides which settings are shown. */
  context: OmnibarContext;
  /** Tag keys offered by settings that pick tags (e.g. hidden tags). */
  tagKeyOptions: string[];
};

/**
 * Settings button + popover, mirroring {@link SingleTimePicker}'s pattern: edits are held in local
 * draft state and only committed to `setSettings` when the popover closes. The controls come from
 * the settings registry, filtered to `context`; renders nothing when no setting applies there.
 *
 * Hidden tags live in settings rather than as a clause because they filter what is *rendered*, not
 * what is *queried*, and so have no `key <operator> value` form (SPEC §10).
 */
const OmnibarSettingsButton: React.FC<OmnibarSettingsButtonProps> = ({ settings, setSettings, context, tagKeyOptions }) => {
  const [draft, setDraft] = useState<OmnibarSettings>(settings);
  // the settings as they were when the popover opened, to tell what the user actually edited
  const baseline = useRef<OmnibarSettings>(settings);
  const [showPopover, setShowPopover] = useState(false);
  const target = useRef<HTMLButtonElement | null>(null);

  const entries = settingsForContext(context);
  if (entries.length === 0) {
    return null;
  }

  const close = () => {
    const next = commitSettings(baseline.current, draft, settings);
    if (next) {
      setSettings(next);
    }
    setShowPopover(false);
  };

  return (
    <>
      <SettingsButton
        ref={target}
        type="button"
        aria-label="Omnibar settings"
        title="Omnibar settings"
        onClick={() => {
          // only ever opens: while open, a click on this button is an outside click for the overlay,
          // whose `rootClose` commits and closes. Toggling here as well would reopen it right away
          // or reset the draft before it is committed.
          if (!showPopover) {
            baseline.current = settings;
            setDraft(settings);
            setShowPopover(true);
          }
        }}
      >
        <FaGear />
      </SettingsButton>
      <Overlay target={target.current} show={showPopover} placement="bottom-end" rootClose onHide={close}>
        <SettingsPopover id="omnibar-settings-popover">
          {entries.map((entry) => (
            <SettingsEntry key={entry.keys.join(',')}>
              <entry.Control draft={draft} update={(patch) => setDraft((prev) => ({ ...prev, ...patch }))} tagKeyOptions={tagKeyOptions} />
            </SettingsEntry>
          ))}
        </SettingsPopover>
      </Overlay>
    </>
  );
};

export default OmnibarSettingsButton;
