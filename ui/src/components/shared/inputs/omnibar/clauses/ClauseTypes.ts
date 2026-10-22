// spec: ../SPEC.md

/* Package for clause data and all clause related functions.
 *
 * A clause is always `key <operator> value`, including free text (`category`/`field` both `'text'`).
 * The grammar that produces one lives in ./parse.ts.
 * */

export type SingleValue = {
  value: string;
};

export type MultiValue = {
  values: string[];
};

//NOTE: add new conditions here
export enum ClauseCondition {
  Is = 'is',
  IsNot = 'is not',
  IsOneOf = 'is one of',
  /// substring match (e.g. "username includes ali" matches "alice")
  Includes = 'includes',
}

//NOTE: add new multi conditions here
const multiConditions = [ClauseCondition.IsOneOf] as const;

type MultiCondition = (typeof multiConditions)[number];
type SingleCondition = Exclude<ClauseCondition, MultiCondition>;

type ClauseBase = {
  field: string;
  category: string;
};

export type Clause =
  | (ClauseBase & { condition: SingleCondition; value: SingleValue })
  | (ClauseBase & { condition: MultiCondition; value: MultiValue });

/**
 * The tag keys hidden from results by default. A display filter, not a query filter: it lives in
 * {@link OmnibarSettings} rather than in a clause, since it has no `key <operator> value` form.
 */
export const DEFAULT_HIDDEN_TAGS = ['Results', 'Parent', 'submitter'];

export function parseClauseCondition(input: string): ClauseCondition | undefined {
  const s = input.trim().toLowerCase();
  const values = Object.values(ClauseCondition) as string[];
  if (values.includes(s)) {
    return s as ClauseCondition;
  }
  return undefined;
}

export function ClauseIsMulti(clause: Clause): clause is Extract<Clause, { condition: MultiCondition }> {
  return CondIsMulti(clause.condition);
}

export function CondIsMulti(cond: ClauseCondition): cond is MultiCondition {
  return (multiConditions as readonly ClauseCondition[]).includes(cond);
}

/** Every value on a clause, regardless of its single/multi shape. */
export function clauseValues(clause: Clause): string[] {
  return ClauseIsMulti(clause) ? clause.value.values : [clause.value.value];
}

export function GetValueString(clause: Clause): string {
  if (ClauseIsMulti(clause)) {
    return clause.value.values.join(', ');
  }
  return clause.value.value;
}

export function NewTextClause(textValue: string): Clause {
  return {
    category: 'text',
    field: 'text',
    condition: ClauseCondition.Is,
    value: { value: textValue },
  };
}
