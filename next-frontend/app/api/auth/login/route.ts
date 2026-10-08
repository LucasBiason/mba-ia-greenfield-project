import { NextResponse } from "next/server";

import type { LoginDto, LoginTokenPair, ApiErrorEnvelope } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { setSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const body = (await request.json()) as LoginDto;

  const { data, error, response } = await upstream.POST("/auth/login", {
    body: body as never,
  });

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  const tokens = data as LoginTokenPair;

  let userId = "";
  let email = (body as Record<string, string>).email ?? "";
  let channelSlug = "";

  if (tokens.access_token) {
    const profileRes = await upstream.GET("/auth/me", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (profileRes.data) {
      userId = profileRes.data.sub || "";
      email = profileRes.data.email || email;
      channelSlug = profileRes.data.channel_slug || "";
    }
  }

  // Seal tokens into the iron-session cookie — tokens never cross to the browser.
  await setSession({
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? "",
    userId,
    email,
    channelSlug,
  });

  // FE-facing body omits access_token / refresh_token (per API Contract).
  return NextResponse.json({}, { status: 200 });
}
