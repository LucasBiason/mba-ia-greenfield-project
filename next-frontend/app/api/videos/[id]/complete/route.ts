import { NextResponse } from 'next/server';
import { upstream } from '@/lib/api/upstream';
import { withAuthenticatedUpstream } from '@/lib/auth/refresh';
import type { VideoResponseDto, ApiErrorEnvelope } from '@/lib/api/contracts';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { storageKey, fileSize } = body;

  const { data, error, response } = await withAuthenticatedUpstream((accessToken) =>
    upstream.POST('/videos/{publicId}/complete', {
      params: { path: { publicId: id } },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: {
        ...(storageKey ? { storageKey: String(storageKey) } : {}),
        ...(fileSize ? { fileSize: Number(fileSize) } : {}),
      } as never,
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
