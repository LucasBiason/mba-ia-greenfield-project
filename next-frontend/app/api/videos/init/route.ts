import { NextResponse } from 'next/server';
import { upstream } from '@/lib/api/upstream';
import { withAuthenticatedUpstream } from '@/lib/auth/refresh';
import type { UploadResponseDto, ApiErrorEnvelope } from '@/lib/api/contracts';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { title, fileSize, mimeType, fileName, idempotencyKey } = body;

  const { data, error, response } = await withAuthenticatedUpstream((accessToken) =>
    upstream.POST('/videos/upload/init', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: {
        fileSize: Number(fileSize),
        mimeType: String(mimeType || 'video/mp4'),
        fileName: String(fileName || 'video.mp4'),
        ...(title ? { title: String(title) } : {}),
        ...(idempotencyKey ? { idempotencyKey: String(idempotencyKey) } : {}),
      } as never,
    }),
  );

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  return NextResponse.json<UploadResponseDto>(data as UploadResponseDto, {
    status: 201,
  });
}
