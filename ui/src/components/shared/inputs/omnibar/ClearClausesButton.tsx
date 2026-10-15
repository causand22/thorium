import { useRef } from 'react';
import { styled } from 'styled-components';
import { Id, toast } from 'react-toastify';
import { FaFilterCircleXmark } from 'react-icons/fa6';

// project imports
import { Clause } from './clauses/ClauseTypes';
import { restoreClauses } from './clauses/clear';

// spec: ./SPEC.md

const ClearButton = styled.button`
  border-radius: 5px;
  background-color: var(--thorium-omnibar-bg);
  color: var(--thorium-text);
  border: 1px solid var(--thorium-omnibar-border);
  height: 100%;

  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 10px;
  margin-left: 5px;
`;

const UndoButton = styled.button`
  background: none;
  border: none;
  color: inherit;
  text-decoration: underline;
  padding: 0;
  margin-left: 8px;
`;

// the undo toast currently showing, if any; module-level so it is shared across every omnibar on screen
let activeUndoToast: Id | undefined;
const UNDO_WINDOW_MS = 6000;

type ClearClausesButtonProps = {
  clauses: Clause[];
  setClauses: (next: Clause[]) => void;
};

/**
 * Clears every clause in one click and offers an undo toast instead of a confirmation. Renders nothing
 * while there are no clauses to clear.
 */
const ClearClausesButton: React.FC<ClearClausesButtonProps> = ({ clauses, setClauses }) => {
  // the toast outlives this render, so its undo reads the live clauses and setter through refs
  const latest = useRef({ clauses, setClauses });
  latest.current = { clauses, setClauses };

  if (clauses.length === 0) {
    return null;
  }

  const clear = () => {
    const cleared = clauses;
    setClauses([]);
    // an earlier undo would restore stale clauses beside this clear's, so only the latest one stays
    if (activeUndoToast !== undefined) {
      toast.dismiss(activeUndoToast);
    }
    activeUndoToast = toast(
      ({ closeToast }) => (
        <span>
          Cleared {cleared.length} {cleared.length === 1 ? 'filter' : 'filters'}
          <UndoButton
            type="button"
            onClick={() => {
              latest.current.setClauses(restoreClauses(cleared, latest.current.clauses));
              closeToast();
            }}
          >
            Undo
          </UndoButton>
        </span>
      ),
      { autoClose: UNDO_WINDOW_MS, closeOnClick: false },
    );
  };

  return (
    <ClearButton type="button" aria-label="Clear all filters" title="Clear all filters" onClick={clear}>
      <FaFilterCircleXmark />
    </ClearButton>
  );
};

export default ClearClausesButton;
