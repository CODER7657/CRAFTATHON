'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRole } from './RoleContext';
import { LayoutDashboard, BarChart3, ScrollText, LogOut, Shield, User } from 'lucide-react';

export default function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { name, role, jurisdiction } = useRole();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const navs = [
    { label: 'Cases', href: '/cases', icon: LayoutDashboard },
    { label: 'Analytics', href: '/analytics', icon: BarChart3 },
    { label: 'Audit Log', href: '/audit', icon: ScrollText },
  ];

  return (
    <aside className="w-72 bg-gradient-sidebar text-white flex flex-col min-h-screen relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M20 20.5V18H0v-2h20v-2l2 3-2 3zM0 20.5V18h20v-2H0v-2l-2 3 2 3z'/%3E%3C/g%3E%3C/svg%3E")`
      }} />

      {/* Brand Section */}
      <div className="relative p-5 pb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Authority Portal</h2>
            <p className="text-[10px] uppercase tracking-[0.15em] text-navy-400 font-semibold">POCSO Shield</p>
          </div>
        </div>

        {/* User Card */}
        <div className="glass-card-dark rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-navy-900 font-bold text-sm shadow-md">
              {name?.charAt(0)?.toUpperCase() || <User className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{name}</p>
              <p className="text-xs text-navy-400 capitalize truncate">{role} · {jurisdiction}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 relative">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-navy-500 px-3 mb-2">Navigation</p>
        <ul className="space-y-1">
          {navs.map(nav => {
            const isActive = pathname.startsWith(nav.href);
            const Icon = nav.icon;
            return (
              <li key={nav.href}>
                <Link 
                  prefetch={false} 
                  href={nav.href} 
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                    ${isActive 
                      ? 'bg-amber-500/15 text-amber-400 shadow-sm border border-amber-400/10' 
                      : 'text-navy-300 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-amber-400' : 'text-navy-500'}`} />
                  {nav.label}
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sign Out */}
      <div className="relative p-4 border-t border-white/5">
        <button 
          onClick={handleLogout} 
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-navy-400 hover:text-rose-400 rounded-xl hover:bg-rose-500/10 transition-all duration-200"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
