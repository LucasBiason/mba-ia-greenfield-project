import { upstream } from '@/lib/api/upstream';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { response } = await upstream.GET('/videos/{publicId}/download', {
      params: { path: { publicId: id } },
      parseAs: 'stream',
    });

    if (!response.ok || !response.body) {
      return new Response('Video not found', {
        status: response.status || 404,
      });
    }

    const headers = new Headers();
    response.headers.forEach((val, key) => {
      headers.set(key, val);
    });

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
