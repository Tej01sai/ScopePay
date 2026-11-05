import { demoSecret, requireOrigin } from "@/server/auth";
import { ApiFailure, handle, readJson, success } from "@/server/http";
import {
  issueSession,
  secretMatches,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/server/session";

export const runtime = "nodejs";
// Shared demo-wide cap per process; use an edge/shared limiter for multiple replicas.
const attempts = { resetAt: 0, count: 0 };

export async function POST(request: Request) {
  return handle(async () => {
    requireOrigin(request);
    const secret = demoSecret();
    const now = Date.now();
    if (now >= attempts.resetAt) {
      attempts.resetAt = now + 60000;
      attempts.count = 0;
    }
    if (++attempts.count > 20)
      throw new ApiFailure(
        429,
        "RATE_LIMITED",
        "Too many login attempts. Try again in a minute.",
      );
    const body = await readJson(request, 4096);
    if (
      typeof body.accessSecret !== "string" ||
      !secretMatches(body.accessSecret, secret)
    )
      throw new ApiFailure(
        401,
        "UNAUTHORIZED",
        "The demo access secret is incorrect.",
      );
    const response = success({ authenticated: true as const });
    response.cookies.set(SESSION_COOKIE, issueSession(secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return response;
  });
}
