import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channelId');

  const targetUrl = new URL(`${apiUrl}/videos`);
  if (channelId) {
    targetUrl.searchParams.set('channelId', channelId);
  }

  try {
    const res = await fetch(targetUrl.toString(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'FETCH_ERROR', message: 'Failed to fetch videos' },
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
