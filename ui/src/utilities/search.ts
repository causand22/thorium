import { Clause } from '@components/shared/inputs/omnibar/clauses/ClauseTypes';
import { TimeSelection, TimeSelectionToStrings } from '@components/shared/inputs/omnibar/timepicker/utils';
import { getGroupsFromClauses, getTagsFromClauses } from '@components/shared/inputs/omnibar/clauses/utils';
import { OmnibarSettings } from '@components/shared/inputs/omnibar/urlState';
import { Filters } from '@models/search';

export function OmniClauseAndTimeToFilter(clauses: Clause[], time: TimeSelection, settings: OmnibarSettings): Filters {
  const groups = getGroupsFromClauses(clauses);
  const tags = getTagsFromClauses(clauses);

  const [end, start] = TimeSelectionToStrings(time);
  return {
    limit: settings.limit,
    groups: groups,
    tags: tags,
    start: start,
    end: end,
    // hidden tags are a display filter held in settings, not a clause (SPEC §10)
    hideTags: settings.hiddenTags,
    tags_case_insensitive: settings.tagsCaseInsensitive,
  };
}
