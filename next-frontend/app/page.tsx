'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Play,
  Film,
  UploadCloud,
  HardDrive,
  Clock,
  Sparkles,
  Layers,
  Cpu,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react';
import { Navbar } from '@/components/navbar';

interface VideoItem {
  id: string;
  public_id: string;
  title: string | null;
  description: string | null;
  status: string;
  visibility: string;
  file_size: string | number;
  duration_seconds: number | null;
  resolution: string | null;
  video_key: string;
  thumbnail_key: string | null;
  created_at: string;
  channel?: {
    id: string;
    nickname: string;
  };
}

export default function HomePage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVideos() {
      try {
        setLoading(true);
        const res = await fetch('/api/videos');
        if (res.ok) {
          const data = await res.json();
          setVideos(Array.isArray(data) ? data : []);
        }
      } catch {
        // Fallback gracefully
      } finally {
        setLoading(false);
      }
    }
    fetchVideos();
  }, []);

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-12">
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-black text-white p-8 md:p-12 border border-zinc-800 shadow-xl">
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              StreamTube — Fase 03 Concluída
            </div>

            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
              Streaming de Alta Performance & Processamento por IA
            </h1>

            <p className="text-zinc-400 text-sm md:text-base leading-relaxed">
              Upload em chunks de até 10GB, armazenamento em MinIO S3, filas assíncronas com BullMQ e worker dedicado FFmpeg para extração de metadados e thumbnails.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/studio/upload"
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl shadow-lg shadow-red-600/30 transition-all hover:scale-[1.02]"
              >
                <UploadCloud className="w-4 h-4" />
                Fazer Upload de Vídeo
              </Link>
              <Link
                href="/studio"
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl border border-zinc-700 transition-all"
              >
                <Film className="w-4 h-4" />
                Acessar Creator Studio
              </Link>
            </div>
          </div>

          {/* Feature Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-8 border-t border-zinc-800/80">
            <div className="flex items-center gap-2.5 text-xs text-zinc-300">
              <Cpu className="w-4 h-4 text-red-500" />
              <span>Worker FFmpeg Isolado</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-zinc-300">
              <Layers className="w-4 h-4 text-amber-500" />
              <span>Fila BullMQ + Redis</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-zinc-300">
              <HardDrive className="w-4 h-4 text-sky-500" />
              <span>MinIO S3 Buckets</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-zinc-300">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Streaming HTTP 206</span>
            </div>
          </div>
        </section>

        {/* Catalog Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                <Play className="w-5 h-5 text-red-600 fill-red-600" />
                Vídeos em Destaque
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Explore vídeos enviados com streaming adaptativo e suporte a busca Range
              </p>
            </div>

            <Link
              href="/studio"
              className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
            >
              Ver todos no Studio →
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-3 animate-pulse"
                >
                  <div className="aspect-video w-full rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4" />
                  <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="p-12 text-center rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <Film className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Nenhum vídeo publicado ainda
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                Seja o primeiro a enviar um vídeo para o StreamTube e veja o processamento em tempo real.
              </p>
              <Link
                href="/studio/upload"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                Enviar Primeiro Vídeo
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {videos.map((vid) => (
                <Link
                  key={vid.id}
                  href={`/watch/${vid.public_id}`}
                  className="group flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm hover:shadow-lg transition-all hover:-translate-y-1"
                >
                  {/* Thumbnail Container */}
                  <div className="relative aspect-video bg-zinc-950 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/videos/${vid.public_id}/thumbnail`}
                      alt={vid.title || 'Thumbnail do vídeo'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />

                    {/* Duration Badge */}
                    {vid.duration_seconds && (
                      <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-white text-[10px] font-semibold flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        {formatDuration(vid.duration_seconds)}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 line-clamp-2 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                        {vid.title || 'Vídeo sem título'}
                      </h3>
                      <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                        <span>{vid.channel?.nickname || 'StreamTube Channel'}</span>
                        <CheckCircle className="w-3 h-3 text-red-500 fill-red-500/20" />
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
                      <span>{new Date(vid.created_at).toLocaleDateString('pt-BR')}</span>
                      {vid.resolution && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono text-[10px]">
                          {vid.resolution}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
