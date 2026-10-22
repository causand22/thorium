import { useAuth } from '@utilities/auth';
import Omnibar from './Omnibar';
import { useTagCount, useTagKeyTotals } from '@utilities/tags';
import { Clause, ClauseCondition } from './clauses/ClauseTypes';
import { HashJump } from './clauses/hash';
import { addGroupOptions, addIndexOptions, addStringOption, addTagOptions, addTextOptions, emptyRegistry } from './clauses/options';
import { OmnibarContext } from './settingsRegistry';
import { OmnibarSettings } from './urlState';
import { TimeSelection } from './timepicker/utils';
import { Group, GroupUserCategory } from '@models/groups';
import { getAllGroupUsers } from '@utilities/groups';
import { Pipeline } from '@models/pipelines';
import { Image } from '@models/images';
import { RoleKey, UserInfo } from '@models/users';

// spec: ./SPEC.md

/**
 * Conditions available to a key the page filters itself, in the browser. These pages hold the whole
 * list in memory, so unlike the Scylla-backed bars they can negate and substring-match freely.
 *
 * Order matters: the first condition is the key's default operator in the dropdown. Name-ish fields
 * lead with `Includes` so picking one offers partial matching, which is the common intent there.
 */
const CLIENT_SIDE_TEXT = [ClauseCondition.Includes, ClauseCondition.Is, ClauseCondition.IsNot];
const CLIENT_SIDE_LIST = [ClauseCondition.Is, ClauseCondition.IsOneOf, ClauseCondition.IsNot];

type OmnibarTimeContainerProps = {
  clauses: Clause[];
  setClauses: (next: Clause[]) => void;
  time: TimeSelection;
  setTime: (next: TimeSelection) => void;
  settings: OmnibarSettings;
  setSettings: (next: OmnibarSettings) => void;
  /** Opt in to jumping straight to a file when Enter is pressed on a bare sha256. */
  hashJump?: HashJump;
};

/**
 * The main search bar, backed by Elasticsearch (`/api/search/`).
 *
 * The only bar where tags can be negated: the query reaches Elastic as a Lucene `query_string`, which
 * supports `NOT`, whereas the Scylla list routes can only intersect census buckets.
 */
export const OmnibarMainSearch: React.FC<OmnibarTimeContainerProps> = ({
  clauses,
  setClauses,
  time,
  setTime,
  settings,
  setSettings,
  hashJump,
}) => {
  const { userInfo } = useAuth();
  const userInfoGroups = userInfo !== null ? userInfo.groups : [];
  const tagOptions = useTagCount();
  const keyTotals = useTagKeyTotals();

  let registry = emptyRegistry();
  registry = addGroupOptions(registry, userInfoGroups);
  registry = addIndexOptions(registry);
  registry = addTagOptions(registry, tagOptions, { negatable: true, keyTotals });
  registry = addTextOptions(registry);

  return (
    <Omnibar
      clauses={clauses}
      registry={registry}
      setClauses={setClauses}
      placeholder="Search..."
      time={time}
      setTime={setTime}
      settings={settings}
      setSettings={setSettings}
      settingsContext="search"
      tagKeyOptions={Object.keys(tagOptions)}
      hashJump={hashJump}
    />
  );
};

/**
 * The browse/filter bar for files, repos and entities, backed by the Scylla list routes.
 *
 * Tags here can neither be negated nor OR'd — the census intersects one bucket stream per key/value
 * pair and requires every one to match.
 */
export const OmnibarStandardTimeFilters: React.FC<OmnibarTimeContainerProps & { context: Exclude<OmnibarContext, 'search'> }> = ({
  context,
  clauses,
  setClauses,
  time,
  setTime,
  settings,
  setSettings,
  hashJump,
}) => {
  const { userInfo } = useAuth();
  const userInfoGroups = userInfo !== null ? userInfo.groups : [];
  const tagOptions = useTagCount();
  const keyTotals = useTagKeyTotals();

  let registry = emptyRegistry();
  registry = addGroupOptions(registry, userInfoGroups);
  registry = addTagOptions(registry, tagOptions, { keyTotals });

  return (
    <Omnibar
      clauses={clauses}
      registry={registry}
      setClauses={setClauses}
      placeholder="Enter a filter..."
      time={time}
      setTime={setTime}
      settings={settings}
      setSettings={setSettings}
      settingsContext={context}
      tagKeyOptions={Object.keys(tagOptions)}
      hashJump={hashJump}
    />
  );
};

