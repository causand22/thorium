// spec: ./EntityBrowser.spec.md

// project imports
import {
  addDepthOptions,
  addEntityLayerOptions,
  addGroupOptions,
  addTagOptions,
  addTextOptions,
  emptyRegistry,
  OmnibarRegistry,
} from '@components/shared/inputs/omnibar/clauses/options';
import { TagOptions } from '@models/tags';
import { NodeType } from '@models/trees';

/** Upper bound for the traversal-depth omnibar option. */
export const MAX_DEPTH = 10;

/**
 * Build the entity browser's omnibar key vocabulary: text (name), tags, groups, the
 * `Show`/`Hide`/`Exclude`/`Include` entity-layer verbs, and a traversal `depth`. Colocated here (rather than
 * inline in {@link BrowserToolbar}) so a standalone dashboard omnibar strip can offer the identical lexicon.
 *
 * Tags are not negatable here: the underlying list routes are Scylla-backed and can only intersect.
 *
 * @param presentKinds - Entity types present in the pulled graph (drive the layer-verb value lists).
 * @param tagOptions - Tag key→values collected from the graph (drive the tag option values).
 * @param groupOptions - Groups present on any node (drive the group option values).
 * @returns An {@link OmnibarRegistry} covering text/tag/group/Show/Hide/Exclude/Include/depth.
 */
export function buildBrowserOmnibarOptions(presentKinds: NodeType[], tagOptions: TagOptions, groupOptions: string[]): OmnibarRegistry {
  let registry = emptyRegistry();
  registry = addTextOptions(registry);
  registry = addTagOptions(registry, tagOptions);
  registry = addGroupOptions(registry, groupOptions);
  registry = addEntityLayerOptions(registry, presentKinds);
  registry = addDepthOptions(registry, MAX_DEPTH);
  return registry;
}
