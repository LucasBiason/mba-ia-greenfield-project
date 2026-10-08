import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

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

let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let setSession: typeof import("@/lib/auth/session")["setSession"];

beforeAll(async () => {
  ({ POST } = await import("@/app/api/videos/[id]/complete/route"));
  ({ setSession } = await import("@/lib/auth/session"));
});

beforeEach(() => {
  cookieMap.clear();
});

function makeRequest() {
  return new Request("http://localhost/api/videos/pub-mock-video-1/complete", {
    method: "POST",
  });
}

describe("POST /api/videos/[id]/complete", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(makeRequest(), {
      params: Promise.resolve({ id: "pub-mock-video-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 when authenticated and upload is marked complete", async () => {
    await setSession({
      userId: "user-1",
      email: "user@example.com",
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      channelSlug: "user-channel",
    });

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ id: "pub-mock-video-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("PROCESSING");
    expect(body.publicId).toBe("pub-mock-video-1");
  });

  it("returns 404 when upstream video is not found", async () => {
    await setSession({
      userId: "user-1",
      email: "user@example.com",
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      channelSlug: "user-channel",
    });

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ id: "not-found" }),
    });

    expect(res.status).toBe(404);
  });
});
