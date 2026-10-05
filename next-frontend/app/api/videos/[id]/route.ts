import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const apiUrl = process.env.API_URL || 'http://localhost:3000';

  try {
    const res = await fetch(`${apiUrl}/videos/${id}`, {
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'VIDEO_NOT_FOUND', message: 'Video not found' },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'UPSTREAM_ERROR', message: msg },
      { status: 502 },
    );
  }
}
