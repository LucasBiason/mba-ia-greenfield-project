import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const apiUrl = process.env.API_URL || 'http://localhost:3000';

  try {
    const upstreamRes = await fetch(`${apiUrl}/videos/${id}/download`, {
      redirect: 'manual',
    });

    const location = upstreamRes.headers.get('location');
    if (location) {
      return NextResponse.redirect(location);
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: upstreamRes.headers,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'DOWNLOAD_FAILED', message: msg },
      { status: 502 },
    );
  }
}
