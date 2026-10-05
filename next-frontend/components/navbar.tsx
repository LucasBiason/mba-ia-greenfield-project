'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Film, UploadCloud, Home, PlayCircle } from 'lucide-react';
import { useSession } from '@/components/auth/session-provider';

export function Navbar() {
  const pathname = usePathname();
  const session = useSession();

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
              href="/studio"
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
          <Link
            href="/studio/upload"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg shadow-sm shadow-red-500/25 transition-all hover:shadow"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Enviar Vídeo</span>
          </Link>

          <div className="flex items-center gap-2 pl-3 border-l border-zinc-200 dark:border-zinc-800">
            <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-700 dark:text-zinc-300">
              {session?.channelSlug ? session.channelSlug[0].toUpperCase() : 'U'}
            </div>
            <span className="hidden sm:inline-block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {session?.channelSlug || 'Meu Canal'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
