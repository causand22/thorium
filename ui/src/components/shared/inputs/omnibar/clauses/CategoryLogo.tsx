import {
  FaCircleCheck,
  FaClock,
  FaEnvelope,
  FaFolderOpen,
  FaHouse,
  FaMagnifyingGlass,
  FaPen,
  FaPeopleGroup,
  FaTag,
  FaUser,
  FaUserShield,
} from 'react-icons/fa6';

type CategoryLogoProps = {
  category: string;
  /** Overrides the icon's native tooltip, e.g. to suppress it in favor of an OverlayTip. Defaults to `category`. */
  title?: string;
};

export const CategoryLogo: React.FC<CategoryLogoProps> = ({ category, title = category }) => {
  switch (category) {
    case 'group':
      return <FaPeopleGroup title={title} />;
    case 'username':
      return <FaUser title={title} />;
    case 'email':
      return <FaEnvelope title={title} />;
    case 'role':
      return <FaUserShield title={title} />;
    case 'verified':
      return <FaCircleCheck title={title} />;
    case 'local':
      return <FaHouse title={title} />;
    case 'creator':
      return <FaUser title={title} />;
    case 'index':
      return <FaFolderOpen title={title} />;
    case 'text':
      return <FaPen title={title} />;
    case 'tag':
      return <FaTag title={title} />;
    case 'time':
      return <FaClock title={title} />;
    case '':
      return <></>;
    default:
      return <FaMagnifyingGlass title={title} />;
  }
};
