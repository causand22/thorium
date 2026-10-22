import { useRef, useLayoutEffect, ClipboardEvent, KeyboardEvent, forwardRef } from 'react';
import { styled } from 'styled-components';
import { sanitizePastedText, splitPastedSegments } from './paste';

// spec: ../SPEC.md

export const ClauseComponentSpan = styled.span`
  margin: 0 2px;
  white-space: pre;
  cursor: text;
  color: inherit;
`;

const StyledInput = styled.input`
  background: transparent;
  border: none;
  outline: none;
  margin: 0 2px;
  letter-spacing: normal;
  font: inherit;
  box-sizing: content-box;
  color: inherit;
  min-width: 2px;

  &::placeholder {
    color: var(--thorium-omnibar-placeholder);
    opacity: 1; /* Firefox */
  }
`;

const HiddenMeasureSpan = styled.span`
  visibility: hidden;
  position: absolute;
  margin: 0 2px;
  white-space: pre;
  letter-spacing: normal;
  font: inherit;
`;

type AutoWidthInputProps = {
  value: string;
  placeholder: string;
  autoFocus?: boolean;
  /** Minimum width in px, so an empty new-clause input is still clickable. */
  minWidth?: number;
  onChange: (next: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  'aria-label'?: string;
  /**
   * Called instead of the ordinary sanitize-and-insert paste handling when a paste resolves (after
   * merging with the current value) to 2+ segments — e.g. several `key=value` lines. Omitted entirely
   * for the in-place chip-edit input, which always stays single-segment.
   */
  onMultiPaste?: (mergedText: string) => void;
};

/**
 * A borderless text input that grows to fit its content, so the buffer reads as inline text among the
 * clause chips rather than as a form field.
 */
export const AutoWidthInput = forwardRef<HTMLInputElement, AutoWidthInputProps>(
  ({ value, placeholder, autoFocus, minWidth = 0, onChange, onKeyDown, onFocus, 'aria-label': ariaLabel, onMultiPaste }, ref) => {
    const measureRef = useRef<HTMLSpanElement | null>(null);
    const measureText = value || placeholder || ' ';

    useLayoutEffect(() => {
      if (ref && 'current' in ref && ref.current && measureRef.current) {
        ref.current.style.width = `${Math.max(measureRef.current.offsetWidth + 1, minWidth)}px`;
      }
    }, [value, placeholder, minWidth, ref]);

    // clean up incidental clipboard whitespace (see ./paste) before it reaches the parser; a no-op
    // sanitization falls through to the browser's default paste so undo/IME behave normally
    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
      const clipboardText = e.clipboardData.getData('text');
      const input = e.currentTarget;
      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? value.length;

      if (onMultiPaste) {
        const merged = value.slice(0, start) + clipboardText + value.slice(end);
        if (splitPastedSegments(merged).length > 1) {
          e.preventDefault();
          onMultiPaste(merged);
          return;
        }
      }

      const sanitized = sanitizePastedText(clipboardText);

      if (sanitized === clipboardText) return;

      e.preventDefault();
      onChange(value.slice(0, start) + sanitized + value.slice(end));

      const caret = start + sanitized.length;
      requestAnimationFrame(() => input.setSelectionRange(caret, caret));
    };

    return (
      <>
        <HiddenMeasureSpan ref={measureRef}>{measureText}</HiddenMeasureSpan>
        <StyledInput
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onPaste={handlePaste}
        />
      </>
    );
  },
);

export const ClauseComponentStatic: React.FC<{ value: string }> = ({ value }) => {
  return <ClauseComponentSpan>{value}</ClauseComponentSpan>;
};
