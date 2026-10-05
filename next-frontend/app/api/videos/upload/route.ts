import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const DEFAULT_CHANNEL_ID = 'cd4e35e4-3166-41e7-b490-d2622dcfe0b9';
const DEFAULT_USER_ID = '1efddc00-00d1-4d9f-9bbf-e56dbc5568b8';

export async function POST(request: Request) {
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  const minioEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string) || 'Vídeo sem título';
    const description = (formData.get('description') as string) || '';
    const visibility = (formData.get('visibility') as string) || 'PUBLIC';
    const channelId = (formData.get('channelId') as string) || DEFAULT_CHANNEL_ID;

    if (!file) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Nenhum arquivo enviado' },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileSize = fileBuffer.length;
    let mimeType = file.type || 'video/mp4';
    if (!mimeType || mimeType === 'application/octet-stream') {
      if (file.name.endsWith('.mp4')) mimeType = 'video/mp4';
      else if (file.name.endsWith('.webm')) mimeType = 'video/webm';
      else if (file.name.endsWith('.mov')) mimeType = 'video/quicktime';
      else mimeType = 'video/mp4';
    }
    const fileName = file.name || 'upload.mp4';

    // 1. Initialize draft in NestJS
    const initRes = await fetch(`${apiUrl}/videos/upload/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': DEFAULT_USER_ID,
      },
      body: JSON.stringify({
        channelId,
        fileSize,
        mimeType,
        fileName,
        title,
      }),
    });

    if (!initRes.ok) {
      const errData = await initRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'INIT_FAILED', message: errData.message || 'Falha ao inicializar upload no backend' },
        { status: initRes.status },
      );
    }

    const initData = await initRes.json();
    const { publicId, storageKey } = initData;

    // 2. Upload file directly to MinIO S3 bucket 'videos'
    const s3 = new S3Client({
      endpoint: minioEndpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
      },
      forcePathStyle: true,
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: 'videos',
        Key: storageKey,
        Body: fileBuffer,
        ContentType: mimeType,
      }),
    );

    // 3. Mark upload as completed in NestJS to trigger FFmpeg worker via BullMQ
    const completeRes = await fetch(`${apiUrl}/videos/${publicId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        storageKey,
        fileSize,
      }),
    });

    if (!completeRes.ok) {
      return NextResponse.json(
        { error: 'COMPLETE_FAILED', message: 'Falha ao despachar processamento' },
        { status: completeRes.status },
      );
    }

    // 4. Update metadata (description and visibility)
    if (description || visibility) {
      await fetch(`${apiUrl}/videos/${publicId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': DEFAULT_USER_ID,
        },
        body: JSON.stringify({
          description,
          visibility,
        }),
      }).catch(() => null);
    }

    return NextResponse.json({
      success: true,
      publicId,
      title,
      storageKey,
      fileSize,
      status: 'PROCESSING',
      watchUrl: `/watch/${publicId}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'UPLOAD_ERROR', message: msg },
      { status: 500 },
    );
  }
}
