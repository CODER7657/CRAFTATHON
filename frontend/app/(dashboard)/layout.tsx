import '@/app/globals.css';
import { redirect } from 'next/navigation';
import DashboardSidebar from '@/components/dashboard/DashboardSidebar';
import { RoleProvider } from '@/components/dashboard/RoleContext';
import { ShieldAlert } from 'lucide-react';
import { cookies } from 'next/headers';
import { AUTH_SESSION_COOKIE, getAuthorityFromToken } from '@/lib/auth/session';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const account = getAuthorityFromToken(token);

  if (!account) {
    redirect('/login');
  }

  const authority = {
    role: 'authority',
    jurisdiction: account.jurisdiction,
    name: account.name,
  };

  if (!authority) {
    return (
      <html lang="en">
        <body className="antialiased font-sans bg-mesh min-h-screen flex items-center justify-center">
          <div className="glass-card p-8 rounded-2xl max-w-md text-center animate-fade-in">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center">
              <ShieldAlert className="w-7 h-7 text-rose-500" />
            </div>
            <h2 className="text-lg font-bold text-navy-800 mb-2">Access Denied</h2>
            <p className="text-sm text-navy-400">Your account doesn&apos;t have an authority role assigned. Please contact your administrator.</p>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex bg-mesh font-sans">
        <RoleProvider authority={authority}>
          <DashboardSidebar />
          <main className="flex-1 flex flex-col h-screen overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 lg:p-8">
              {children}
            </div>
          </main>
        </RoleProvider>
      </body>
    </html>
  );
}
