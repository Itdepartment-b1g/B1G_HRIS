import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Building2, GitBranch, Settings, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard/company/org-structure', label: 'Org Structure', icon: GitBranch, description: 'Visual org chart with drag-and-drop' },
  { path: '/dashboard/company/profile', label: 'Company Profile', icon: Settings, description: 'Company information and details' },
];

const CompanyLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

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
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm leading-tight">Company</p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">Organization & settings</p>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(renderNavButton)}
        </nav>
      </aside>

      {/* Mobile: top tabs */}
      <div className="lg:hidden w-full">
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {NAV_ITEMS.map((item) => {
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

export default CompanyLayout;
