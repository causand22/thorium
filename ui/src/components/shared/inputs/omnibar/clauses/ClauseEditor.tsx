import { KeyboardEvent, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import OmnibarDropdown, { dropdownHasContent } from './Dropdown';
import OmnibarEntryField from './OmnibarEntryField';
import { Clause } from './ClauseTypes';
import { KeyName } from './EditingTypes';
import { EditorAction, EditorContext, initialEditorState, reduceEditor } from './editorState';
import { asBareSha256, HashJump } from './hash';
import { OmnibarRegistry, parseBuffer, serializeClause } from './parse';
import { buildRows, DropdownRow } from './suggestions';
import { useHashLookup } from './useHashLookup';

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
  /**
   * Opt in to jumping straight to a file when Enter is pressed on a buffer that is exactly one sha256.
   * Omit it and a bare hash is treated like any other text.
   */
  hashJump?: HashJump;
};

const LOOKING_UP_ROWS: DropdownRow[] = [{ kind: 'hint', label: 'Looking up file…' }];
const HASH_BANNER = 'Looks like a sha256 hash. Press Enter to look it up and open the file.';

const ClauseEditor: React.FC<ClauseEditorProps> = ({
  clauses,
  setClauses,
  registry,
  tagsCaseInsensitive = true,
  placeholder = 'Enter a query...',
  timepickerVisible = false,
  extraChips,
  hashJump,
}) => {
  const [state, setState] = useState(initialEditorState());
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ctx: EditorContext = { clauses, registry, tagsCaseInsensitive };

  // the sha256 lookup is an async side effect, so it lives outside the reducer
  const hashLookup = useHashLookup(hashJump, !!registry.text, () => dispatch({ type: 'enter' }));
  const { lookingUp } = hashLookup;

  function dispatch(action: EditorAction) {
    // focus and hover leave the buffer alone; everything else makes a pending lookup stale
    if (action.type !== 'focus' && action.type !== 'hoverRow') hashLookup.cancel();
    const result = reduceEditor(state, action, ctx);
    setState(result.state);
    if (result.clauses) setClauses(result.clauses);
  }

  const rows = useMemo(
    () => (lookingUp !== null ? LOOKING_UP_ROWS : buildRows(state.buffer, registry, tagsCaseInsensitive, state.pendingKey)),
    [lookingUp, state.buffer, registry, tagsCaseInsensitive, state.pendingKey],
  );
  const parsed = useMemo(() => parseBuffer(state.buffer, registry, tagsCaseInsensitive), [state.buffer, registry, tagsCaseInsensitive]);

  const errorMessage = (parsed.result.kind === 'error' ? parsed.result.message : undefined) ?? hashLookup.miss;

  // the hash Enter will look up, if any. A highlighted row, an operator stage, an in-place chip edit or
  // a lookup already running all mean Enter has another job
  const enterHash =
    hashJump && lookingUp === null && state.activeRow === -1 && state.pendingKey === null && state.editingIndex === null
      ? asBareSha256(state.buffer)
      : undefined;
  const dropdownVisible = state.focused && (dropdownHasContent(rows) || enterHash !== undefined);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key as KeyName) {
      case KeyName.Enter:
        e.preventDefault();
        // a lookup is already deciding what this Enter would do
        if (lookingUp !== null) break;
        if (enterHash) {
          hashLookup.start(enterHash);
        } else {
          dispatch({ type: 'enter' });
        }
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
          banner={enterHash ? HASH_BANNER : undefined}
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
