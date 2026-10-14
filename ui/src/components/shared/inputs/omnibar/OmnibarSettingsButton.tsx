import { useMemo, useRef, useState } from 'react';
import { Form, Overlay, Popover } from 'react-bootstrap';
import { styled } from 'styled-components';
import { FaGear } from 'react-icons/fa6';
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

const SettingsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 10px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SettingsSection = styled.div`
  border-top: 1px solid var(--thorium-omnibar-border);
  padding-top: 10px;
  margin-top: 10px;
`;

const SectionLabel = styled.div`
  margin-bottom: 6px;
`;

const TagList = styled.div`
  max-height: 180px;
  overflow-y: auto;
  margin-top: 6px;
`;

type OmnibarSettingsButtonProps = {
  settings: OmnibarSettings;
  setSettings: (next: OmnibarSettings) => void;
  /** Tag keys offered in the hidden-tags picker. */
  hiddenTagOptions: string[];
};

/**
 * Settings button + popover, mirroring {@link SingleTimePicker}'s pattern: edits are held in local
 * draft state and only committed to `setSettings` when the popover closes.
 *
 * Hidden tags live here rather than as a clause because they filter what is *rendered*, not what is
 * *queried*, and so have no `key <operator> value` form (SPEC §10).
 */
const OmnibarSettingsButton: React.FC<OmnibarSettingsButtonProps> = ({ settings, setSettings, hiddenTagOptions }) => {
  const [draft, setDraft] = useState<OmnibarSettings>(settings);
  const [showPopover, setShowPopover] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const target = useRef<HTMLButtonElement | null>(null);

  // always offer the already-hidden keys, so one can be un-hidden even when it is absent from the
  // (sampled, cache-backed) option list
  const tagKeys = useMemo(() => {
    const all = Array.from(new Set([...draft.hiddenTags, ...hiddenTagOptions])).sort();
    const needle = tagFilter.trim().toLowerCase();
    return needle === '' ? all : all.filter((key) => key.toLowerCase().includes(needle));
  }, [draft.hiddenTags, hiddenTagOptions, tagFilter]);

  const toggleHidden = (key: string) => {
    const hiddenTags = draft.hiddenTags.includes(key)
      ? draft.hiddenTags.filter((entry) => entry !== key)
      : [...draft.hiddenTags, key].sort();
    setDraft({ ...draft, hiddenTags });
  };

  return (
    <>
      <SettingsButton
        ref={target}
        type="button"
        aria-label="Omnibar settings"
        title="Omnibar settings"
        onClick={() => {
          setDraft(settings);
          setTagFilter('');
          setShowPopover((s) => !s);
        }}
      >
        <FaGear />
      </SettingsButton>
      <Overlay
        target={target.current}
        show={showPopover}
        placement="bottom-end"
        rootClose
        onHide={() => {
          setSettings(draft);
          setShowPopover(false);
        }}
      >
        <SettingsPopover id="omnibar-settings-popover">
          <SettingsRow>
            <Form.Label htmlFor="omnibar-settings-case-insensitive" className="m-0">
              Case-insensitive tag matching
            </Form.Label>
            <Form.Check
              type="switch"
              id="omnibar-settings-case-insensitive"
              checked={draft.tagsCaseInsensitive}
              onChange={(e) => setDraft({ ...draft, tagsCaseInsensitive: e.target.checked })}
            />
          </SettingsRow>
          <SettingsRow>
            <Form.Label htmlFor="omnibar-settings-limit" className="m-0">
              Result limit
            </Form.Label>
            <Form.Control
              type="number"
              id="omnibar-settings-limit"
              min={1}
              style={{ width: '90px' }}
              value={draft.limit}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value, 10);
                if (Number.isInteger(next) && next > 0) {
                  setDraft({ ...draft, limit: next });
                }
              }}
            />
          </SettingsRow>
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
        </SettingsPopover>
      </Overlay>
    </>
  );
};

export default OmnibarSettingsButton;
