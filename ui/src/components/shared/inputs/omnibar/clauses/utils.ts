/**
 * Turning committed clauses into backend requests.
 *
 * The dropdown lives in ./suggestions.ts and the grammar in ./parse.ts; this module is only the
 * clause → request-parameter direction.
 */

// project imports
import { Clause, ClauseCondition, ClauseIsMulti, GetValueString } from './ClauseTypes';
import { getTagColorClass } from '@components/tags';
import { ElasticIndex } from '@models/search';
import { RequestTags } from '@models/tags';

// spec: ../SPEC.md

/** Every value on a clause, regardless of its single/multi shape. */
function clauseValues(clause: Clause): string[] {
  return ClauseIsMulti(clause) ? clause.value.values : [clause.value.value];
}

/** The free-text clause, as built by `NewTextClause`. A tag keyed `text` is a tag, not free text. */
function isTextClause(clause: Clause): boolean {
  return clause.category === 'text' && clause.field === 'text';
}

/**
 * Whether `clause` is the reserved field `field`. Tag clauses are excluded: a tag key invented by the
 * user (`tag:name=x`) may share a name with a reserved field but must never be read as it.
 */
function targetsField(clause: Clause, field: string): boolean {
  return clause.category !== 'tag' && clause.field === field;
}

/**
 * Quote a term for Elastic's `query_string`, escaping what would otherwise end the phrase.
 *
 * The user's text reaches Elasticsearch unmodified (`cursors.rs` passes `query` straight through), so
 * an unescaped quote in a tag value would corrupt the surrounding query rather than just failing to
 * match.
 */
function luceneQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Build the Lucene `query_string` for `/api/search/` from free-text and tag clauses.
 *
 * Tags are indexed as flattened `key=value` strings, so a tag clause becomes a quoted phrase. Unlike
 * the Scylla list routes, Elastic can express both OR and negation, so `IsOneOf` and `IsNot` are
 * honoured here rather than silently flattened to AND.
 */
export function getSearchTextFromClauses(clauses: Clause[]): string {
  const terms: string[] = [];

  for (const clause of clauses) {
    if (isTextClause(clause)) {
      if (!ClauseIsMulti(clause)) terms.push(luceneQuote(clause.value.value));
      continue;
    }
    if (clause.category !== 'tag') continue;

    const matches = clauseValues(clause).map((value) => luceneQuote(`${clause.field}=${value}`));
    if (matches.length === 0) continue;
    const grouped = matches.length > 1 ? `(${matches.join(' OR ')})` : matches[0];
    terms.push(clause.condition === ClauseCondition.IsNot ? `NOT ${grouped}` : grouped);
  }

  return terms.join(' AND ');
}

/**
 * The raw free-text values, for bars that match client-side.
 *
 * Distinct from {@link getSearchTextFromClauses}, which builds a quoted Lucene expression for
 * Elasticsearch — passing that to `String.includes` would match the quote characters themselves.
 */
export function getTextFromClauses(clauses: Clause[]): string[] {
  return clauses.filter((clause) => isTextClause(clause) && !ClauseIsMulti(clause)).map((clause) => GetValueString(clause));
}

/** Collect every value from the clauses targeting `field`, de-duplicated and order-preserving. */
function collectValues(clauses: Clause[], predicate: (clause: Clause) => boolean): string[] {
  const seen: string[] = [];
  for (const clause of clauses) {
    if (!predicate(clause)) continue;
    for (const value of clauseValues(clause)) {
      if (!seen.includes(value)) seen.push(value);
    }
  }
  return seen;
}

export function getGroupsFromClauses(clauses: Clause[]): string[] {
  return collectValues(clauses, (clause) => clause.field === 'group' && clause.category === 'group');
}

export function getIndexesFromClauses(clauses: Clause[]): ElasticIndex[] {
  return collectValues(clauses, (clause) => clause.field === 'index' && clause.category === 'index').map((value) => value as ElasticIndex);
}

