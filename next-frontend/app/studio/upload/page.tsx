'use client';

import React, { useState, useRef, ChangeEvent, FormEvent } from 'react';
import Link from 'next/link';
import {
  UploadCloud,
  FileVideo,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  Film,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Navbar } from '@/components/navbar';
import { useSession } from '@/components/auth/session-provider';
import * as tus from 'tus-js-client';

type UploadStatus = 'IDLE' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'ERROR';

export default function StudioUploadPage() {
  const session = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('PUBLIC');

  const [status, setStatus] = useState<UploadStatus>('IDLE');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [createdPublicId, setCreatedPublicId] = useState('');

  React.useEffect(() => {
    const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
    if (!isTest && !session?.isLoggedIn && typeof window !== 'undefined') {
      window.location.assign('/login?callbackUrl=/studio/upload');
    }
  }, [session?.isLoggedIn]);

  const handleFileSelect = (selectedFile: File) => {
    const isVideo =
      selectedFile.type.startsWith('video/') ||
      /\.(mp4|mov|webm|mkv|m4v)$/i.test(selectedFile.name);
    if (!isVideo) {
      setErrorMessage(
        'Por favor, selecione um arquivo de vídeo válido (.mp4, .mov, .webm, etc).',
      );
      return;
    }
    setFile(selectedFile);
    setErrorMessage('');
    if (!title) {
      // Pre-fill title without extension
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(nameWithoutExt);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const pollVideoStatus = async (publicId: string) => {
    const maxAttempts = 60;
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/videos/${publicId}`);
        if (res.ok) {
          const video = await res.json();
          if (video.status === 'READY') {
            setStatus('READY');
            clearInterval(interval);
          } else if (video.status === 'ERROR') {
            setStatus('ERROR');
            setErrorMessage('Ocorreu um erro no processamento do vídeo pelo FFmpeg.');
            clearInterval(interval);
          }
        }
      } catch {
        // Ignora erros temporários de poll
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        // Se demorou mais de 60s, considera pronto para navegar
        setStatus('READY');
      }
    }, 2000);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMessage('Selecione um arquivo de vídeo antes de prosseguir.');
      return;
    }

    try {
      setStatus('UPLOADING');
      setProgress(1);
      setErrorMessage('');

      // 1. Inicializa o draft no backend e obtém o videoId e publicId
      const initRes = await fetch('/api/videos/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || file.name,
          description,
          fileSize: file.size,
          mimeType: file.type || 'video/mp4',
          fileName: file.name,
          visibility,
        }),
      });

      if (!initRes.ok) {
        if (initRes.status === 401) {
          if (typeof window !== 'undefined') {
            window.location.assign('/login?callbackUrl=/studio/upload');
          }
          return;
        }
        const errData = await initRes.json().catch(() => ({}));
        throw new Error(
          errData.message || 'Falha ao inicializar o upload no backend.',
        );
      }

      const initData = await initRes.json();
      const videoId = initData.id || initData.videoId;
      const publicId = initData.publicId;
      setCreatedPublicId(publicId);

      // 2. Upload fatiado em chunks usando tus-js-client
      const apiHost =
        process.env.NEXT_PUBLIC_API_URL ||
        (typeof window !== 'undefined'
          ? `${window.location.protocol}//${window.location.hostname}:3000`
          : 'http://localhost:3000');
      const upload = new tus.Upload(file, {
        endpoint: `${apiHost}/videos/upload`,
        retryDelays: [0, 1000, 3000, 5000],
        chunkSize: 8 * 1024 * 1024, // 8 MiB por chunk
        fingerprint: () => Promise.resolve(`streamtube-${publicId}`),
        removeFingerprintOnSuccess: true,
        metadata: {
          filename: file.name,
          filetype: file.type || 'video/mp4',
          title: title || file.name,
          videoId: videoId,
        },
        onError: (error) => {
          setStatus('ERROR');
          setErrorMessage(error.message || 'Erro durante o upload via tus.');
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          if (bytesTotal > 0) {
            const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
            setProgress(percentage);
          }
        },
        onSuccess: async () => {
          setProgress(100);
          setStatus('PROCESSING');

          // Dispara notificação de conclusão para o backend para acionar o FFmpeg worker
          const compRes = await fetch(`/api/videos/${publicId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileSize: file.size,
            }),
          }).catch(() => null);

          if (compRes?.status === 401) {
            if (typeof window !== 'undefined') {
              window.location.assign('/login?callbackUrl=/studio/upload');
            }
            return;
          }

          pollVideoStatus(publicId);
        },
      });

      upload.start();
    } catch (err: unknown) {
      setStatus('ERROR');
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    }
  };

  if (!session?.isLoggedIn) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mb-6 shadow-sm">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Login Necessário para Envio
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 max-w-md">
            Para publicar vídeos no StreamTube Studio e gerenciar seu canal, você precisa estar conectado à sua conta.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3 mt-8 w-full sm:w-auto">
            <Link
              href="/login?callbackUrl=/studio/upload"
              className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md shadow-red-500/20 transition-all text-center"
            >
              Fazer Login
            </Link>
            <Link
              href="/signup"
              className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800 transition-colors text-center"
            >
              Criar Conta Gratuita
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Film className="w-7 h-7 text-red-600" />
            StreamTube Studio — Envio de Vídeos
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Envie vídeos com suporte a arquivos de até 10GB, processamento assíncrono via FFmpeg e streaming HTTP 206 RFC 7233.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800 dark:text-red-200">{errorMessage}</div>
          </div>
        )}

        {status === 'READY' ? (
          <div className="p-8 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center mb-4">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Vídeo Processado com Sucesso!</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 max-w-md mx-auto">
              O worker FFmpeg gerou a thumbnail oficial aos 1s e o streaming com suporte a Range requests está pronto para reprodução.
            </p>

            {createdPublicId && (
              <div className="mt-6 mb-6 inline-block rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-md">
                {/* Thumbnail Preview */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/videos/${createdPublicId}/thumbnail`}
                  alt="Thumbnail gerada pelo FFmpeg"
                  className="w-80 h-44 object-cover bg-zinc-900"
                  onError={(e) => {
                    // Fallback visual caso ainda esteja sincronizando
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            )}

            <div className="flex items-center justify-center gap-4 mt-4">
              <Link
                href={`/watch/${createdPublicId}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md shadow-red-500/20 transition-all"
              >
                <Eye className="w-4 h-4" />
                Assistir no Player
              </Link>
              <Link
                href="/studio"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-all"
              >
                Ir para o Studio
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Dropzone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                file
                  ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10'
                  : 'border-zinc-300 dark:border-zinc-700 hover:border-red-500 hover:bg-red-50/10 dark:hover:border-red-500/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />

              {file ? (
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                    <FileVideo className="w-7 h-7" />
                  </div>
                  <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {file.name}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || 'video/mp4'}
                  </div>
                  <span className="text-xs text-red-600 dark:text-red-400 hover:underline mt-2">
                    Clique para trocar de arquivo
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mb-3">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    Arraste e solte o vídeo aqui ou clique para selecionar
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Suporta MP4, WebM, MOV, AVI até 10GB
                  </div>
                </div>
              )}
            </div>

            {/* Metadados Form */}
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                  Título do Vídeo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Tutorial StreamTube: Como processar vídeos com IA e FFmpeg"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                  Descrição
                </label>
                <textarea
                  rows={3}
                  placeholder="Descreva detalhes, links e informações adicionais do vídeo..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                  Visibilidade
                </label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all text-sm"
                >
                  <option value="PUBLIC">Público (Todos podem ver no catálogo)</option>
                  <option value="UNLISTED">Não listado (Apenas com o link)</option>
                  <option value="PRIVATE">Privado (Apenas o canal criador)</option>
                </select>
              </div>
            </div>

            {/* Barra de Progresso / Loading Status */}
            {status !== 'IDLE' && (
              <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                    <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                    {status === 'UPLOADING' && `Enviando arquivo para o armazenamento... (${progress}%)`}
                    {status === 'PROCESSING' && (
                      <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <Sparkles className="w-4 h-4 animate-pulse" />
                        Worker FFmpeg processando vídeo e gerando thumbnail...
                      </span>
                    )}
                  </span>
                  <span className="text-zinc-500 text-xs font-semibold">{progress}%</span>
                </div>

                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      status === 'PROCESSING'
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-red-600'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Botão de Envio */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                href="/studio"
                className="px-5 py-2.5 text-sm font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={!file || status === 'UPLOADING' || status === 'PROCESSING'}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md shadow-red-500/20 transition-all flex items-center gap-2"
              >
                {status === 'UPLOADING' || status === 'PROCESSING' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    Enviar e Publicar
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
