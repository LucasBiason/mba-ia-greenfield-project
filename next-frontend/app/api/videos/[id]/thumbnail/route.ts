import { upstream } from '@/lib/api/upstream';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { response } = await upstream.GET('/videos/{publicId}/thumbnail', {
    params: { path: { publicId: id } },
    parseAs: 'stream',
  });

  if (!response.ok || !response.body) {
    return new Response('Thumbnail not found', {
      status: response.status || 404,
    });
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
