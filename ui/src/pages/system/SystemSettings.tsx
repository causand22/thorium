import { Table } from 'react-bootstrap';
import AlertBanner from '@components/shared/alerts/AlertBanner';
import styled from 'styled-components';

// project imports
import Page from '@components/pages/Page';
import Subtitle from '@components/shared/titles/Subtitle';
import Title from '@components/shared/titles/Title';
import { getSystemSettings } from '@thorpi/system';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@thorpi/queryKeys';

const Settings = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;
  padding-top: 10px;
`;

const SystemSettings = () => {
  const { data: systemSettings, error } = useQuery({
    queryKey: queryKeys.system.settings,
    queryFn: getSystemSettings,
  });

  return (
    <Page title="Settings · Thorium" className="settings">
      <Settings>
        {error && <AlertBanner>{error.message}</AlertBanner>}
        <Title>System Settings</Title>
        <Table striped bordered hover>
          <tbody>
            {systemSettings &&
              Object.keys(systemSettings).map((setting) => (
                <tr key={setting}>
                  <td>
                    <center>
                      <Subtitle>{setting}</Subtitle>
                    </center>
                  </td>
                  <td>
                    <center>
                      <Subtitle>{systemSettings[setting].toString()}</Subtitle>
                    </center>
                  </td>
                </tr>
              ))}
          </tbody>
        </Table>
      </Settings>
    </Page>
  );
};

export default SystemSettings;
