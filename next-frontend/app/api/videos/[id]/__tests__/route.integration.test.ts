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

let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let setSession: typeof import("@/lib/auth/session")["setSession"];

beforeAll(async () => {
  ({ GET, PATCH } = await import("@/app/api/videos/[id]/route"));
  ({ setSession } = await import("@/lib/auth/session"));
});

beforeEach(() => {
  cookieMap.clear();
});

describe("GET /api/videos/[id]", () => {
  it("returns video details without requiring session", async () => {
    const req = new Request("http://localhost/api/videos/pub-mock-video-1");
    const res = await GET(req, {
      params: Promise.resolve({ id: "pub-mock-video-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("publicId", "pub-mock-video-1");
    expect(body.title).toBe("Test Mock Video");
  });

  it("returns 404 when video does not exist", async () => {
    const req = new Request("http://localhost/api/videos/not-found");
    const res = await GET(req, {
      params: Promise.resolve({ id: "not-found" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/videos/[id]", () => {
  it("returns 401 when caller is unauthenticated", async () => {
    const req = new Request("http://localhost/api/videos/pub-mock-video-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "pub-mock-video-1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 200 when authenticated and video is updated", async () => {
    await setSession({
      userId: "user-1",
      email: "user@example.com",
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      channelSlug: "user-channel",
    });

    const req = new Request("http://localhost/api/videos/pub-mock-video-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "pub-mock-video-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Updated Title");
  });
});
