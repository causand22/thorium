// project imports
import { getBrowsingPathByEntity } from '@components/entities/browsing/EntityBrowsingRoutes';
import { Entities } from '@models/entities';
import { Tags, TagUpperKeyEnum, TagValueEnum } from '@models/tags';
import { DangerTagKeys, FormattedFileInfoTagKeys, MitreTagKeys } from './tag_groups';

// spec: ./tags.spec.md

/**
 * Build a browse-page URL for a resource pre-filtered by a single tag.
 *
 * The `tags[<key>]=<value>` param format (URL-encoded via `URLSearchParams`) is what the omnibar browse
 * filters decode (`omnibar/urlState.ts` `paramsToClauses`), so the produced link round-trips into a tag
 * clause on the destination browse page. Works for any resource with a browse route (file, repo, and every
 * entity kind), including multi-segment paths like Windows processes (`/windows/processes`).
 *
 * @param resource - The resource kind whose browse page to link to.
 * @param tagKey - The tag key to filter on.
 * @param value - The tag value to filter by.
 * @returns The browse URL, or `undefined` if the resource has no browse route.
 */
export function buildTagBrowseHref(resource: Entities, tagKey: string, value: string): string | undefined {
  const base = getBrowsingPathByEntity(resource);
  if (!base) return undefined;
  const params = new URLSearchParams();
  params.append(`tags[${tagKey}]`, value);
  return `${base}?${params.toString()}`;
}

// filter tags to only include specific tags
export const filterIncludedTags = (tags: Tags, includeList: string[]): Tags => {
  const upperIncludeList = includeList.map((tag) => {
    return tag.toUpperCase();
  });
  if (tags) {
    return Object.fromEntries(Object.entries(tags).filter(([k]) => upperIncludeList.includes(k.toUpperCase())));
  }
  return {};
};

// return tags without excluded values
export const filterExcludedTags = (tags: Tags, excludeList: string[]): Tags => {
  const upperExcludedList = excludeList.map((tag) => {
    return tag.toUpperCase();
  });
  return Object.fromEntries(Object.entries(tags).filter(([k]) => !upperExcludedList.includes(k.toUpperCase())));
};

/** Tags partitioned by significance for consistent grouping across the summary and browser surfaces. */
export interface TagBuckets {
  danger: Tags;
  attack: Tags;
  mbc: Tags;
  fileInfo: Tags;
  general: Tags;
}

/**
 * Partition tags into the significance buckets used everywhere node tags are rendered (danger, ATT&CK, MBC,
 * file-info, general). The `general` bucket excludes the specialized keys plus always-hidden provenance keys
 * (RESULTS/PARENT/SUBMITTER), matching the display grouping. Shared by the summary tag renderer and the
 * browser's layer-header aggregates so both agree on what counts as "danger"/"ATT&CK"/etc.
 *
 * @param tags - The nested tags to partition.
 * @returns The five tag buckets.
 */
export function bucketTags(tags: Tags): TagBuckets {
  const excludeGeneral = [...FormattedFileInfoTagKeys, 'RESULTS', 'ATT&CK', 'MBC', 'PARENT', 'SUBMITTER', ...DangerTagKeys];
  return {
    danger: filterIncludedTags(tags, DangerTagKeys),
    attack: filterIncludedTags(tags, ['ATT&CK']),
    mbc: filterIncludedTags(tags, ['MBC']),
    fileInfo: filterIncludedTags(tags, FormattedFileInfoTagKeys),
    general: filterExcludedTags(tags, excludeGeneral),
  };
}

/** The tag groups a condensed file row renders, after hidden keys are removed. */
export interface FileTagGroups extends TagBuckets {
  results: Tags;
}

/**
 * Partition a file's tags into the groups a condensed file row renders, dropping `hiddenKeys` from every
 * group (danger, ATT&CK, MBC, file-info, results and general alike) so any tag key can be hidden.
 *
 * @param tags - The file's nested tags.
 * @param hiddenKeys - Tag keys to hide, matched case-insensitively.
 * @returns The visible tags per group.
 */
export function visibleFileTagGroups(tags: Tags, hiddenKeys: string[]): FileTagGroups {
  // unlike bucketTags, the general group only drops provenance keys (Parent/submitter) when they are hidden,
  // so un-hiding them in settings shows them
  const visible = filterExcludedTags(tags, hiddenKeys);
  const excludeGeneral = [...FormattedFileInfoTagKeys, ...MitreTagKeys, ...DangerTagKeys, 'Results'];
  return {
    danger: filterIncludedTags(visible, DangerTagKeys),
    attack: filterIncludedTags(visible, ['ATT&CK']),
    mbc: filterIncludedTags(visible, ['MBC']),
    fileInfo: filterIncludedTags(visible, FormattedFileInfoTagKeys),
    general: filterExcludedTags(visible, excludeGeneral),
    results: filterIncludedTags(visible, ['Results']),
  };
}

/** Total number of key/value pairs in a tag set (used for layer-header aggregate counts). */
export function countTagValues(tags: Tags): number {
  return Object.values(tags).reduce((sum, values) => sum + Object.keys(values ?? {}).length, 0);
}

export function getTagColorClass(key: string, value: string): string {
  const upperKey = key.toUpperCase() as TagUpperKeyEnum;
  if (upperKey == TagUpperKeyEnum.TLP) {
    switch (value.toUpperCase() as TagValueEnum) {
      case TagValueEnum.RED:
        return 'tlp-red-btn';
      case TagValueEnum.AMBER:
        return 'tlp-amber-btn';
      case TagValueEnum.AMBER_STRICT:
        return 'tlp-amber-btn';
      case TagValueEnum.GREEN:
        return 'tlp-green-btn';
      case TagValueEnum.WHITE:
        return 'tlp-clear-btn';
      case TagValueEnum.CLEAR:
        return 'tlp-clear-btn';
    }
  } else if (upperKey == TagUpperKeyEnum.RESULTS) {
    return 'general-tag';
  } else if (upperKey == TagUpperKeyEnum.ATTACK) {
    return 'attack-tag';
  } else if (upperKey == TagUpperKeyEnum.MBC) {
    return 'mbc-tag';
  } else if (FormattedFileInfoTagKeys.includes(upperKey)) {
    return 'info-tag';
  } else if (DangerTagKeys.includes(upperKey)) {
    return 'danger-tag';
  }
  return 'other-tag';
}

export function getTagBadgeText(key: string, value: string, condensed: boolean): string {
  const upperTag = key.toUpperCase() as TagUpperKeyEnum;
  switch (upperTag) {
    case TagUpperKeyEnum.TLP:
      if (!condensed) return value.toUpperCase();
      return `TLP: ${value.toUpperCase()}`;
    case TagUpperKeyEnum.ATTACK:
    case TagUpperKeyEnum.MBC:
      return `${value}`;
    case TagUpperKeyEnum.RESULTS:
    default:
      return `${key}: ${value}`;
  }
}
