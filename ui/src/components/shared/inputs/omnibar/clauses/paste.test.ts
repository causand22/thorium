import { describe, expect, it } from 'vitest';
import { sanitizePastedText, splitPastedSegments } from './paste';

// spec: ../SPEC.md

describe('sanitizePastedText', () => {
  it('trims a leading space before a key', () => {
    expect(sanitizePastedText(' group=test1')).toBe('group=test1');
  });

  it('trims a trailing newline', () => {
    expect(sanitizePastedText('group=test1\n')).toBe('group=test1');
  });

  it('trims surrounding whitespace on bare text', () => {
    expect(sanitizePastedText('  hello world  ')).toBe('hello world');
  });

  it('preserves internal spaces in a value', () => {
    expect(sanitizePastedText('comment=looks like a dropper')).toBe('comment=looks like a dropper');
  });

  it('trims whitespace around the value', () => {
    expect(sanitizePastedText('group= test1 ')).toBe('group=test1');
  });

  it('trims each comma-separated value segment', () => {
    expect(sanitizePastedText('group=a, b, c')).toBe('group=a,b,c');
  });

  it('prefers the longer operator on a tie, same as the parser', () => {
    expect(sanitizePastedText(' a!=b ')).toBe('a!=b');
  });

  it('leaves a bare "=foo" as text, matching the parser’s empty-key rule', () => {
    expect(sanitizePastedText(' =foo ')).toBe('=foo');
  });

  it('is a no-op on already-clean text', () => {
    expect(sanitizePastedText('group=test1')).toBe('group=test1');
  });

  it('leaves a fully quoted value untouched, including spaces around an inner operator', () => {
    expect(sanitizePastedText('"group = static"')).toBe('"group = static"');
  });

  it('trims only the outer whitespace around a quoted value', () => {
    expect(sanitizePastedText('  "group=static"  ')).toBe('"group=static"');
  });

  it('preserves an internal newline inside a quoted value untouched', () => {
    expect(sanitizePastedText('"foo\nbar"')).toBe('"foo\nbar"');
  });
});

describe('splitPastedSegments', () => {
  it('splits on newlines and drops blank lines', () => {
    expect(splitPastedSegments('group=test1\n\nstatus=open\n')).toEqual(['group=test1', 'status=open']);
  });

  it('returns a single segment for single-line text', () => {
    expect(splitPastedSegments('group=test1')).toEqual(['group=test1']);
  });

  it('keeps a quoted multi-line value as one segment', () => {
    expect(splitPastedSegments('"this is a\nmulti-line\ncomment"\nstatus=open')).toEqual([
      '"this is a\nmulti-line\ncomment"',
      'status=open',
    ]);
  });

  it('falls back to ordinary separate lines when a quote is never closed', () => {
    expect(splitPastedSegments('"unterminated\nstatus=open')).toEqual(['"unterminated', 'status=open']);
  });

  it('does not treat a self-closed quoted line as an opener', () => {
    expect(splitPastedSegments('"foo"\nstatus=open')).toEqual(['"foo"', 'status=open']);
  });
});
