import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "scopepay_demo";
export const SESSION_SECONDS = 8 * 60 * 60;

export function secretMatches(candidate: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`scopepay-demo-session:${payload}`)
    .digest("base64url");
}

export function issueSession(secret: string, now = Date.now()): string {
  const payload = `${Math.floor(now / 1000)}.${Math.floor(now / 1000) + SESSION_SECONDS}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token || token.length > 150) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1]))
    return false;
  const issued = Number(parts[0]);
  const expires = Number(parts[1]);
  const current = Math.floor(now / 1000);
  return (
    Number.isSafeInteger(issued) &&
    Number.isSafeInteger(expires) &&
    issued <= current &&
    expires > current &&
    expires - issued === SESSION_SECONDS &&
    secretMatches(parts[2], sign(`${parts[0]}.${parts[1]}`, secret))
  );
}
