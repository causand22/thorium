import { useEffect } from 'react';
import { styled } from 'styled-components';
import { FaCheck } from 'react-icons/fa';
import { CategoryLogo } from './CategoryLogo';
import { DropdownRow, rowIsSelectable } from './suggestions';

const OmnibarDropdownDiv = styled.div`
  position: absolute;
  border: 1px solid var(--thorium-omnibar-border);
  background-color: var(--thorium-omnibar-bg);
  border-top: none;
  z-index: 100;
  width: 100%;
  box-shadow: 0 12px 14px var(--thorium-omnibar-dropdown-shadow);
  max-height: 400px;
  overflow-y: auto;
`;

const DropdownOptionDiv = styled.div<{ $focused: boolean }>`
  padding: 5px;
  cursor: pointer;
  background-color: ${(props) => (props.$focused ? 'var(--thorium-omnibar-dropdown-highlight)' : 'inherit')};
  display: flex;
  justify-content: space-between;
  gap: 10px;
`;

const DropdownHeaderDiv = styled.div`
  padding: 4px 5px;
  font-size: 0.75em;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--thorium-secondary-text);
  border-top: 1px solid var(--thorium-omnibar-border);

  &:first-child {
    border-top: none;
  }
`;

const DropdownHintDiv = styled.div`
  padding: 5px;
  color: var(--thorium-secondary-text);
  font-style: italic;
`;

const DropdownBannerDiv = styled.div`
  padding: 5px;
  font-weight: 600;
  border-bottom: 1px solid var(--thorium-omnibar-border);
`;

const DropdownOptionHelpText = styled.span`
  color: var(--thorium-secondary-text);
`;

const DropdownOptionValueDiv = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

export type DropdownProps = {
  rows: DropdownRow[];
  /** Index into `rows` of the highlighted row, or -1 when nothing is active. */
  activeRow: number;
  setActiveRow: (idx: number) => void;
  onSelect: (idx: number) => void;
  onMouseLeave: () => void;
  /**
   * A note shown above the rows, outside their numbering. It is only shown while no row is active (so
   * `activeRow`'s index into the rows never has to account for it): it describes what Enter will do.
   */
  banner?: string;
  ref: React.RefObject<HTMLDivElement | null>;
};

const OmnibarDropdown: React.FC<DropdownProps> = ({ rows, activeRow, setActiveRow, onSelect, onMouseLeave, banner, ref }) => {
  //Scroll to position of highlighted element
  useEffect(() => {
    if (!ref.current) return;
    //fixes bug where after selecting a key the value list would be pre-scrolled down
    if (activeRow === -1) {
      ref.current.scrollTop = 0;
      return;
    }

    const focusedElement = ref.current.children[activeRow];
    if (!focusedElement) return;

    const dropdownHeight = ref.current.clientHeight;
    const dropdownTopEdge = ref.current.getBoundingClientRect().top;
    const focusedElementTopEdge = focusedElement.getBoundingClientRect().top;
    //get number of pixels between the focused element in dropdown and top of dropdown
    const focusedElementOffset = focusedElementTopEdge - dropdownTopEdge;
    //add element height to the offset to get the offset of bottom
    const focusedElementBottomOffset = focusedElementOffset + focusedElement.clientHeight;
    // Remember -- pixels start at 0 at top of screen and increase going down.
    // Negative focusedElementOffset == higher on screen. Positive == lower on screen
    if (focusedElementOffset < 0) {
      //less than 0, that means we need to 'scroll' up. The focused element is above the top of the dropdown
      //increase the scroll window by the offset (top of highlighted element will be top of scroll window)
      ref.current.scrollTop += focusedElementOffset;
    } else if (focusedElementBottomOffset > dropdownHeight) {
      //if offset plus height of entry is more than dropdown (i.e. the entire entry is not being shown)
      ref.current.scrollTop += focusedElementBottomOffset - dropdownHeight;
    }
  }, [activeRow, ref]);

  return (
    <OmnibarDropdownDiv
      ref={ref}
      tabIndex={-1}
      onMouseLeave={onMouseLeave}
      role="listbox"
      // keep focus in the input: without this the mousedown blurs it, the blur handler commits and
      // clears the buffer, and the click then lands on a row computed from state that no longer exists
      onMouseDown={(e) => e.preventDefault()}
    >
      {banner && <DropdownBannerDiv role="presentation">{banner}</DropdownBannerDiv>}
      {rows.map((row, idx) => {
        if (row.kind === 'header') {
          return (
            <DropdownHeaderDiv key={idx} role="presentation">
              {row.label}
            </DropdownHeaderDiv>
          );
        }
        if (row.kind === 'hint') {
          return (
            <DropdownHintDiv key={idx} role="presentation">
              {row.label}
            </DropdownHintDiv>
          );
        }
        return (
          <DropdownOptionDiv
            key={idx}
            onClick={() => onSelect(idx)}
            onMouseMove={() => setActiveRow(idx)}
            $focused={idx === activeRow}
            role="option"
            aria-selected={idx === activeRow}
          >
            <DropdownOptionValueDiv>
              <CategoryLogo category={row.category} />
              <span> {row.label} </span>
            </DropdownOptionValueDiv>
            <div>
              {row.helpText && <DropdownOptionHelpText>{row.helpText}</DropdownOptionHelpText>}
              {row.checked && <FaCheck />}
            </div>
          </DropdownOptionDiv>
        );
      })}
    </OmnibarDropdownDiv>
  );
};

export default OmnibarDropdown;

/** Whether the dropdown has anything worth showing. */
export function dropdownHasContent(rows: DropdownRow[]): boolean {
  return rows.length > 0 && rows.some((row) => rowIsSelectable(row) || row.kind === 'hint');
}
