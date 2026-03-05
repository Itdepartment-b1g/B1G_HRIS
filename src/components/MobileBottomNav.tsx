import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  LayoutGrid,
  Rss,
  Briefcase,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileNavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const mobileNavItems: MobileNavItem[] = [
  { id: 'home', label: 'Home', path: '/dashboard', icon: Home },
  { id: 'features', label: 'Features', path: '/dashboard/features', icon: LayoutGrid },
  { id: 'feeds', label: 'Feeds', path: '/dashboard/feeds', icon: Rss },
  { id: 'workspace', label: 'Workspace', path: '/dashboard/workspace', icon: Briefcase },
  { id: 'profile', label: 'Profile', path: '/dashboard/profile', icon: User },
];

const MobileBottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5 gap-0 w-full max-w-[100vw]">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === '/dashboard'
              ? location.pathname === '/dashboard' || location.pathname === '/dashboard/'
              : location.pathname.startsWith(item.path);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.path)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 py-3 px-2 min-h-[56px] transition-colors touch-manipulation',
                isActive ? 'text-primary' : 'text-gray-400 active:text-white'
              )}
            >
              <Icon className="h-6 w-6 shrink-0" />
              <span className="text-[11px] font-medium leading-tight text-center truncate w-full px-0.5">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
