import { useState } from 'react';
import { Form } from 'react-bootstrap';
import { clampLimit, defaultOmnibarSettings, MAX_LIMIT } from '../urlState';
import { SettingsRow } from './styles';
import { SettingControlProps } from './types';

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

export default LimitControl;
