export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  const range = request.headers.get('range');

  const headers: Record<string, string> = {};
  if (range) {
    headers['range'] = range;
  }

  try {
    const upstreamRes = await fetch(`${apiUrl}/videos/${id}/stream`, {
      headers,
    });

    const responseHeaders = new Headers();
    upstreamRes.headers.forEach((val, key) => {
      responseHeaders.set(key, val);
    });

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
