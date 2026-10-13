import { useCallback, useState } from 'react';
import { Accordion, Button, Badge, Form, Modal } from 'react-bootstrap';
import AlertBanner from '@components/shared/alerts/AlertBanner';

// project imports
import Page from '@components/pages/Page';
import Title from '@components/shared/titles/Title';
import GroupMemberCount from '@components/pages/groups/GroupMemberCount';
import GroupRoleBadge from '@components/pages/groups/GroupRoleBadge';
import NoResultsBanner from '@components/shared/alerts/NoResultsBanner';
import LoadingSpinner from '@components/shared/fallback/LoadingSpinner';
import { OverlayTipRight, OverlayTipLeft } from '@components/shared/overlay/tips';
import { OmnibarGroups } from '@components/shared/inputs/omnibar/Bars';
import { Clause } from '@components/shared/inputs/omnibar/ClauseTypes';
import { defaultTimeSelection } from '@components/shared/inputs/omnibar/timepicker/utils';
import { useOmnibarUrlState } from '@components/shared/inputs/omnibar/useOmnibarUrlState';
import { getGroupsFromClauses, getStringFieldListFromClauses } from '@components/shared/inputs/omnibar/utils';
import { getAllGroupUsers, groupListToRecord, hasOverlap } from '@utilities/groups';
import { useAuth } from '@utilities/auth';
import { listUsersSimple } from '@thorpi/users';
import { createGroup, getGroup, listGroupDetails } from '@thorpi/groups';
import { type Group } from '@models/groups';
import GroupInfo from './GroupInfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@thorpi/queryKeys';

const filterGroups = (groups: Record<string, Group>, clauses: Clause[]): Record<string, Group> => {
  const clauseGroups = getGroupsFromClauses(clauses);
  const clauseUsers = getStringFieldListFromClauses(clauses, 'Users');
  const clauseOwners = getStringFieldListFromClauses(clauses, 'Owners');
  const clauseManagers = getStringFieldListFromClauses(clauses, 'Managers');

  const e = Object.entries(groups).filter(([name, obj]) => {
    const users = getAllGroupUsers(obj.users);
    const owners = getAllGroupUsers(obj.owners);
    const managers = getAllGroupUsers(obj.managers);

    const groupTest = clauseGroups.length > 0 ? clauseGroups.includes(name) : true;
    const userTest = clauseUsers.length > 0 ? hasOverlap(users, clauseUsers) : true;
    const ownerTest = clauseOwners.length > 0 ? hasOverlap(owners, clauseOwners) : true;
    const managerTest = clauseManagers.length > 0 ? hasOverlap(managers, clauseManagers) : true;

    return groupTest && userTest && ownerTest && managerTest;
  });
  return Object.fromEntries(e);
};

interface CreateGroupProps {
  onCreated: () => Promise<void>;
}

