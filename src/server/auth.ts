import "server-only";
import { cookies } from "next/headers";
import { ApiFailure } from "@/server/http";
import { SESSION_COOKIE, verifySession } from "@/server/session";

export function demoSecret(): string {
  const secret = process.env.DEMO_ACCESS_SECRET;
  if (!secret || secret.length < 32)
    throw new ApiFailure(
      503,
      "AUTH_NOT_CONFIGURED",
      "Demo access is not configured.",
    );
  return secret;
}

export async function requireSession(): Promise<void> {
  const secret = demoSecret();
  if (!verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret)) {
    throw new ApiFailure(401, "UNAUTHORIZED", "Sign in to the demo workspace.");
  }
}

/** Require an explicit trusted Origin on browser mutations, including login. */
export function requireOrigin(request: Request): void {
  const appUrl = process.env.APP_URL;
  if (!appUrl)
    throw new ApiFailure(
      503,
      "AUTH_NOT_CONFIGURED",
      "The application origin is not configured.",
    );
  let expected: URL;
  try {
    expected = new URL(appUrl);
  } catch {
    throw new ApiFailure(
      503,
      "AUTH_NOT_CONFIGURED",
      "The application origin is not configured.",
    );
  }
  if (
    !["http:", "https:"].includes(expected.protocol) ||
    (process.env.NODE_ENV === "production" && expected.protocol !== "https:")
  ) {
    throw new ApiFailure(
      503,
      "AUTH_NOT_CONFIGURED",
      "A valid application origin is required.",
    );
  }
  if (request.headers.get("origin") !== expected.origin)
    throw new ApiFailure(
      403,
      "INVALID_ORIGIN",
      "This request origin is not allowed.",
    );
}
