import { NextResponse } from 'next/server';
import { upstream } from '@/lib/api/upstream';
import { getSession, destroySession } from '@/lib/auth/session';
import { refreshOnce } from '@/lib/auth/refresh';
import type { ApiErrorEnvelope } from '@/lib/api/contracts';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channelId') || undefined;

  let session = await getSession();
  const headers: Record<string, string> = {};
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  let { data, response } = await upstream.GET('/videos', {
    params: {
      query: {
        ...(channelId ? { channelId } : {}),
      },
    },
    headers,
  });

  if (response.status === 401 && session?.refreshToken) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      session = await getSession();
      const retryHeaders: Record<string, string> = {};
      if (session?.accessToken) {
        retryHeaders.Authorization = `Bearer ${session.accessToken}`;
      }
      const retryRes = await upstream.GET('/videos', {
        params: {
          query: {
            ...(channelId ? { channelId } : {}),
          },
        },
        headers: retryHeaders,
      });
      data = retryRes.data;
      response = retryRes.response;
    } else {
      await destroySession();
    }
  }

  if (!response.ok || !data) {
    return NextResponse.json<ApiErrorEnvelope>(
      {
        statusCode: response.status,
        error: 'FETCH_FAILED',
        message: 'Falha ao buscar vídeos',
        code: null,
      },
      {
        status: response.status,
      },
    );
  }

  const normalized = Array.isArray(data)
    ? data.map((v) => ({
        ...v,
        id: v.publicId,
        public_id: v.publicId,
        file_size: v.fileSize,
        duration_seconds: v.durationInSeconds,
        thumbnail_key: v.thumbnailKey,
        created_at: v.createdAt,
      }))
    : data;

  return NextResponse.json(normalized);
}
