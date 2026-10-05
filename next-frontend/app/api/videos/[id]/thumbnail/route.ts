import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  const minioEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';

  try {
    const videoRes = await fetch(`${apiUrl}/videos/${id}`);
    if (!videoRes.ok) {
      return new Response('Not found', { status: 404 });
    }
    const video = await videoRes.json();
    const thumbKey = video.thumbnail_key || video.thumbnailKey;
    if (!thumbKey) {
      return new Response('Thumbnail not ready', { status: 404 });
    }

    const s3 = new S3Client({
      endpoint: minioEndpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
      },
      forcePathStyle: true,
    });

    const cleanKey = thumbKey.replace(/^thumbnails\//, '');
    let s3Res;
    try {
      s3Res = await s3.send(
        new GetObjectCommand({
          Bucket: 'thumbnails',
          Key: thumbKey,
        }),
      );
    } catch {
      s3Res = await s3.send(
        new GetObjectCommand({
          Bucket: 'thumbnails',
          Key: cleanKey,
        }),
      );
    }

    const bytes = await s3Res.Body?.transformToByteArray();
    if (!bytes) {
      return new Response('Empty thumbnail', { status: 404 });
    }

    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Thumbnail fetch failed: ${msg}`, { status: 500 });
  }
}
