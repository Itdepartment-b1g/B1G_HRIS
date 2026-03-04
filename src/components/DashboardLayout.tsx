import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Building2, ChevronDown, Search, Bell, LogOut, User, Settings, Menu, X } from 'lucide-react';
import { Employee } from '@/data/mockData';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface NavDropdown {
  label: string;
  items: { label: string; path: string }[];
}

const navDropdowns: NavDropdown[] = [
  {
    label: 'Core',
    items: [
      { label: 'Company Profile', path: '/dashboard/settings' },
      { label: 'Org Chart', path: '/dashboard/employees' },
    ],
  },
  {
    label: 'Time Attendance',
    items: [
      { label: 'Attendance', path: '/dashboard/attendance' },
      { label: 'Leave', path: '/dashboard/leave' },
      { label: 'Overtime', path: '/dashboard/overtime' },
      { label: 'Business Trip', path: '/dashboard/business-trip' },
      { label: 'Attendance Correction', path: '/dashboard/correction' },
    ],
  },
  {
    label: 'Activity',
    items: [
      { label: 'Announcements', path: '/dashboard/announcements' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Attendance Report', path: '/dashboard/reports' },
    ],
  },
];

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<Employee | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('hris_user');
    if (!stored) {
      navigate('/');
      return;
    }
    setUser(JSON.parse(stored));
  }, [navigate]);

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

  const handleLogout = () => {
    localStorage.removeItem('hris_user');
    navigate('/');
  };

  if (!user) return null;

  const initials = `${user.first_name[0]}${user.last_name[0]}`;

  return (
    <div className="flex flex-col min-h-screen bg-background" ref={dropdownRef}>
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 bg-card border-b" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between h-14 px-4 lg:px-6 max-w-[1440px] mx-auto w-full">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 shrink-0">
              <Building2 className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold text-primary">B1G</span>
            </button>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {navDropdowns.map((dropdown) => (
                <div key={dropdown.label} className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === dropdown.label ? null : dropdown.label)}
                    className={cn(
                      "flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                      openDropdown === dropdown.label
                        ? "text-primary bg-primary/5"
                        : "text-foreground/70 hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {dropdown.label}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", openDropdown === dropdown.label && "rotate-180")} />
                  </button>
                  {openDropdown === dropdown.label && (
                    <div className="absolute top-full left-0 mt-1 w-52 bg-card rounded-lg border py-1.5" style={{ boxShadow: 'var(--shadow-lg)' }}>
                      {dropdown.items.map((item) => (
                        <button
                          key={item.path}
                          onClick={() => {
                            navigate(item.path);
                            setOpenDropdown(null);
                          }}
                          className={cn(
                            "w-full text-left px-4 py-2 text-sm transition-colors",
                            location.pathname === item.path
                              ? "text-primary bg-primary/5 font-medium"
                              : "text-foreground/70 hover:text-foreground hover:bg-muted"
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </div>

          {/* Right: Search + Notifications + Profile */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center relative">
              <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search"
                className="pl-9 w-48 h-9 bg-muted/50 border-0 focus-visible:bg-card focus-visible:border focus-visible:ring-0"
              />
              <kbd className="absolute right-3 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">Ctrl+/</kbd>
            </div>

            <Button variant="ghost" size="icon" className="relative text-foreground/60 hover:text-foreground">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-primary rounded-full" />
            </Button>

            {/* Profile */}
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2"
              >
                <Avatar className="h-8 w-8 border-2 border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
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
                  <button className="w-full text-left px-4 py-2 text-sm text-foreground/70 hover:bg-muted flex items-center gap-2">
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

            {/* Mobile menu toggle */}
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t bg-card px-4 py-3 space-y-2">
            {navDropdowns.map((dropdown) => (
              <div key={dropdown.label}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">{dropdown.label}</p>
                {dropdown.items.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm rounded-lg",
                      location.pathname === item.path ? "text-primary bg-primary/5 font-medium" : "text-foreground/70"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </header>

      {/* Page Content */}
      <main className="flex-1 p-4 lg:p-6 max-w-[1440px] mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
