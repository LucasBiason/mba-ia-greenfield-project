import { NextResponse } from "next/server";
import { getSession, destroySession } from "@/lib/auth/session";
import { refreshOnce } from "@/lib/auth/refresh";
import { upstream } from "@/lib/api/upstream";

export const dynamic = "force-dynamic";

export async function GET() {
  let session = await getSession();

  if (session.isLoggedIn && session.accessToken) {
    const { response } = await upstream.GET("/auth/me", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    });

    if (response.status === 401) {
      if (session.refreshToken) {
        const refreshed = await refreshOnce();
        if (refreshed) {
          session = await getSession();
        } else {
          await destroySession();
          return NextResponse.json({
            userId: "",
            email: "",
            channelSlug: "",
            isLoggedIn: false,
          });
        }
      } else {
        await destroySession();
        return NextResponse.json({
          userId: "",
          email: "",
          channelSlug: "",
          isLoggedIn: false,
        });
      }
    }
  }

  return NextResponse.json({
    userId: session.userId ?? "",
    email: session.email ?? "",
    channelSlug: session.channelSlug ?? "",
    isLoggedIn: Boolean(session.isLoggedIn),
  });
}
