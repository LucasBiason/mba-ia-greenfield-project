'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Film,
  UploadCloud,
  Play,
  Download,
  HardDrive,
  Calendar,
  AlertCircle,
  RefreshCw,
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
}

export default function StudioPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadVideos = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/videos');
      if (!res.ok) {
        throw new Error('Falha ao carregar vídeos do Studio.');
      }
      const data = await res.json();
      setVideos(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/videos')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (active) {
          setVideos(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const formatFileSize = (bytes: string | number | undefined) => {
    if (!bytes) return 'N/A';
    const num = Number(bytes);
    if (isNaN(num)) return 'N/A';
    return (num / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <Film className="w-7 h-7 text-red-600" />
              StreamTube Creator Studio
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Gerencie seus vídeos, acompanhe o processamento de thumbnails e acesse downloads originais.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadVideos}
              className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Recarregar vídeos"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <Link
              href="/studio/upload"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl shadow-md shadow-red-500/20 transition-all"
            >
              <UploadCloud className="w-4 h-4" />
              Enviar Novo Vídeo
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 animate-pulse"
              >
                <div className="aspect-video w-full rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4" />
                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
            <Film className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Nenhum vídeo enviado ainda</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
              Seu canal ainda não possui vídeos. Clique no botão abaixo para começar a enviar!
            </p>
            <Link
              href="/studio/upload"
              className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md shadow-red-500/20"
            >
              <UploadCloud className="w-4 h-4" />
              Enviar Primeiro Vídeo
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((vid) => (
              <div
                key={vid.id}
                className="group flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm hover:shadow-md transition-all"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-zinc-900 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/videos/${vid.public_id}/thumbnail`}
                    alt={vid.title || 'Thumbnail do vídeo'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />

                  {/* Status Badge */}
                  <div className="absolute top-2.5 left-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        vid.status === 'READY'
                          ? 'bg-emerald-500/90 text-white'
                          : vid.status === 'PROCESSING'
                          ? 'bg-amber-500/90 text-white animate-pulse'
                          : 'bg-zinc-700/90 text-zinc-100'
                      }`}
                    >
                      {vid.status}
                    </span>
                  </div>

                  {/* Duration Badge */}
                  {vid.duration_seconds && (
                    <div className="absolute bottom-2.5 right-2.5 bg-black/80 px-2 py-0.5 rounded text-white text-[11px] font-semibold">
                      {formatDuration(vid.duration_seconds)}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50 line-clamp-1 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                      {vid.title || 'Vídeo sem título'}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      {vid.description || 'Sem descrição informada.'}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5" />
                      {formatFileSize(vid.file_size)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(vid.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link
                      href={`/watch/${vid.public_id}`}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 text-red-600 fill-red-600" />
                      Assistir
                    </Link>

                    <a
                      href={`/api/videos/${vid.public_id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-500" />
                      Download
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
