import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { server } from "@/mocks/server";
import { http, HttpResponse } from "msw";
import { env } from "@/lib/env";

const cookieMap = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (name: string) =>
      cookieMap.has(name) ? { name, value: cookieMap.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieMap.set(name, value);
    },
    delete: (name: string) => {
      cookieMap.delete(name);
    },
  }),
}));

let POST: (req: Request) => Promise<Response>;
let setSession: typeof import("@/lib/auth/session")["setSession"];

beforeAll(async () => {
  ({ POST } = await import("@/app/api/videos/init/route"));
  ({ setSession } = await import("@/lib/auth/session"));
});

beforeEach(() => {
  cookieMap.clear();
});

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/videos/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/videos/init", () => {
  it("returns 401 when caller is unauthenticated", async () => {
    const res = await POST(makeRequest({ title: "My Video" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({
      statusCode: 401,
      error: "UNAUTHORIZED",
    });
  });

  it("returns 201 with uploadEndpoint when authenticated", async () => {
    await setSession({
      userId: "user-1",
      email: "user@example.com",
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      channelSlug: "user-channel",
    });

    const res = await POST(
      makeRequest({
        title: "Building Microservices",
        description: "A deep dive tutorial",
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("publicId", "pub-mock-video-1");
    expect(body).toHaveProperty("uploadEndpoint");
    expect(body.status).toBe("UPLOADING");
  });

  it("returns 400 when title is missing or empty", async () => {
    await setSession({
      userId: "user-1",
      email: "user@example.com",
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      channelSlug: "user-channel",
    });

    const res = await POST(makeRequest({ title: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.statusCode).toBe(400);
  });

  it("propagates upstream errors gracefully", async () => {
    await setSession({
      userId: "user-1",
      email: "user@example.com",
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      channelSlug: "user-channel",
    });

    server.use(
      http.post(`${env.API_URL}/videos/upload/init`, () =>
        HttpResponse.json(
          { statusCode: 500, error: "INTERNAL_SERVER_ERROR", message: "Database down" },
          { status: 500 }
        )
      )
    );

    const res = await POST(makeRequest({ title: "Test video" }));
    expect(res.status).toBe(500);
  });
});
