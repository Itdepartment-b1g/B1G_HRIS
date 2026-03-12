import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Users, Network, Clock, Settings, ChevronRight, Briefcase, MapPin, CalendarDays, Target, Wallet, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'employee',
    label: 'Employee',
    items: [
      { path: '/dashboard/master-data/employees', label: 'Employee List', icon: Users, description: 'Manage all employees' },
      { path: '/dashboard/master-data/departments', label: 'Department', icon: Network, description: 'Department management' },
      { path: '/dashboard/master-data/employment-status', label: 'Employment Status', icon: Briefcase, description: 'Status types & duration' },
      { path: '/dashboard/master-data/positions', label: 'Position', icon: Target, description: 'Job titles & positions' },
    ],
  },
  {
    key: 'management',
    label: 'Management',
    items: [
      { path: '/dashboard/master-data/leave-balances', label: 'Leave Balances', icon: CalendarClock, description: 'Leave types, entitlements & eligibility' },
      { path: '/dashboard/master-data/shifts', label: 'Shifts', icon: Clock, description: 'Shift schedules' },
      { path: '/dashboard/master-data/work-locations', label: 'Work Locations', icon: MapPin, description: 'Office & remote locations' },
      { path: '/dashboard/master-data/holidays', label: 'Holidays', icon: CalendarDays, description: 'Public & company holidays' },
      { path: '/dashboard/master-data/cost-centers', label: 'Cost Center', icon: Wallet, description: 'Cost center categories' },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const MasterDataLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const currentGroup = NAV_GROUPS.find((g) => g.items.some((i) => location.pathname === i.path));
  const [activeTab, setActiveTab] = useState<string>(currentGroup?.key || 'employee');

  const activeGroup = NAV_GROUPS.find((g) => g.key === activeTab) || NAV_GROUPS[0];

  const renderNavButton = (item: NavItem) => {
    const Icon = item.icon;
    const active = location.pathname === item.path;
    return (
      <button
        key={item.path}
        onClick={() => navigate(item.path)}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group w-full relative',
          active
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-foreground/70 hover:bg-muted hover:text-foreground'
        )}
      >
        <span
          className={cn(
            'absolute left-0 w-0.5 h-5 rounded-r-full bg-primary transition-opacity',
            active ? 'opacity-100' : 'opacity-0'
          )}
        />
        <div
          className={cn(
            'h-8 w-8 rounded-md flex items-center justify-center shrink-0 transition-colors',
            active ? 'bg-primary/15' : 'bg-muted group-hover:bg-muted/80'
          )}
        >
          <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-tight">{item.label}</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">{item.description}</p>
        </div>
        <ChevronRight className={cn('h-4 w-4 shrink-0 transition-opacity', active ? 'opacity-60' : 'opacity-0 group-hover:opacity-30')} />
      </button>
    );
  };

  return (
    <div className="flex gap-6 min-h-[calc(100vh-120px)]">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0">
        {/* Module header */}
        <div className="flex items-center gap-3 px-4 py-4 mb-2 rounded-xl bg-primary/5 border border-primary/10">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm leading-tight">Master Data Setting</p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">Core data management</p>
          </div>
        </div>

        {/* Tab selector */}
        <div className="flex rounded-lg bg-muted p-0.5 mb-3">
          {NAV_GROUPS.map((group) => (
            <button
              key={group.key}
              onClick={() => {
                setActiveTab(group.key);
                navigate(group.items[0].path);
              }}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                activeTab === group.key
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {group.label}
            </button>
          ))}
        </div>

        {/* Navigation items for active tab */}
        <nav className="flex flex-col gap-0.5">
          {activeGroup.items.map(renderNavButton)}
        </nav>
      </aside>

      {/* Mobile: top tabs */}
      <div className="lg:hidden w-full">
        {/* Group tabs */}
        <div className="flex gap-2 mb-3 border-b pb-2">
          {NAV_GROUPS.map((group) => (
            <button
              key={group.key}
              onClick={() => {
                setActiveTab(group.key);
                navigate(group.items[0].path);
              }}
              className={cn(
                'text-sm font-medium pb-1 border-b-2 transition-colors',
                activeTab === group.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {group.label}
            </button>
          ))}
        </div>
        {/* Page tabs within group */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {activeGroup.items.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
        <Outlet />
      </div>

      {/* Desktop: main content */}
      <div className="hidden lg:block flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
};

export default MasterDataLayout;
