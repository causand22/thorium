import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import OmnibarDropdown, { dropdownHasContent } from './Dropdown';
import OmnibarEntryField from './OmnibarEntryField';
import { Clause } from './ClauseTypes';
import { KeyName } from './EditingTypes';
import { EditorAction, EditorContext, initialEditorState, reduceEditor } from './editorState';
import { asBareSha256, HashJump } from './hash';
import { OmnibarRegistry, parseBuffer, serializeClause } from './parse';
import { buildRows, DropdownRow } from './suggestions';

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
const HASH_NOT_FOUND = 'No file found with that sha256';

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
  // the sha256 being looked up, or null. Kept outside the reducer because it is an async side effect
  const [lookingUp, setLookingUp] = useState<string | null>(null);
  const [hashMiss, setHashMiss] = useState<string | undefined>(undefined);
  // bumped to invalidate a lookup in flight: any edit, blur or Escape means the answer is no longer wanted
  const lookupToken = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ctx: EditorContext = { clauses, registry, tagsCaseInsensitive };

  function cancelHashLookup() {
    lookupToken.current += 1;
    setLookingUp(null);
    setHashMiss(undefined);
  }

  function dispatch(action: EditorAction) {
    // focus and hover leave the buffer alone; everything else makes a pending lookup stale
    if (action.type !== 'focus' && action.type !== 'hoverRow') cancelHashLookup();
    const result = reduceEditor(state, action, ctx);
    setState(result.state);
    if (result.clauses) setClauses(result.clauses);
  }

  // the async callback below outlives the render that started it, so it dispatches through this
  const latestDispatch = useRef(dispatch);
  useEffect(() => {
    latestDispatch.current = dispatch;
  });

  // a lookup still running when the editor unmounts must not navigate
  useEffect(() => {
    const token = lookupToken;
    return () => {
      token.current += 1;
    };
  }, []);

  /**
   * Check that the file exists, then open it. On a miss a bar with free text commits the hash as an
   * ordinary text chip, as Enter would have; a bar with none shows a message instead, since the hash
   * can't become a chip.
   */
  function startHashLookup(sha256: string) {
    if (!hashJump) return;
    const token = lookupToken.current + 1;
    lookupToken.current = token;
    setLookingUp(sha256);
    setHashMiss(undefined);
    void hashJump
      .lookup(sha256)
      .catch(() => false)
      .then((found) => {
        if (token !== lookupToken.current) return;
        setLookingUp(null);
        if (found) {
          hashJump.open(sha256);
        } else if (!registry.text) {
          setHashMiss(HASH_NOT_FOUND);
        } else {
          latestDispatch.current({ type: 'enter' });
        }
      });
  }

  const rows = useMemo(
    () => (lookingUp !== null ? LOOKING_UP_ROWS : buildRows(state.buffer, registry, tagsCaseInsensitive, state.pendingKey)),
    [lookingUp, state.buffer, registry, tagsCaseInsensitive, state.pendingKey],
  );
  const parsed = useMemo(
    () => parseBuffer(state.buffer, registry, tagsCaseInsensitive),
    [state.buffer, registry, tagsCaseInsensitive],
  );

  const errorMessage = (parsed.result.kind === 'error' ? parsed.result.message : undefined) ?? hashMiss;
  const dropdownVisible = state.focused && dropdownHasContent(rows);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key as KeyName) {
      case KeyName.Enter: {
        e.preventDefault();
        // a lookup is already deciding what this Enter would do
        if (lookingUp !== null) break;
        // a highlighted row, an operator stage or an in-place chip edit all mean Enter has another job
        const sha256 =
          hashJump && state.activeRow === -1 && state.pendingKey === null && state.editingIndex === null
            ? asBareSha256(state.buffer)
            : undefined;
        if (sha256) {
          startHashLookup(sha256);
        } else {
          dispatch({ type: 'enter' });
        }
        break;
      }
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
        onMultiPaste={(mergedText) => dispatch({ type: 'pasteMulti', mergedText })}        inputRef={inputRef}
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
