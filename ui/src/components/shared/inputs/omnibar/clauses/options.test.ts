import { describe, it, expect } from 'vitest';

// project imports
import { ClauseCondition } from './ClauseTypes';
import {
  addDepthOptions,
  addEntityLayerOptions,
  addGroupOptions,
  addTagOptions,
  addTextOptions,
  emptyRegistry,
  ENTITY_LAYER_KEYS,
} from './options';

const keyNames = (keys: { key: string }[]) => keys.map((entry) => entry.key).sort();

describe('addEntityLayerOptions', () => {
  it('returns the registry unchanged when there are no kinds', () => {
    const registry = emptyRegistry();
    expect(addEntityLayerOptions(registry, [])).toBe(registry);
  });

  it('adds all four layer keys as or-capable closed enumerations', () => {
    const kinds = ['Folder', 'Device'];
    const next = addEntityLayerOptions(emptyRegistry(), kinds);
    expect(keyNames(next.fields)).toEqual([...ENTITY_LAYER_KEYS].sort());
    for (const entry of next.fields) {
      expect(entry.values).toEqual(kinds);
      expect(entry.conditions).toEqual([ClauseCondition.Is, ClauseCondition.IsOneOf]);
      expect(entry.creatable).toBe(false);
      // these are evaluated client-side against the pulled graph, so OR is executable
      expect(entry.orCapable).toBe(true);
    }
  });

  it('does not mutate the input registry', () => {
    const registry = emptyRegistry();
    addEntityLayerOptions(registry, ['Folder']);
    expect(registry.fields).toEqual([]);
  });
});

describe('addDepthOptions', () => {
  it('adds a creatable depth key of "1".."maxDepth" (default 10)', () => {
    const [depth] = addDepthOptions(emptyRegistry()).fields;
    expect(depth.key).toBe('depth');
    expect(depth.values).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(depth.conditions).toEqual([ClauseCondition.Is]);
    expect(depth.creatable).toBe(true);
    expect(depth.orCapable).toBe(false);
  });

  it('honors a custom maxDepth', () => {
    expect(addDepthOptions(emptyRegistry(), 3).fields[0].values).toEqual(['1', '2', '3']);
  });

  it('does not mutate the input registry', () => {
    const registry = emptyRegistry();
    addDepthOptions(registry);
    expect(registry.fields).toEqual([]);
  });
});

describe('addGroupOptions', () => {
  it('is or-capable and closed, because groups are OR-scoped by every backend', () => {
    const [group] = addGroupOptions(emptyRegistry(), ['a', 'b']).fields;
    expect(group.orCapable).toBe(true);
    expect(group.creatable).toBe(false);
    expect(group.conditions).toEqual([ClauseCondition.Is, ClauseCondition.IsOneOf]);
  });
});

describe('addTagOptions', () => {
  const tagOpts = { FileType: ['PE32', 'ELF'] };

  it('adds tag keys as open, single-valued keys', () => {
    const [tag] = addTagOptions(emptyRegistry(), tagOpts).tags;
    expect(tag.key).toBe('FileType');
    expect(tag.values).toEqual(['PE32', 'ELF']);
    expect(tag.creatable).toBe(true);
    // the Scylla census intersects every key/value pair, so two values for one key mean "has both"
    expect(tag.orCapable).toBe(false);
    expect(tag.conditions).toEqual([ClauseCondition.Is]);
  });

  it('offers negation only where the backend can run it', () => {
    const negatable = addTagOptions(emptyRegistry(), tagOpts, { negatable: true });
    expect(negatable.tags[0].conditions).toEqual([ClauseCondition.Is, ClauseCondition.IsNot]);
    expect(negatable.tagTemplate?.conditions).toEqual([ClauseCondition.Is, ClauseCondition.IsNot]);
  });

  it('records a template so user-invented tag keys resolve', () => {
    expect(addTagOptions(emptyRegistry(), tagOpts).tagTemplate).toBeDefined();
  });

  it('carries per-key totals for dropdown ranking', () => {
    const withTotals = addTagOptions(emptyRegistry(), tagOpts, { keyTotals: { FileType: 42 } });
    expect(withTotals.tags[0].total).toBe(42);
  });
});

describe('addTextOptions', () => {
  it('records free-text capability without adding a typeable key', () => {
    const registry = addTextOptions(emptyRegistry());
    expect(registry.text).toBeDefined();
    // `text` is not reserved: bare words are the only way to make a text clause
    expect(registry.fields).toEqual([]);
  });
});
