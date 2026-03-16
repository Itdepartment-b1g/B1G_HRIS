import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  Search,
  Bell,
  LogOut,
  User,
  Settings,
  Menu,
  X,
  Building2,
} from 'lucide-react';
import type { Employee } from '@/types';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, getAvatarFallback } from '@/lib/utils';
import { navDropdowns } from '@/lib/navConfig';
import type { NavDropdown } from '@/lib/navConfig';
import MobileBottomNav from '@/components/MobileBottomNav';
import ActivityPopup from '@/components/ActivityPopup';
import { ActivityComplianceProvider } from '@/contexts/ActivityComplianceContext';

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useCurrentUser();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/');
  }, [loading, user, navigate]);

  // Record / refresh current session for Active Sessions tracking
  useEffect(() => {
    if (!user) return;
    const record = async () => {
      const { supabase } = await import('@/lib/supabase');

      const ua = navigator.userAgent;
      let platform = 'Unknown Platform';
      let browser = 'Unknown Browser';

      if (/iPhone/.test(ua)) platform = `iPhone - iOS ${ua.match(/OS (\d+[_\d]*)/)?.[1]?.replace(/_/g, '.') || ''}`;
      else if (/iPad/.test(ua)) platform = `iPad - iOS ${ua.match(/OS (\d+[_\d]*)/)?.[1]?.replace(/_/g, '.') || ''}`;
      else if (/Android/.test(ua)) platform = `Android ${ua.match(/Android ([\d.]+)/)?.[1] || ''}`;
      else if (/Mac OS X/.test(ua)) platform = `macOS ${ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') || ''}`;
      else if (/Windows/.test(ua)) platform = `Windows ${ua.match(/Windows NT ([\d.]+)/)?.[1] || ''}`;
      else if (/Linux/.test(ua)) platform = 'Linux';

      if (/Chrome\//.test(ua) && !/Edg/.test(ua)) browser = `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1] || ''}`;
      else if (/Firefox\//.test(ua)) browser = `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1] || ''}`;
      else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = `Safari ${ua.match(/Version\/([\d.]+)/)?.[1] || ''}`;
      else if (/Edg\//.test(ua)) browser = `Edge ${ua.match(/Edg\/([\d.]+)/)?.[1] || ''}`;

      const existingId = localStorage.getItem('b1g_session_id');

      if (existingId) {
        const { error } = await supabase
          .from('user_sessions')
          .update({ last_active: new Date().toISOString(), platform, browser })
          .eq('id', existingId)
          .eq('user_id', user.id);
        if (!error) return;
      }

      const { data, error } = await supabase
        .from('user_sessions')
        .insert({
          user_id: user.id,
          session_token: crypto.randomUUID(),
          platform,
          browser,
          last_active: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (!error && data) {
        localStorage.setItem('b1g_session_id', data.id);
      } else {
        console.error('Failed to record session:', error);
      }
    };
    record();
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await import('@/lib/supabase').then(({ supabase }) => supabase.auth.signOut());
    navigate('/');
  };

  if (loading || !user) return null;

  const initials = getAvatarFallback(user.first_name, user.last_name);

  return (
    <ActivityComplianceProvider userId={user?.id}>
    <div className="flex flex-col min-h-screen bg-background" ref={dropdownRef}>
      {/* Top Navbar - hidden on mobile, visible on desktop */}
      <header className="hidden lg:block sticky top-0 z-50 border-b border-white/10 bg-black" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between h-16 lg:h-[72px] px-4 lg:px-6 max-w-[1440px] mx-auto w-full">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 shrink-0">
              <Building2 className="h-6 w-6 text-white" />
              <span className="text-lg font-bold text-white">B1G</span>
            </button>

            {/* Desktop Nav - hover opens dropdown */}
            <nav className="hidden lg:flex items-center gap-1">
              {navDropdowns.filter((d) => !d.hidden).map((dropdown) => (
                <div
                  key={dropdown.label}
                  className="relative"
                  onMouseEnter={() => setOpenDropdown(dropdown.label)}
                  onMouseLeave={() => setOpenDropdown(null)}
                >
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors",
                      openDropdown === dropdown.label
                        ? "bg-white text-gray-900"
                        : "text-gray-200 hover:text-white hover:bg-white/10"
                    )}
                  >
                    {dropdown.label}
                    {openDropdown === dropdown.label ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {openDropdown === dropdown.label ? (
                    <div className={cn("absolute top-full left-0 pt-1", dropdown.grid ? "w-[380px]" : "w-[320px]")}>
                      <div className="bg-white rounded-lg border border-gray-200 py-4 px-4 shadow-xl">
                        <div className={cn(
                          "gap-2",
                          dropdown.grid ? "grid grid-cols-2 gap-3" : "flex flex-col"
                        )}>
                          {dropdown.items
                            .filter((item) => !item.roles || (user?.roles && item.roles.some((r) => user.roles!.includes(r))))
                            .map((item) => {
                            const Icon = item.icon;
                            return (
                              <button
                                key={item.path}
                                onClick={() => {
                                  navigate(item.path);
                                  setOpenDropdown(null);
                                }}
                                className={cn(
                                  "flex items-start gap-3 rounded-lg text-left transition-colors border border-transparent hover:border-gray-200 hover:bg-gray-50 w-full",
                                  dropdown.grid ? "p-4" : "p-3",
                                  location.pathname === item.path && "bg-primary/5 border-primary/20"
                                )}
                              >
                                <div className={cn(
                                  "shrink-0 rounded-lg flex items-center justify-center",
                                  item.iconBg || "bg-gray-100",
                                  dropdown.grid ? "w-10 h-10" : "w-9 h-9"
                                )}>
                                  <Icon className={cn("h-5 w-5", item.iconColor || "text-gray-600")} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-gray-900 text-sm">{item.label}</p>
                                  {item.description && (
                                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </nav>
          </div>

          {/* Right: Search + Notifications + Profile */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center relative">
              <Search className="absolute left-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search"
                className="pl-9 w-48 h-9 bg-white/10 border-white/20 text-white placeholder:text-gray-400 focus-visible:bg-white/15 focus-visible:border-white/30 focus-visible:ring-0"
              />
              <kbd className="absolute right-3 text-[10px] text-gray-400 bg-white/10 px-1.5 py-0.5 rounded font-mono">Ctrl+/</kbd>
            </div>

            <Button variant="ghost" size="icon" className="relative text-gray-300 hover:text-white hover:bg-white/10">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-primary rounded-full" />
            </Button>

            {/* Profile */}
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2"
              >
                <Avatar className="h-8 w-8 border-2 border-white/30">
                  <AvatarImage src={user?.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="bg-primary text-white text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
              {profileOpen && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-card rounded-lg border py-1.5" style={{ boxShadow: 'var(--shadow-lg)' }}>
                  <div className="px-4 py-2.5 border-b">
                    <p className="text-sm font-semibold text-foreground">{user.first_name} {user.last_name}</p>
                    <p className="text-xs text-muted-foreground">{user.position}</p>
                    <p className="text-[11px] text-primary font-medium mt-0.5">{user.employee_code}</p>
                  </div>
                  <button className="w-full text-left px-4 py-2 text-sm text-foreground/70 hover:bg-muted flex items-center gap-2" onClick={() => { navigate('/dashboard/employee/personal-data'); setProfileOpen(false); }}>
                    <User className="h-4 w-4" /> My Profile
                  </button>
                  <button className="w-full text-left px-4 py-2 text-sm text-foreground/70 hover:bg-muted flex items-center gap-2" onClick={() => { navigate('/dashboard/settings'); setProfileOpen(false); }}>
                    <Settings className="h-4 w-4" /> Settings
                  </button>
                  <div className="border-t mt-1 pt-1">
                    <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/5 flex items-center gap-2">
                      <LogOut className="h-4 w-4" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile menu toggle - hidden when using bottom nav */}
            <div className="lg:hidden w-8" />
          </div>
        </div>

        {/* Mobile Nav - disabled when using bottom nav */}
        {false && mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/10 bg-black px-4 py-3 space-y-2">
            {navDropdowns.filter((d) => !d.hidden).map((dropdown) => (
              <div key={dropdown.label}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 py-1.5">{dropdown.label}</p>
                {dropdown.items
                  .filter((item) => !item.roles || (user?.roles && item.roles.some((r) => user.roles!.includes(r))))
                  .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 text-sm rounded-lg flex items-center gap-3",
                        location.pathname === item.path ? "text-primary bg-primary/20 font-medium" : "text-gray-200"
                      )}
                    >
                      <div className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", item.iconBg || "bg-white/10")}>
                        <Icon className={cn("h-4 w-4", item.iconColor || "text-gray-400")} />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-medium">{item.label}</span>
                        {item.description && (
                          <span className="block text-xs text-gray-500 truncate">{item.description}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </header>

      {/* Page Content - extra padding on mobile for bottom nav */}
      <main className="flex-1 min-h-0 flex flex-col p-4 lg:p-6 max-w-[1440px] mx-auto w-full pb-20 lg:pb-6">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* Activity pop-up: unacknowledged announcements and policies on login */}
      <ActivityPopup />
    </div>
    </ActivityComplianceProvider>
  );
};

export default DashboardLayout;
