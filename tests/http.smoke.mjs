// Run after npm run build. Uses no database or provider credentials.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

const listener = createServer().listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const secret = randomBytes(32).toString("hex");
const origin = "https://demo.scopepay.test";
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DEMO_ACCESS_SECRET: secret,
      APP_URL: origin,
      DATABASE_URL: "",
    },
    stdio: "ignore",
  },
);
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error("Test server exited before becoming ready.");
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* wait for startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, "Production server starts");
  const post = (path, body, cookie, requestOrigin = origin) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: requestOrigin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  assert.equal((await fetch(`${base}/api/projects`)).status, 401);
  assert.equal((await fetch(`${base}/api/projects/test-project`)).status, 401);
  assert.equal((await post("/api/projects", {})).status, 401);
  assert.equal(
    (
      await post(
        "/api/demo-session",
        { accessSecret: secret },
        undefined,
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (await post("/api/demo-session", { accessSecret: "incorrect" })).status,
    401,
  );
  const login = await post("/api/demo-session", { accessSecret: secret });
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), { data: { authenticated: true } });
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=strict/i);
  const cookie = setCookie.split(";")[0];
  const invalid = await post("/api/projects", {}, cookie);
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.json()).error.fieldErrors.scopeText);
  assert.equal(
    (await post("/api/projects", {}, cookie, "https://untrusted.example"))
      .status,
    403,
  );
  const oversized = await post(
    "/api/projects",
    { scopeText: "x".repeat(256001) },
    cookie,
  );
  assert.equal(oversized.status, 400);
  assert.equal((await oversized.json()).error.code, "INPUT_TOO_LARGE");
  const unavailable = await fetch(`${base}/api/projects`, {
    headers: { Cookie: cookie },
  });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "The service is temporarily unavailable. Please try again.",
    },
  });
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
  console.log(
    "HTTP smoke checks passed: access control, origin checks, secure cookie, validation, body limits, safe database failure.",
  );
} finally {
  server.kill();
  if (server.exitCode === null) await once(server, "exit");
}
