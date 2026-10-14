/**
 * Building a bar's key vocabulary.
 *
 * Each page composes its own {@link OmnibarRegistry} from these builders, because the three backends
 * behind the omnibar have different capabilities: the Elastic search route can negate, the Scylla list
 * routes can only intersect, and the pages that filter an already-loaded list client-side can do
 * anything. That difference is expressed per key through `conditions` and `orCapable` — see SPEC §6.
 */

// project imports
import { TagOptions } from '@models/tags';
import { ClauseCondition } from './ClauseTypes';
import { OmnibarKey, OmnibarRegistry } from './parse';

// spec: ../SPEC.md

export type { OmnibarKey, OmnibarRegistry } from './parse';

/** The entity-layer action keys (a lexicon for controlling which entity types render/traverse). */
export const ENTITY_LAYER_KEYS = ['Show', 'Hide', 'Exclude', 'Include'] as const;

export function emptyRegistry(): OmnibarRegistry {
  return { fields: [], tags: [] };
}

/** Append a reserved field to a registry, returning a new registry. */
function withField(registry: OmnibarRegistry, key: OmnibarKey): OmnibarRegistry {
  return { ...registry, fields: [...registry.fields, key] };
}

type FieldSpec = {
  values?: string[];
  conditions?: ClauseCondition[];
  /** Whether comma-separated values are OR'd by whatever executes this bar's query. */
  orCapable?: boolean;
  /** Whether a value outside `values` is accepted. `false` marks a closed enumeration. */
  creatable?: boolean;
  category?: string;
  helpText?: string;
};

function field(key: string, spec: FieldSpec = {}): OmnibarKey {
  return {
    key,
    kind: 'field',
    category: spec.category ?? key,
    conditions: spec.conditions ?? [ClauseCondition.Is],
    orCapable: spec.orCapable ?? false,
    creatable: spec.creatable ?? true,
    values: spec.values ?? [],
    helpText: spec.helpText,
  };
}

/**
 * Add the `Show`/`Hide`/`Exclude`/`Include` entity-layer keys, each offering the given entity-type
 * values. Show=render+explore, Hide=pass-through, Exclude=prune, Include=whitelist. Evaluated
 * client-side against the pulled graph, so they can OR freely.
 */
export function addEntityLayerOptions(registry: OmnibarRegistry, kinds: string[]): OmnibarRegistry {
  if (kinds.length === 0) return registry;
  return ENTITY_LAYER_KEYS.reduce(
    (acc, key) =>
      withField(
        acc,
        field(key, {
          values: kinds,
          conditions: [ClauseCondition.Is, ClauseCondition.IsOneOf],
          orCapable: true,
          creatable: false,
          helpText: `${key} these entity types`,
        }),
      ),
    registry,
  );
}

/**
 * Add the traversal `depth` key (replaces the API `limit` field for the graph browser). Raising it
 * additively grows the shared graph, so it is single-valued.
 */
export function addDepthOptions(registry: OmnibarRegistry, maxDepth: number = 10): OmnibarRegistry {
  return withField(
    registry,
    field('depth', {
      values: Array.from({ length: maxDepth }, (_unused, idx) => String(idx + 1)),
      helpText: 'Traversal depth to search/filter',
    }),
  );
}

/**
 * Add the `group` key. Groups are OR'd by every backend — the Scylla routes treat the list as a
 * visibility scope and Elastic uses a `bool.should` — so this is one of only two or-capable keys.
 */
export function addGroupOptions(registry: OmnibarRegistry, groups: string[]): OmnibarRegistry {
  return withField(
    registry,
    field('group', {
      values: groups,
      conditions: [ClauseCondition.Is, ClauseCondition.IsOneOf],
      orCapable: true,
      creatable: false,
    }),
  );
}

/** Add the Elastic `index` key. Searching several indexes at once is a union, so it is or-capable. */
export function addIndexOptions(registry: OmnibarRegistry): OmnibarRegistry {
  return withField(
    registry,
    field('index', {
      values: ['SampleResults', 'RepoResults', 'SampleTags', 'RepoTags'],
      conditions: [ClauseCondition.Is, ClauseCondition.IsOneOf],
      orCapable: true,
      creatable: false,
    }),
  );
}

/**
 * Mark this bar as supporting free-text search. There is no typeable `text` key — bare words are the
 * only way to make a text clause — so this records the capability rather than adding a field.
 */
export function addTextOptions(registry: OmnibarRegistry): OmnibarRegistry {
  return { ...registry, text: field('text', { category: 'text', helpText: 'Search for this text' }) };
}

type TagSpec = {
  /** Whether tags can be negated here. Only true on Elastic-backed bars (SPEC §6). */
  negatable?: boolean;
  /** Per-key document totals, used to rank the dropdown's Tags section. */
  keyTotals?: Record<string, number>;
};

/**
 * Add every known tag key, plus the template used for tag keys the user invents.
 *
 * Tag keys are never or-capable: the Scylla census intersects one bucket stream per key/value pair and
 * requires every one to match, so `arch=a,b` would mean "has both" rather than "either".
 */
export function addTagOptions(registry: OmnibarRegistry, tagOpts: TagOptions, spec: TagSpec = {}): OmnibarRegistry {
  const conditions = spec.negatable ? [ClauseCondition.Is, ClauseCondition.IsNot] : [ClauseCondition.Is];
  const tags: OmnibarKey[] = Object.keys(tagOpts)
    .sort()
    .map((key) => ({
      key,
      kind: 'tag' as const,
      category: 'tag',
      conditions,
      orCapable: false,
      creatable: true,
      values: tagOpts[key],
      total: spec.keyTotals?.[key],
    }));

  return { ...registry, tags, tagTemplate: { category: 'tag', conditions, orCapable: false } };
}

type StringSpec = FieldSpec;

/**
 * Add a page-specific string key (`name`, `creator`, `username`, …). These pages filter an
 * already-loaded list in the browser, so any condition is executable; the value list is a sample of
 * what is loaded rather than an enumeration, so such keys are normally `creatable`.
 */
export function addStringOption(
  registry: OmnibarRegistry,
  name: string,
  values: string[],
  conditions: ClauseCondition[],
  spec: StringSpec = {},
): OmnibarRegistry {
  if (values.length === 0) return registry;
  return withField(registry, field(name, { creatable: true, ...spec, values, conditions }));
}
