import '@/app/globals.css';
import { Shield, UserCog } from 'lucide-react';
import Link from 'next/link';

export default function ReporterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isMockMode = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000';

  return (
    <html lang="en">
      <body className="antialiased bg-mesh min-h-screen flex flex-col font-sans">
        {/* Header */}
        <header className="relative overflow-hidden bg-gradient-header">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }} />
          
          <div className="relative max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex items-center gap-4">
            {/* Shield Icon */}
            <div className="flex-shrink-0 w-12 h-12 bg-amber-500/20 border border-amber-400/30 rounded-xl flex items-center justify-center animate-float">
              <Shield className="w-6 h-6 text-amber-400" />
            </div>
            
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                POCSO Shield
              </h1>
              <p className="text-sm text-navy-300 mt-0.5 hidden sm:block">
                Secure Anonymous Reporting Platform
              </p>
            </div>

            {/* Decorative accent */}
            <div className="ml-auto hidden sm:flex items-center gap-4 text-xs text-navy-400">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>End-to-End Encrypted</span>
              </div>
              <Link href="/login" className="flex items-center gap-1.5 px-3 py-1.5 border border-navy-500/50 bg-navy-800/50 hover:bg-navy-700/80 text-white rounded-lg transition-colors backdrop-blur-md font-medium shadow-sm">
                <UserCog className="w-4 h-4 text-amber-400" />
                Admin Portal
              </Link>
            </div>
          </div>

          {/* Bottom gradient line */}
          <div className="h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
        </header>

        {/* Main Content */}
        <main className="flex-1 w-full max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-navy-100 bg-white/60 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-navy-400">
            <span>POCSO Shield &copy; {new Date().getFullYear()}</span>
            <span className="flex items-center gap-1.5">
              <Shield className="w-3 h-3" />
              Protected by Zero-Knowledge Proofs
            </span>
          </div>
        </footer>

        {/* Mock Mode Banner */}
        {isMockMode && (
          <div className="fixed bottom-0 w-full bg-gradient-to-r from-amber-500 to-amber-600 text-center py-2.5 font-bold text-sm text-navy-900 z-50 shadow-lg shadow-amber-500/30">
            <span className="inline-flex items-center gap-2">
              ⚠️ MOCK MODE ACTIVE — Zero address contract
            </span>
          </div>
        )}
      </body>
    </html>
  );
}