interface OmnibarGroupProps {
  clauses: Clause[];
  setClauses: (next: Clause[]) => void;
  groups: Record<string, Group>;
}

function getGroupMemberType(groups: Record<string, Group>, category: GroupUserCategory): string[] {
  const allStrings = Object.values(groups).map((g) => getAllGroupUsers(g[category]));
  return Array.from(new Set(allStrings.flat())).sort();
}

export function OmnibarGroups({ clauses, setClauses, groups }: OmnibarGroupProps) {
  const { userInfo } = useAuth();
  const userInfoGroups = userInfo !== null ? userInfo.groups : [];

  let registry = emptyRegistry();
  registry = addGroupOptions(registry, userInfoGroups);
  registry = addStringOption(registry, 'Owners', getGroupMemberType(groups, 'owners'), CLIENT_SIDE_LIST, { orCapable: true });
  registry = addStringOption(registry, 'Users', getGroupMemberType(groups, 'users'), CLIENT_SIDE_LIST, { orCapable: true });
  registry = addStringOption(registry, 'Managers', getGroupMemberType(groups, 'managers'), CLIENT_SIDE_LIST, { orCapable: true });

  return <Omnibar clauses={clauses} registry={registry} setClauses={setClauses} placeholder="Enter a filter..." />;
}

interface OmnibarPipelineProps {
  clauses: Clause[];
  setClauses: (next: Clause[]) => void;
  pipelines: Pipeline[];
}

function uniqueSort(list: string[]): string[] {
  return Array.from(new Set(list)).sort();
}

export function OmnibarPipelines({ clauses, setClauses, pipelines }: OmnibarPipelineProps) {
  const { userInfo } = useAuth();
  const userInfoGroups = userInfo !== null ? userInfo.groups : [];

  let registry = emptyRegistry();
  registry = addGroupOptions(registry, userInfoGroups);
  registry = addStringOption(
    registry,
    'name',
    pipelines.map((p) => p.name),
    CLIENT_SIDE_TEXT,
  );
  registry = addStringOption(registry, 'creator', uniqueSort(pipelines.map((pipeline) => pipeline.creator)), CLIENT_SIDE_TEXT);

  return <Omnibar clauses={clauses} registry={registry} setClauses={setClauses} placeholder="Enter a filter..." />;
}

interface OmnibarUserProps {
  clauses: Clause[];
  setClauses: (next: Clause[]) => void;
  users: UserInfo[];
}

export function OmnibarUsers({ clauses, setClauses, users }: OmnibarUserProps) {
  let registry = emptyRegistry();
  // suggest every group present across the listed users (admins browse users in all groups)
  registry = addGroupOptions(registry, uniqueSort(users.flatMap((user) => user.groups)));
  registry = addStringOption(registry, 'username', uniqueSort(users.map((user) => user.username)), CLIENT_SIDE_TEXT);
  registry = addStringOption(registry, 'email', uniqueSort(users.map((user) => user.email)), CLIENT_SIDE_TEXT);
  // role values are the fixed set of Thorium roles (Admin/Analyst/Developer/User), so a value outside
  // the list is a typo rather than a filter that might match
  registry = addStringOption(registry, 'role', Object.values(RoleKey), CLIENT_SIDE_LIST, {
    category: 'role',
    orCapable: true,
    creatable: false,
  });
  // boolean fields: pick true or false
  registry = addStringOption(registry, 'verified', ['true', 'false'], [ClauseCondition.Is], { creatable: false });
  registry = addStringOption(registry, 'local', ['true', 'false'], [ClauseCondition.Is], { creatable: false });

  return <Omnibar clauses={clauses} registry={registry} setClauses={setClauses} placeholder="Enter a filter..." />;
}

interface OmnibarImageProps {
  clauses: Clause[];
  setClauses: (next: Clause[]) => void;
  images: Image[];
}

export function OmnibarImages({ clauses, setClauses, images }: OmnibarImageProps) {
  const { userInfo } = useAuth();
  const userInfoGroups = userInfo !== null ? userInfo.groups : [];

  let registry = emptyRegistry();
  registry = addGroupOptions(registry, userInfoGroups);
  registry = addTextOptions(registry);
  registry = addStringOption(registry, 'creator', uniqueSort(images.map((image) => image.creator)), CLIENT_SIDE_TEXT);
  registry = addStringOption(registry, 'name', uniqueSort(images.map((image) => image.name)), CLIENT_SIDE_TEXT);

  return <Omnibar clauses={clauses} registry={registry} setClauses={setClauses} placeholder="Enter a filter..." />;
}
