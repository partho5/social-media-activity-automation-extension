interface NavItem {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
}

const PLATFORM_ITEMS: NavItem[] = [
  { id: 'facebook', label: 'Facebook', icon: 'f', enabled: true },
  { id: 'x', label: 'X (Twitter)', icon: '𝕏', enabled: false },
  { id: 'instagram', label: 'Instagram', icon: '◎', enabled: false },
  { id: 'linkedin', label: 'LinkedIn', icon: 'in', enabled: false },
];

interface SidebarProps {
  selected: string;
  onSelect: (id: string) => void;
}

function NavButton({ item, selected, onSelect }: { item: NavItem; selected: string; onSelect: (id: string) => void }) {
  return (
    <button
      key={item.id}
      disabled={!item.enabled}
      onClick={() => item.enabled && onSelect(item.id)}
      className={[
        'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-left w-full',
        item.enabled
          ? selected === item.id
            ? 'bg-blue-600 text-white'
            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
          : 'text-gray-600 cursor-not-allowed',
      ].join(' ')}>
      <span className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold bg-gray-700 shrink-0">
        {item.icon}
      </span>
      {item.label}
      {!item.enabled && (
        <span className="ml-auto text-xs text-gray-600 font-normal">soon</span>
      )}
    </button>
  );
}

export function Sidebar({ selected, onSelect }: SidebarProps) {
  return (
    <nav className="w-52 shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col py-4 h-full">
      <div className="px-4 mb-6">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">Platforms</span>
      </div>
      {PLATFORM_ITEMS.map(item => (
        <NavButton key={item.id} item={item} selected={selected} onSelect={onSelect} />
      ))}
    </nav>
  );
}
