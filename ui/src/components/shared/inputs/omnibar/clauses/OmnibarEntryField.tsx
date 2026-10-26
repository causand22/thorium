import React, { KeyboardEvent, useRef } from 'react';
import { styled } from 'styled-components';
import { OmnibarClause } from './Clause';
import { AutoWidthInput } from './ClauseComponent';
import { Clause } from './ClauseTypes';

const OmnibarEntryFieldDiv = styled.div<{ $dropdownVisible: boolean; $timepickerVisible: boolean; $invalid: boolean }>`
  border: 1px solid ${({ $invalid }) => ($invalid ? 'var(--thorium-danger, #c0392b)' : 'var(--thorium-omnibar-border)')};
  color: var(--thorium-text);
  background-color: var(--thorium-omnibar-bg);
  display: flex;
  flex-wrap: nowrap;
  min-height: 40px;
  cursor: text;
  overflow: hidden;
  padding: 2px 5px;
  border-radius: 5px;

  ${({ $dropdownVisible }) =>
    $dropdownVisible &&
    `
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    `}
  ${({ $timepickerVisible }) =>
    $timepickerVisible &&
    `
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    `}
`;

const ClauseContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  flex: 1 1 auto;
  align-items: center;
  align-content: center;
  overflow: auto;
`;

const InlineEditWrapper = styled.div`
  display: inline-flex;
  align-items: center;
  align-self: center;
  padding: 2px 5px;
  margin: 2px;
  border: 1px solid var(--thorium-text);
  border-radius: 5px;
`;

type OmnibarEntryFieldProps = {
  clauses: Clause[];
  buffer: string;
  /** Index of the chip being edited in place, or null when appending. */
  editingIndex: number | null;
  placeholder: string;
  /** Whether the editor currently holds focus; keeps the caret in the bar after an in-place edit. */
  focused: boolean;
  dropdownVisible: boolean;
  timepickerVisible: boolean;
  invalid: boolean;
  /** Whether a chip round-trips to text, and so can be re-opened for editing. */
  isEditable: (clause: Clause) => boolean;
  onBufferChange: (next: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBeginEdit: (idx: number) => void;
  onDelete: (idx: number) => void;
  onContainerClick: () => void;
  /** A paste into the new-clause input resolved to 2+ segments; never offered to the in-place-edit input. */
  onMultiPaste: (mergedText: string) => void;
  /** Ref to the buffer input for parent focus control. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Extra removable tiles rendered after the clause chips, before the new-clause input. */
  extraChips?: React.ReactNode;
};

const OmnibarEntryField: React.FC<OmnibarEntryFieldProps> = ({
  clauses,
  buffer,
  editingIndex,
  placeholder,
  focused,
  dropdownVisible,
  timepickerVisible,
  invalid,
  isEditable,
  onBufferChange,
  onKeyDown,
  onFocus,
  onBeginEdit,
  onDelete,
  onContainerClick,
  onMultiPaste,
  inputRef: parentInputRef,
  extraChips,
}) => {
  const localInputRef = useRef<HTMLInputElement | null>(null);
  // use parent ref if provided, otherwise fall back to local ref (for container click focus)
  const inputRef = parentInputRef || localInputRef;

  const bufferInput = (autoFocus: boolean, minWidth: number, allowMultiPaste: boolean) => (
    <AutoWidthInput
      ref={inputRef}
      value={buffer}
      placeholder={editingIndex === null ? placeholder : ''}
      autoFocus={autoFocus}
      minWidth={minWidth}
      aria-label="omnibar filter input"
      onChange={onBufferChange}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onMultiPaste={allowMultiPaste ? onMultiPaste : undefined}
    />
  );

  return (
    <OmnibarEntryFieldDiv $dropdownVisible={dropdownVisible} $timepickerVisible={timepickerVisible} $invalid={invalid}>
      <ClauseContainer
        onClick={() => {
          onContainerClick();
          inputRef.current?.focus();
        }}
      >
        {clauses.map((clause, idx) =>
          // the chip under edit is replaced in place by the buffer input, so clause order is preserved
          idx === editingIndex ? (
            <InlineEditWrapper key={idx} onClick={(e) => e.stopPropagation()}>
              {bufferInput(true, 20, false)}
            </InlineEditWrapper>
          ) : (
            <OmnibarClause
              key={idx}
              clause={clause}
              editable={isEditable(clause)}
              onBeginEdit={() => onBeginEdit(idx)}
              onDelete={() => onDelete(idx)}
            />
          ),
        )}
        {extraChips}
        {/* this input unmounts while a chip is edited in place, so autofocusing on remount hands the
            caret back here once that edit commits */}
        {editingIndex === null && bufferInput(focused, 120, true)}
      </ClauseContainer>
    </OmnibarEntryFieldDiv>
  );
};

export default OmnibarEntryField;
