import { NextResponse } from 'next/server';
import { upstream } from '@/lib/api/upstream';
import { getSession, destroySession } from '@/lib/auth/session';
import { withAuthenticatedUpstream, refreshOnce } from '@/lib/auth/refresh';
import type { ApiErrorEnvelope, VideoResponseDto } from '@/lib/api/contracts';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let session = await getSession();
  const headers: Record<string, string> = {};
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  let { data, error, response } = await upstream.GET('/videos/{publicId}', {
    params: { path: { publicId: id } },
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
      const retryRes = await upstream.GET('/videos/{publicId}', {
        params: { path: { publicId: id } },
        headers: retryHeaders,
      });
      data = retryRes.data;
      error = retryRes.error;
      response = retryRes.response;
    } else {
      await destroySession();
    }
  }

  if (error || !data) {
    return NextResponse.json<ApiErrorEnvelope>(
      (error as ApiErrorEnvelope) || { error: 'Vídeo não encontrado' },
      { status: response.status || 404 },
    );
  }

  const v = data as Record<string, unknown>;
  const normalized = {
    ...v,
    id: (v.publicId as string) || (v.id as string) || id,
    public_id: (v.publicId as string) || (v.id as string) || id,
    file_size: v.fileSize ?? v.file_size,
    duration_seconds: v.durationInSeconds ?? v.duration_seconds,
    thumbnail_key: v.thumbnailKey ?? v.thumbnail_key,
    created_at: v.createdAt ?? v.created_at,
  };

  return NextResponse.json(normalized);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const { data, error, response } = await withAuthenticatedUpstream((accessToken) =>
    upstream.PATCH('/videos/{publicId}', {
      params: { path: { publicId: id } },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: body as never,
    }),
  );

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  return NextResponse.json<VideoResponseDto>(data as VideoResponseDto, {
    status: 200,
  });
}
