import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

export interface SessionData {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  channelSlug: string;
  isLoggedIn: boolean;
}

const SESSION_PWD =
  process.env.SESSION_PASSWORD ||
  (typeof env !== "undefined" ? env.SESSION_PASSWORD : undefined);

if (!SESSION_PWD) {
  throw new Error(
    "SESSION_PASSWORD environment variable is required (must be at least 32 characters)",
  );
}

export const sessionOptions: SessionOptions = {
  password: SESSION_PWD,
  cookieName: "streamtube_session",
  ttl: 60 * 60 * 24 * 14, // 14 days (matches refresh-token horizon)
  cookieOptions: {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production"
        ? true
        : process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function setSession(data: Omit<SessionData, "isLoggedIn">) {
  const session = await getSession();
  session.accessToken = data.accessToken;
  session.refreshToken = data.refreshToken;
  session.userId = data.userId;
  session.email = data.email;
  session.channelSlug = data.channelSlug;
  session.isLoggedIn = true;
  await session.save();
}

export async function destroySession() {
  const session = await getSession();
  session.destroy();
}
