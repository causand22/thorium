/**
 * Clipboard hygiene for the omnibar buffer. Pasted text commonly carries incidental whitespace —
 * a leading space, a trailing newline, spaces after commas in a copied list — that would otherwise
 * stop a key from matching a reserved field (`resolveKey` in `./parse` does not trim) or end up
 * baked into a value. This is deliberately *not* part of the core grammar in `./parse`: typed input
 * keeps the exact verbatim semantics documented in `../SPEC.md`, and this file only cleans up text
 * on the way in from the clipboard before handing it to that unchanged parser.
 */

// project imports
import { findOperator } from './parse';

/** Trim outer whitespace from a pasted buffer, and tidy up a key/value pair if one is present. */
export function sanitizePastedText(raw: string): string {
  const trimmed = raw.trim();

  // a fully quoted buffer is verbatim free text in the grammar (parse.ts checks this before looking
  // for an operator), so nothing inside it should be touched — trimming around a `=` that's really
  // just part of a quoted search string would corrupt the value it was quoted to protect
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed;

  const operator = findOperator(trimmed);
  if (!operator || operator.index === 0) return trimmed;

  const key = trimmed.slice(0, operator.index).trim();
  const rawValue = trimmed.slice(operator.index + operator.symbol.length);
  const value = rawValue
    .split(',')
    .map((segment) => segment.trim())
    .join(',');

  return `${key}${operator.symbol}${value}`;
}

/**
 * Split pasted text into clause-sized segments on newlines, for multi-pair paste.
 *
 * A (trimmed) line that opens a quote without closing it on the same line — i.e. it starts with `"`
 * but doesn't itself satisfy the grammar's whole-span quoted-text rule — holds the split open: further
 * lines are folded in (rejoined with the real newline) until one ends with `"`, so an intentionally
 * multi-line quoted value becomes one segment instead of being shredded across several. If nothing
 * ever closes it, the held lines fall back to being ordinary, separate segments rather than silently
 * swallowing the rest of the paste.
 *
 * Blank segments are dropped.
 */
export function splitPastedSegments(text: string): string[] {
  const lines = text.split('\n');
  const segments: string[] = [];
  let pending: string[] | undefined;

  for (const line of lines) {
    if (pending) {
      pending.push(line);
      if (line.trim().endsWith('"')) {
        segments.push(pending.join('\n'));
        pending = undefined;
      }
      continue;
    }

    const trimmedLine = line.trim();
    const opensUnclosedQuote = trimmedLine.startsWith('"') && !(trimmedLine.length >= 2 && trimmedLine.endsWith('"'));
    if (opensUnclosedQuote) {
      pending = [line];
      continue;
    }

    segments.push(line);
  }
  if (pending) segments.push(...pending);

  return segments.map((segment) => segment.trim()).filter((segment) => segment !== '');
}
