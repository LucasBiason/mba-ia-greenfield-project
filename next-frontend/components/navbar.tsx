'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Film,
  UploadCloud,
  Home,
  PlayCircle,
  LogIn,
  LogOut,
  UserPlus,
  Loader2,
} from 'lucide-react';
import { useSession } from '@/components/auth/session-provider';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await fetch('/api/auth/logout', { method: 'POST' });
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setLoggingOut(false);
    }
  };

  const isLoggedIn = Boolean(session?.isLoggedIn);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center shadow-md shadow-red-500/20 group-hover:scale-105 transition-transform">
              <PlayCircle className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-black tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-300 bg-clip-text text-transparent">
              StreamTube
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            <Link
              href="/"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                pathname === '/'
                  ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Home className="w-4 h-4" />
              Início
            </Link>
            <Link
              href={isLoggedIn ? '/studio' : '/login?callbackUrl=/studio'}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                pathname === '/studio'
                  ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Film className="w-4 h-4" />
              Studio
            </Link>
          </nav>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <>
              <Link
                href="/studio/upload"
                className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg shadow-sm shadow-red-500/25 transition-all"
              >
                <UploadCloud className="w-4 h-4" />
                <span className="hidden sm:inline">Enviar Vídeo</span>
              </Link>

              <div className="flex items-center gap-2 pl-3 border-l border-zinc-200 dark:border-zinc-800">
                <Link
                  href="/studio"
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  title="Meu Canal"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-600 to-rose-500 text-white flex items-center justify-center text-xs font-bold shadow-sm">
                    {session.channelSlug ? session.channelSlug[0].toUpperCase() : 'C'}
                  </div>
                  <span className="hidden sm:inline-block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    @{session.channelSlug || 'canal'}
                  </span>
                </Link>

                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  title="Sair da conta"
                  className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ml-1"
                >
                  {loggingOut ? (
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                  ) : (
                    <LogOut className="w-4 h-4" />
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>Entrar</span>
              </Link>
              <Link
                href="/signup"
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg shadow-sm shadow-red-500/25 transition-all"
              >
                <UserPlus className="w-4 h-4" />
                <span>Criar Conta</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