const CreateGroup = ({ onCreated }: CreateGroupProps) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const { checkCookie } = useAuth();

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setCreateError('');
  };
  const handleShowCreateModal = () => setShowCreateModal(true);

  const onClickSubmitModal = async () => {
    if (newGroupName != '') {
      const groupInfo = {
        name: newGroupName,
        description: newGroupDescription,
      };
      if (await createGroup(groupInfo, setCreateError)) {
        await onCreated();
        void checkCookie();
        handleCloseCreateModal();
      }
    } else {
      setCreateError('you must specify a group name');
    }
  };

  return (
    <div>
      <OverlayTipLeft tip={'Create a new Group.'}>
        <Button className="ok-btn" onClick={handleShowCreateModal}>
          +
        </Button>
      </OverlayTipLeft>
      <Modal show={showCreateModal} onHide={handleCloseCreateModal} keyboard={false}>
        <Modal.Header closeButton>
          <Modal.Title>Create New Group</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>
              <b>Name</b>
            </Form.Label>
            <Form.Control type="text" value={newGroupName} placeholder="name" onChange={(e) => setNewGroupName(String(e.target.value))} />
            <Form.Text className="text-muted">Group names can contain lower case letters, numbers, and dashes.</Form.Text>
          </Form.Group>
          <Form.Group>
            <Form.Label>
              <b>Description</b>
            </Form.Label>
            <Form.Control
              as="textarea"
              value={newGroupDescription}
              placeholder="describe this new group"
              onChange={(e) => setNewGroupDescription(String(e.target.value))}
            />
            {createError != '' && <AlertBanner>{createError}</AlertBanner>}
            <Form.Text className="text-muted">
              {`Group descriptions should explain a group's indended membership and owned
                resources.`}
            </Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="d-flex justify-content-center">
          <Button className="ok-btn m-1" onClick={() => void onClickSubmitModal()}>
            Create
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

const Groups = () => {
  const { clauses, setClauses } = useOmnibarUrlState({ clauses: [], time: defaultTimeSelection() });
  const { userInfo } = useAuth();

  const queryClient = useQueryClient();

  const { data: groupDetails = [], isLoading: groupsLoading } = useQuery({
    queryKey: queryKeys.groups.details,
    queryFn: () => listGroupDetails(),
  });

  const groups = groupListToRecord(groupDetails);

  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: queryKeys.users.simple,
    queryFn: async () => (await listUsersSimple(null, 1000)).sort(),
  });

  const filteredGroups = filterGroups(groups, clauses);
  const loading = groupsLoading || usersLoading;

  const refreshGroups = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.groups.details });
  }, [queryClient]);

  // Refetch a single group and replace just that entry in place. Used after an edit so only the
  // changed group's content rerenders, without reloading the whole list or toggling the page
  // spinner (which keeps every other open accordion untouched).
  const refreshSingleGroup = async (name: string) => {
    const fresh = await getGroup(name, console.log);
    if (!fresh) return;

    queryClient.setQueryData<Group[]>(['groups', 'details'], (prev = []) => prev.map((group) => (group.name === name ? fresh : group)));
  };

  return (
    <Page title="Groups · Thorium">
      <div className="d-flex justify-content-between">
        <div>
          <OverlayTipRight tip={`You have access to view ${Object.keys(groups).length} group(s).`}>
            <h2>
              <Badge bg="" className="count-badge">
                {Object.keys(groups).length}
              </Badge>
            </h2>
          </OverlayTipRight>
        </div>
        <Title>Groups</Title>
        <div>
          <h2>
            <CreateGroup onCreated={refreshGroups} />
          </h2>
        </div>
      </div>
      <div className="d-flex justify-content-center">
        <OmnibarGroups clauses={clauses} setClauses={setClauses} groups={groups} />
      </div>
      <LoadingSpinner loading={loading}></LoadingSpinner>
      {!loading && Object.keys(filteredGroups).length === 0 && <NoResultsBanner type="Groups" />}
      <Accordion alwaysOpen>
        {filteredGroups &&
          Object.keys(filteredGroups)
            .sort()
            .map((group) => (
              <Accordion.Item key={group} eventKey={group}>
                <Accordion.Header>
                  <div className="accordion-text">
                    <div className="accordion-item-name">
                      <div className="text">{group}</div>
                    </div>
                    <div className="accordion-item-ownership">
                      <small>
                        <i>
                          <GroupMemberCount group={filteredGroups[group]} />
                        </i>
                      </small>
                    </div>
                  </div>
                  <div className="accordion-group-role">{userInfo && <GroupRoleBadge group={filteredGroups[group]} user={userInfo} />}</div>
                </Accordion.Header>
                <Accordion.Body>
                  <GroupInfo
                    group={filteredGroups[group]}
                    allUsers={allUsers}
                    refreshGroups={refreshGroups}
                    refreshSingleGroup={refreshSingleGroup}
                  />
                </Accordion.Body>
              </Accordion.Item>
            ))}
      </Accordion>
    </Page>
  );
};

export default Groups;
