import { useMemo } from 'react';

// project imports
import { useEntityBrowser } from './EntityBrowserContext';
import { ToolbarBar, ToolbarControls } from './EntityBrowser.styled';
import FlaggedOnlyToggle from './controls/FlaggedOnlyToggle';
import HiddenNodesControl from './controls/HiddenNodesControl';
import { buildBrowserOmnibarOptions } from './omnibarOptions';
import ClauseEditor from '@components/shared/inputs/omnibar/clauses/ClauseEditor';
import EntitySortControls from './controls/EntitySortControls';
import GroupByType from './controls/GroupByType';
import MinimumConfidence from './controls/MinimumConfidence';

/**
 * Omnibar-driven filter bar: text (name), tags, groups, the `Show`/`Hide`/`Exclude`/`Include` entity-layer
 * lexicon, and a traversal `depth`. Tag/group options come from the pulled graph (no extra request). The
 * standalone {@link FlaggedOnlyToggle} and {@link HiddenNodesControl} (shared with the dashboard strip) sit
 * beside the omnibar. Sort/group controls live in the browser's own header (`BrowserHeader`), not here.
 */
const BrowserToolbar = ({ showOmnibar }: { showOmnibar: boolean }) => {
  const { clauses, setClauses, presentKinds, tagOptions, groupOptions } = useEntityBrowser();

  const registry = useMemo(
    () => buildBrowserOmnibarOptions(presentKinds, tagOptions, groupOptions),
    [tagOptions, groupOptions, presentKinds],
  );

  return (
    <ToolbarBar>
      {showOmnibar && <ClauseEditor clauses={clauses} setClauses={setClauses} registry={registry} placeholder="Filter entities…" />}
      <ToolbarControls>
        <HiddenNodesControl />
        <FlaggedOnlyToggle />
        <GroupByType />
        <MinimumConfidence />
        <EntitySortControls />
      </ToolbarControls>
    </ToolbarBar>
  );
};

export default BrowserToolbar;