export function getStringFieldFromClauses(clauses: Clause[], field: string): string {
  let result = '';
  clauses
    .filter((clause) => targetsField(clause, field))
    .forEach((clause) => {
      if (!ClauseIsMulti(clause)) {
        result = clause.value.value;
      }
    });
  return result;
}

/**
 * Collect tag-filter clauses into a {@link RequestTags} map (`{ [key]: values }`) for the list APIs.
 *
 * Negated clauses are skipped: the Scylla census can only intersect bucket streams, so there is no
 * wire encoding for a `NOT` here. The parser already refuses to build one on a bar backed by these
 * routes, so skipping is a safety net for clauses arriving from a URL.
 *
 * Note that values for one key AND rather than OR on the wire (`tags_required` is the sum across all
 * keys), which is why tag keys are never or-capable in the registry.
 *
 * @param clauses - All active omnibar clauses.
 * @returns A map of tag key to its filter values (empty when there are no tag clauses).
 */
export function getTagsFromClauses(clauses: Clause[]): RequestTags {
  const tags: RequestTags = {};
  clauses
    .filter((clause) => clause.category == 'tag' && clause.condition !== ClauseCondition.IsNot)
    .forEach((clause) => {
      const existing = tags[clause.field] ?? [];
      tags[clause.field] = Array.from(new Set([...existing, ...clauseValues(clause)]));
    });
  return tags;
}

/**
 * Test whether a string `value` satisfies every clause targeting `field`, honoring each clause's
 * condition: `includes` is a (case-sensitive) substring match, `is not` excludes, a multi-value
 * condition (`is one of`) matches when `value` equals one of the listed values, and `is` is an exact
 * match. Returns `true` when no clause targets the field (i.e. no constraint).
 *
 * @param clauses - All active omnibar clauses.
 * @param field - The clause field to match against (e.g. `'username'`, `'name'`, `'creator'`).
 * @param value - The candidate value from the item being filtered.
 * @returns `true` if the value satisfies all clauses for the field.
 */
export function matchesStringClauses(clauses: Clause[], field: string, value: string): boolean {
  return clauses
    .filter((clause) => targetsField(clause, field))
    .every((clause) => {
      if (ClauseIsMulti(clause)) {
        return clause.value.values.includes(value);
      }
      if (clause.condition === ClauseCondition.Includes) {
        return value.includes(clause.value.value);
      }
      if (clause.condition === ClauseCondition.IsNot) {
        return value !== clause.value.value;
      }
      return value === clause.value.value;
    });
}

/**
 * Test whether a collection of `candidates` (e.g. a group's users, or a user's single role) satisfies
 * the clauses targeting `field`, honoring negation: `is`/`is one of` values must overlap the
 * candidates (several such clauses union), and `is not` values must not. Returns `true` when no
 * clause targets the field.
 *
 * Use this rather than {@link getStringFieldListFromClauses} for any field that allows `!=`, since that
 * helper flattens every clause's values and would read `role != Admin` as `role = Admin`.
 */
export function matchesListClauses(clauses: Clause[], field: string, candidates: string[]): boolean {
  const included: string[] = [];
  const excluded: string[] = [];
  for (const clause of clauses) {
    if (!targetsField(clause, field)) continue;
    (clause.condition === ClauseCondition.IsNot ? excluded : included).push(...clauseValues(clause));
  }
  if (excluded.some((value) => candidates.includes(value))) return false;
  return included.length === 0 || included.some((value) => candidates.includes(value));
}

export function getStringFieldListFromClauses(clauses: Clause[], field: string): string[] {
  const result: string[] = [];
  clauses
    .filter((clause) => targetsField(clause, field))
    .forEach((clause) => {
      result.push(...clauseValues(clause));
    });
  return result;
}

export function getClauseColorClass(clause: Clause): string {
  if (clause.category === 'tag') {
    return getTagColorClass(clause.field, GetValueString(clause));
  }
  return 'basic-clause';
}
