import { describe, it, expect, beforeAll } from "vitest";

let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

beforeAll(async () => {
  ({ GET } = await import("@/app/api/videos/[id]/thumbnail/route"));
});

describe("GET /api/videos/[id]/thumbnail", () => {
  it("streams thumbnail image with correct headers", async () => {
    const req = new Request("http://localhost/api/videos/pub-mock-video-1/thumbnail");
    const res = await GET(req, {
      params: Promise.resolve({ id: "pub-mock-video-1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const blob = await res.blob();
    expect(blob.size).toBeGreaterThan(0);
  });

  it("returns 404 when thumbnail does not exist", async () => {
    const req = new Request("http://localhost/api/videos/not-found/thumbnail");
    const res = await GET(req, {
      params: Promise.resolve({ id: "not-found" }),
    });

    expect(res.status).toBe(404);
  });
});
