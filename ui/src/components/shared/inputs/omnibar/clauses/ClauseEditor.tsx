import { KeyboardEvent, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import OmnibarDropdown, { dropdownHasContent } from './Dropdown';
import OmnibarEntryField from './OmnibarEntryField';
import { Clause } from './ClauseTypes';
import { KeyName } from './EditingTypes';
import { EditorAction, EditorContext, initialEditorState, reduceEditor } from './editorState';
import { OmnibarRegistry, parseBuffer, serializeClause } from './parse';
import { buildRows } from './suggestions';

// spec: ../SPEC.md

const ClauseEditorContainer = styled.div`
  width: 100%;
  position: relative;
`;

const ErrorMessage = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  padding: 2px 4px;
  font-size: 0.85em;
  color: var(--thorium-danger, #c0392b);
`;

type ClauseEditorProps = {
  clauses: Clause[];
  setClauses: (next: Clause[]) => void;
  registry: OmnibarRegistry;
  /**
   * Relaxes tag-key matching, mirroring the backend flag that lowercases keys and values. Defaults to
   * `true`, matching {@link defaultOmnibarSettings}, for bars with no settings popover.
   */
  tagsCaseInsensitive?: boolean;
  placeholder?: string;
  timepickerVisible?: boolean;
  /**
   * Extra removable tiles rendered inside the entry field alongside the clause chips (before the input) —
   * for state that reads as a filter tile but isn't a {@link Clause} (e.g. the dashboard's hidden nodes).
   */
  extraChips?: React.ReactNode;
};

const ClauseEditor: React.FC<ClauseEditorProps> = ({
  clauses,
  setClauses,
  registry,
  tagsCaseInsensitive = true,
  placeholder = 'Enter a query...',
  timepickerVisible = false,
  extraChips,
}) => {
  const [state, setState] = useState(initialEditorState());
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ctx: EditorContext = { clauses, registry, tagsCaseInsensitive };

  function dispatch(action: EditorAction) {
    const result = reduceEditor(state, action, ctx);
    setState(result.state);
    if (result.clauses) setClauses(result.clauses);
  }

  const rows = useMemo(
    () => buildRows(state.buffer, registry, tagsCaseInsensitive, state.pendingKey),
    [state.buffer, registry, tagsCaseInsensitive, state.pendingKey],
  );
  const parsed = useMemo(
    () => parseBuffer(state.buffer, registry, tagsCaseInsensitive),
    [state.buffer, registry, tagsCaseInsensitive],
  );

  const errorMessage = parsed.result.kind === 'error' ? parsed.result.message : undefined;
  const dropdownVisible = state.focused && dropdownHasContent(rows);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key as KeyName) {
      case KeyName.Enter:
        e.preventDefault();
        dispatch({ type: 'enter' });
        break;
      case KeyName.Tab:
        e.preventDefault();
        // if buffer is empty and not editing a chip, blur to move focus to next element
        if (state.buffer === '' && state.editingIndex === null) {
          inputRef.current?.blur();
        } else {
          dispatch({ type: 'tab' });
        }
        break;
      case KeyName.ArrowDown:
        e.preventDefault();
        dispatch({ type: 'move', delta: 1 });
        break;
      case KeyName.ArrowUp:
        e.preventDefault();
        dispatch({ type: 'move', delta: -1 });
        break;
      case KeyName.Escape:
        dispatch({ type: 'escape' });
        break;
      case KeyName.Backspace:
        // only intercept when there is nothing left to delete in the buffer itself
        if (state.buffer === '') {
          e.preventDefault();
          dispatch({ type: 'backspace' });
        }
        break;
      default:
        break;
    }
  }

  return (
    <ClauseEditorContainer
      ref={containerRef}
      onBlur={(e) => {
        const next = e.relatedTarget;
        const focusStaysInOmnibar = !!(next && containerRef.current?.contains(next));
        const focusOnDropdown = !!(next && dropdownRef.current?.contains(next));
        //let the dropdown's own click handler run rather than committing out from under it
        if (!focusOnDropdown && !focusStaysInOmnibar) {
          dispatch({ type: 'blur' });
        }
      }}
    >
      <OmnibarEntryField
        clauses={clauses}
        buffer={state.buffer}
        editingIndex={state.editingIndex}
        placeholder={placeholder}
        focused={state.focused}
        dropdownVisible={dropdownVisible}
        timepickerVisible={timepickerVisible}
        invalid={errorMessage !== undefined}
        isEditable={(clause) => serializeClause(clause, registry, tagsCaseInsensitive) !== undefined}
        onBufferChange={(buffer) => dispatch({ type: 'setBuffer', buffer })}
        onKeyDown={handleKeyDown}
        onFocus={() => dispatch({ type: 'focus' })}
        onBeginEdit={(index) => dispatch({ type: 'editChip', index })}
        onDelete={(index) => dispatch({ type: 'deleteChip', index })}
        onContainerClick={() => dispatch({ type: 'focus' })}
        onMultiPaste={(mergedText) => dispatch({ type: 'pasteMulti', mergedText })}
        inputRef={inputRef}
        extraChips={extraChips}
      />
      {errorMessage && <ErrorMessage role="alert">{errorMessage}</ErrorMessage>}
      {dropdownVisible && (
        <OmnibarDropdown
          ref={dropdownRef}
          rows={rows}
          activeRow={state.activeRow}
          setActiveRow={(index) => dispatch({ type: 'hoverRow', index })}
          onSelect={(index) => dispatch({ type: 'selectRow', index })}
          onMouseLeave={() => dispatch({ type: 'hoverRow', index: -1 })}
        />
      )}
    </ClauseEditorContainer>
  );
};
export default ClauseEditor;
