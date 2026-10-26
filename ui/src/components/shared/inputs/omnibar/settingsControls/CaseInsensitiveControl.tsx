import { Form } from 'react-bootstrap';
import { SettingsRow } from './styles';
import { SettingControlProps } from './types';

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

export default CaseInsensitiveControl;
