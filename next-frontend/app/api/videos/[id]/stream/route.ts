import { upstream } from '@/lib/api/upstream';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const range = request.headers.get('range');

  const headers: Record<string, string> = {};
  if (range) {
    headers['range'] = range;
  }

  try {
    const { response } = await upstream.GET('/videos/{publicId}/stream', {
      params: { path: { publicId: id } },
      headers,
      parseAs: 'stream',
    });

    const responseHeaders = new Headers();
    response.headers.forEach((val, key) => {
      responseHeaders.set(key, val);
    });

    const ct = responseHeaders.get('content-type');
    if (!ct || ct.includes('octet-stream')) {
      responseHeaders.set('content-type', 'video/mp4');
    }

    return new Response(response.body, {
      status: response.status,
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
