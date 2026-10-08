'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  Download,
  Share2,
  Calendar,
  HardDrive,
  Video as VideoIcon,
  CheckCircle,
  Clock,
  Sparkles,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { Navbar } from '@/components/navbar';

interface VideoData {
  id?: string;
  publicId?: string;
  public_id?: string;
  title: string | null;
  description: string | null;
  status: string;
  visibility: string;
  fileSize?: string | number;
  file_size?: string | number;
  durationInSeconds?: number | null;
  duration_seconds?: number | null;
  resolution?: string | null;
  video_key?: string;
  videoKey?: string;
  thumbnail_key?: string | null;
  thumbnailKey?: string | null;
  createdAt?: string;
  created_at?: string;
  channel?: {
    id: string;
    nickname: string;
    description: string | null;
  };
}

export default function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [video, setVideo] = useState<VideoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadVideo() {
      try {
        setLoading(true);
        const res = await fetch(`/api/videos/${id}`);
        if (!res.ok) {
          throw new Error('Vídeo não encontrado ou indisponível.');
        }
        const data = await res.json();
        setVideo(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    loadVideo();
  }, [id]);

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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

  const videoPublicId = video?.publicId || video?.public_id || id;
  const fileSize = video?.fileSize ?? video?.file_size;
  const durationSeconds = video?.durationInSeconds ?? video?.duration_seconds;
  const createdAt = video?.createdAt ?? video?.created_at;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para o Feed
          </Link>
        </div>

        {loading ? (
          <div className="aspect-video w-full max-w-5xl mx-auto rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center animate-pulse">
            <VideoIcon className="w-12 h-12 text-zinc-700 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-8 rounded-2xl bg-red-950/40 border border-red-800 text-center max-w-2xl mx-auto my-12">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-red-200">Não foi possível reproduzir o vídeo</h2>
            <p className="text-sm text-red-300 mt-2">{error}</p>
            <Link
              href="/"
              className="inline-block mt-4 px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              Voltar à página inicial
            </Link>
          </div>
        ) : video ? (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Player Container */}
            <div className="relative aspect-video w-full rounded-3xl overflow-hidden bg-black shadow-2xl border border-zinc-800/80">
              <video
                controls
                autoPlay
                playsInline
                preload="metadata"
                poster={`/api/videos/${videoPublicId}/thumbnail`}
                className="w-full h-full object-contain"
                src={`/api/videos/${videoPublicId}/stream`}
              >
                <source
                  src={`/api/videos/${videoPublicId}/stream`}
                  type="video/mp4"
                />
                Seu navegador não suporta a reprodução de tags de vídeo HTML5.
              </video>
            </div>

            {/* Video Header & Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  {video.title || 'Vídeo sem título'}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 mt-2">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {createdAt ? new Date(createdAt).toLocaleDateString('pt-BR') : 'Hoje'}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDuration(durationSeconds)}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5" />
                    {formatFileSize(fileSize)}
                  </span>
                  {video.resolution && (
                    <>
                      <span>•</span>
                      <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-medium">
                        {video.resolution}
                      </span>
                    </>
                  )}
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-semibold uppercase tracking-wider text-[10px]">
                    {video.status}
                  </span>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-2.5">
                <a
                  href={`/api/videos/${videoPublicId}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Download Original</span>
                </a>

                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors shadow-sm"
                >
                  <Share2 className="w-4 h-4 text-sky-400" />
                  <span>{copied ? 'Link Copiado!' : 'Compartilhar'}</span>
                </button>
              </div>
            </div>

            {/* Channel Info & Description */}
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center font-bold text-white shadow-md">
                    {video.channel?.nickname ? video.channel.nickname[0].toUpperCase() : 'C'}
                  </div>
                  <div>
                    <div className="text-base font-bold text-white flex items-center gap-1.5">
                      {video.channel?.nickname || 'Canal Criador'}
                      <CheckCircle className="w-4 h-4 text-red-500 fill-red-500/20" />
                    </div>
                    <div className="text-xs text-zinc-400">StreamTube Creator</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-800/70 px-3 py-1.5 rounded-xl border border-zinc-700/50">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Streaming HTTP 206 RFC 7233</span>
                </div>
              </div>

              {video.description && (
                <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed pt-2 border-t border-zinc-800/60">
                  {video.description}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
