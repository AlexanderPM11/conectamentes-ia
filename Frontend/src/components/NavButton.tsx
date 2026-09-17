import { Icon } from './Icon';
import { Tab, IconName } from '../types';

interface NavButtonProps {
  item: { id: Tab; label: string; icon: IconName };
  active: boolean;
  onClick: () => void;
}

export function NavButton({ item, active, onClick }: NavButtonProps) {
  return (
    <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </button>
  );
}
