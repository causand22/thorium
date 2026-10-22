import { useMemo, useState } from 'react';
import { Form } from 'react-bootstrap';
import { styled } from 'styled-components';
import { SettingControlProps } from './types';

// spec: ../SPEC.md

const SectionLabel = styled.div`
  margin-bottom: 6px;
`;

const TagList = styled.div`
  max-height: 180px;
  overflow-y: auto;
  margin-top: 6px;
`;

/** Add `key` to a sorted key list, or remove it if already present. */
export function toggleKey(keys: string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((entry) => entry !== key) : [...keys, key].sort();
}

const HiddenTagsControl: React.FC<SettingControlProps> = ({ draft, update, tagKeyOptions }) => {
  const [tagFilter, setTagFilter] = useState('');

  // always offer the already-hidden keys, so one can be un-hidden even when it is absent from the
  // (sampled, cache-backed) option list
  const tagKeys = useMemo(() => {
    const all = Array.from(new Set([...draft.hiddenTags, ...tagKeyOptions])).sort();
    const needle = tagFilter.trim().toLowerCase();
    return needle === '' ? all : all.filter((key) => key.toLowerCase().includes(needle));
  }, [draft.hiddenTags, tagKeyOptions, tagFilter]);

  return (
    <div>
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
            onChange={() => update({ hiddenTags: toggleKey(draft.hiddenTags, key) })}
          />
        ))}
      </TagList>
    </div>
  );
};

export default HiddenTagsControl;
