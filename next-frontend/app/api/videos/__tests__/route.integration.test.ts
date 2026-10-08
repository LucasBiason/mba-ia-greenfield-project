import { describe, it, expect, beforeAll, vi } from "vitest";

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

let GET: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ GET } = await import("@/app/api/videos/route"));
});

describe("GET /api/videos", () => {
  it("returns paginated list of videos", async () => {
    const req = new Request("http://localhost/api/videos?page=1&limit=10");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("items");
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toHaveProperty("publicId", "pub-mock-video-1");
  });
});
