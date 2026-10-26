import { styled } from 'styled-components';
import { FaX } from 'react-icons/fa6';
import { toast } from 'react-toastify';
import { ClauseComponentSpan, ClauseComponentStatic } from './ClauseComponent';
import { getClauseColorClass } from './utils';
import { Clause, GetValueString } from './ClauseTypes';
import { conditionToSymbol } from './parse';
import { CategoryLogo } from './CategoryLogo';

const IconButton = styled.button`
  padding: 0;
  border: 0px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  background-color: inherit;
  color: inherit;
`;

const ClauseContainer = styled.div`
  border-radius: 5px;
  border: 1px solid var(--thorium-text);
  padding: 2px 5px;
  width: auto;
  margin: 2px;
  box-sizing: content-box;
  letter-spacing: normal;

  display: inline-flex;
  align-items: center;
  align-self: center;
  justify-content: center;
  gap: 2px;
`;

type OmnibarClauseProps = {
  clause: Clause;
  /**
   * Whether clicking re-opens the clause for editing. False when the clause can't be expressed in this
   * bar's vocabulary (so it wouldn't round-trip), leaving it delete-only.
   */
  editable: boolean;
  onBeginEdit: () => void;
  onDelete: () => void;
};

export const OmnibarClause: React.FC<OmnibarClauseProps> = ({ clause, editable, onBeginEdit, onDelete }) => {
  const isText = clause.category === 'text' && clause.field === 'text';
  const copyText = isText ? GetValueString(clause) : `${clause.field}${conditionToSymbol(clause.condition)}${GetValueString(clause)}`;

  const handleCopy = () => {
    void navigator.clipboard
      .writeText(copyText)
      .then(() => toast.success(`Copied "${copyText}" to clipboard!`))
      .catch(() => toast.error(`Error copying "${copyText}" to clipboard.`));
  };

  return (
    <ClauseContainer
      className={getClauseColorClass(clause)}
      onClick={(e) => {
        e.stopPropagation();
        // allow clicking anywhere on the card to edit (except the delete button)
        if (editable) {
          onBeginEdit();
        }
      }}
      style={editable ? { cursor: 'pointer' } : undefined}
      title={editable ? 'edit clause' : undefined}
    >
      <IconButton
        onClick={(e) => {
          e.stopPropagation();
          handleCopy();
          // this button lives inside the editor's container, so clicking it never moves focus
          // outside containerRef; blur it explicitly so the container's own onBlur fires and
          // closes the dropdown, instead of leaving `focused` stuck true from before the click
          e.currentTarget.blur();
        }}
      >
        <CategoryLogo category={clause.category} title="copy tag" />
      </IconButton>
      {!isText && (
        //a text clause has no typeable key or operator, so show only its value
        <>
          <ClauseComponentStatic value={clause.field} />
          <ClauseComponentSpan>{conditionToSymbol(clause.condition)}</ClauseComponentSpan>
        </>
      )}
      <ClauseComponentSpan>{GetValueString(clause)}</ClauseComponentSpan>
      <IconButton
        title="delete clause"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
          // see the copy button's onClick above: blur so the container's onBlur actually fires
          e.currentTarget.blur();
        }}
      >
        <FaX size={12} />
      </IconButton>
    </ClauseContainer>
  );
};
