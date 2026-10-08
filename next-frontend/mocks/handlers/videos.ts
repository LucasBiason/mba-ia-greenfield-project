import { http, HttpResponse } from "msw";
import { env } from "@/lib/env";

function errorEnvelope(statusCode: number, error: string, message: string) {
  return { statusCode, error, message, code: null };
}

export const handlers = [
  // POST /videos/upload/init
  http.post(`${env.API_URL}/videos/upload/init`, async ({ request }) => {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return HttpResponse.json(
        errorEnvelope(401, "UNAUTHORIZED", "Unauthorized"),
        { status: 401 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (!body.title || typeof body.title !== "string" || body.title.trim() === "") {
      return HttpResponse.json(
        errorEnvelope(400, "VALIDATION_FAILED", "Title is required"),
        { status: 400 }
      );
    }

    return HttpResponse.json(
      {
        publicId: "pub-mock-video-1",
        uploadEndpoint: `${env.API_URL}/videos/upload/pub-mock-video-1`,
        status: "UPLOADING",
        title: body.title,
        description: (body.description as string) || null,
      },
      { status: 201 }
    );
  }),

  // POST /videos/:publicId/complete
  http.post(`${env.API_URL}/videos/:publicId/complete`, ({ params, request }) => {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return HttpResponse.json(
        errorEnvelope(401, "UNAUTHORIZED", "Unauthorized"),
        { status: 401 }
      );
    }

    const { publicId } = params;
    if (publicId === "not-found") {
      return HttpResponse.json(
        errorEnvelope(404, "NOT_FOUND", "Video not found"),
        { status: 404 }
      );
    }

    return HttpResponse.json(
      {
        publicId,
        status: "PROCESSING",
        message: "Upload completed and processing queued",
      },
      { status: 200 }
    );
  }),

  // GET /videos/:publicId
  http.get(`${env.API_URL}/videos/:publicId`, ({ params }) => {
    const { publicId } = params;
    if (publicId === "not-found") {
      return HttpResponse.json(
        errorEnvelope(404, "NOT_FOUND", "Video not found"),
        { status: 404 }
      );
    }

    return HttpResponse.json(
      {
        publicId,
        title: "Test Mock Video",
        description: "Test description",
        status: "READY",
        duration: 120,
        resolution: "1080p",
        channel: {
          id: "chan-fixture-1",
          name: "Test Channel",
          slug: "user-channel",
        },
        createdAt: "2026-10-08T00:00:00.000Z",
        updatedAt: "2026-10-08T00:00:00.000Z",
      },
      { status: 200 }
    );
  }),

  // PATCH /videos/:publicId
  http.patch(`${env.API_URL}/videos/:publicId`, async ({ params, request }) => {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return HttpResponse.json(
        errorEnvelope(401, "UNAUTHORIZED", "Unauthorized"),
        { status: 401 }
      );
    }

    const { publicId } = params;
    if (publicId === "not-found") {
      return HttpResponse.json(
        errorEnvelope(404, "NOT_FOUND", "Video not found"),
        { status: 404 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        publicId,
        title: body.title || "Updated Title",
        description: body.description ?? null,
        status: "READY",
      },
      { status: 200 }
    );
  }),

  // GET /videos
  http.get(`${env.API_URL}/videos`, () => {
    return HttpResponse.json(
      {
        items: [
          {
            publicId: "pub-mock-video-1",
            title: "Test Mock Video",
            description: "Test description",
            status: "READY",
            duration: 120,
            channel: {
              id: "chan-fixture-1",
              name: "Test Channel",
              slug: "user-channel",
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
      },
      { status: 200 }
    );
  }),

  // GET /videos/:publicId/thumbnail
  http.get(`${env.API_URL}/videos/:publicId/thumbnail`, ({ params }) => {
    const { publicId } = params;
    if (publicId === "not-found") {
      return HttpResponse.json(
        errorEnvelope(404, "NOT_FOUND", "Thumbnail not found"),
        { status: 404 }
      );
    }

    // Return fake JPEG bytes
    const fakeJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    return new HttpResponse(fakeJpegBytes, {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  }),
];
