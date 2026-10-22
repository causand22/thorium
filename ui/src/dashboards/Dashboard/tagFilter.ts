// project imports
import { ClauseCondition, ClauseIsMulti, type Clause } from '@components/shared/inputs/omnibar/clauses/ClauseTypes';

// spec: ./SPEC.md

/**
 * The omnibar clause `category` for a tag filter.
 *
 * Tag clauses use `category: 'tag'` with `field` set to the tag key, and hold exactly one value each.
 */
const TAG_CATEGORY = 'tag';

/**
 * The omnibar clause `category` that carries the graph traversal depth.
 *
 * A filter reset keeps depth clauses so raising/lowering the crawl depth survives clearing filters.
 */
const DEPTH_CATEGORY = 'depth';

/**
 * Whether a clause is any tag clause targeting the given key, regardless of its condition.
 *
 * Matching ignores the exact condition so that a clause arriving from an older link (which may encode
 * several values as one `is one of`) is still recognised and normalised rather than duplicated.
 */
function isTagClauseForKey(clause: Clause, key: string): boolean {
  return clause.category === TAG_CATEGORY && clause.field === key;
}

/**
 * Toggle `value` for the tag `key`, emitting one single-valued clause per selected value.
 *
 * Each tag value is its own clause because that is what the backend computes: the Scylla census
 * intersects one bucket stream per key/value pair and requires every one to match, so two values for
 * one key mean "has both", not "either". Rendering them as one `is one of` chip previously implied an
 * OR the query never performed.
 *
 * The helper is round-trip-robust: it gathers the values from ALL tag clauses for `key` (including a
 * legacy multi-value clause from an older link), toggles the clicked value across that set, and
 * rebuilds the result as single-valued clauses at the position of the FIRST such clause. Toggling:
 *
 * - No clause for `key` yet → a fresh single-value clause is appended (order preserved).
 * - One or more clauses for `key` → they collapse to the toggled set at the first clause's position.
 * - The toggle empties the value set → every clause for `key` is removed.
 *
 * All non-matching clauses (and their order) are preserved.
 *
 * @param clauses - The current clause list.
 * @param key - The tag key (the clause's `field`).
 * @param value - The tag value to toggle for `key`.
 * @returns A new clause list with `value` toggled for `key`.
 */
export function toggleTagValue(clauses: Clause[], key: string, value: string): Clause[] {
  const tagClause = (tagValue: string): Clause => ({
    category: TAG_CATEGORY,
    field: key,
    condition: ClauseCondition.Is,
    value: { value: tagValue },
  });

  const firstMatchIndex = clauses.findIndex((clause) => isTagClauseForKey(clause, key));
  // no clause for this key yet: append a fresh single-value clause, preserving order
  if (firstMatchIndex === -1) {
    return [...clauses, tagClause(value)];
  }

  // gather the values from every tag clause for this key, deduping so a value carried by several
  // round-tripped clauses is counted once
  const values: string[] = [];
  for (const clause of clauses) {
    if (!isTagClauseForKey(clause, key)) continue;
    for (const clauseValue of ClauseIsMulti(clause) ? clause.value.values : [clause.value.value]) {
      if (!values.includes(clauseValue)) values.push(clauseValue);
    }
  }

  // toggle the clicked value across the merged set: remove it if present, otherwise add it
  const nextValues = values.includes(value) ? values.filter((existing) => existing !== value) : [...values, value];

  // rebuild at the first match's position as one clause per value, dropping later duplicates
  const result: Clause[] = [];
  clauses.forEach((clause, index) => {
    if (!isTagClauseForKey(clause, key)) {
      result.push(clause);
      return;
    }
    if (index === firstMatchIndex) {
      result.push(...nextValues.map(tagClause));
    }
  });
  return result;
}

/**
 * The selected tag values per key — exactly the set {@link toggleTagValue} would toggle against.
 *
 * Deliberately colocated with {@link toggleTagValue} and recognising a tag clause on the same terms
 * {@link isTagClauseForKey} does — category `tag`, any condition — because a chip's active state has
 * to mirror what clicking it will do. Keeping the two apart is what previously let this matching stay
 * on `is one of` after the toggle switched to emitting single-valued `is` clauses, which silently
 * blanked every active chip.
 *
 * Built once per clause change (O(clauses) total) rather than scanned per rendered chip, so lookups
 * against the returned map are O(1) while rendering.
 *
 * @param clauses - The current clause list.
 * @returns A map from tag key to the set of its selected values; keys with no selection are absent.
 */
export function activeTagValues(clauses: Clause[]): Map<string, Set<string>> {
  const active = new Map<string, Set<string>>();
  for (const clause of clauses) {
    if (clause.category !== TAG_CATEGORY) continue;
    let values = active.get(clause.field);
    if (values === undefined) {
      values = new Set<string>();
      active.set(clause.field, values);
    }
    for (const value of ClauseIsMulti(clause) ? clause.value.values : [clause.value.value]) {
      values.add(value);
    }
  }
  return active;
}

/**
 * Return only the clauses to keep when the user resets the dashboard filters.
 *
 * A reset clears the user's downselecting filters (tag filters, `Include` kind whitelists, free text,
 * etc.) but keeps the structural `depth` clause so the graph shape survives. Hidden tags are no longer
 * a clause — they live in omnibar settings — so a reset leaves them alone by construction. Clause order
 * among the kept clauses is preserved.
 *
 * @param clauses - The current clause list.
 * @returns The subset of `clauses` to retain after a reset.
 */
export function resetFilterClauses(clauses: Clause[]): Clause[] {
  return clauses.filter((clause) => clause.category === DEPTH_CATEGORY);
}
