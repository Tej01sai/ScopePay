import assert from "node:assert/strict";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

async function port() {
  const listener = createServer().listen(0, "127.0.0.1");
  await once(listener, "listening");
  const value = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return value;
}
const directory = await mkdtemp(join(tmpdir(), "scopepay-integration-"));
const statePath = join(directory, "providers.json");
await writeFile(
  statePath,
  JSON.stringify({ creates: 0, sends: 0, invoices: {}, paid: false }),
);
const dbPort = await port();
const dbPassword = randomBytes(24).toString("hex");
const database = new EmbeddedPostgres({
  databaseDir: join(directory, "postgres"),
  port: dbPort,
  user: "postgres",
  password: dbPassword,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
await database.initialise();
await database.start();
const connectionString = `postgresql://postgres:${dbPassword}@127.0.0.1:${dbPort}/postgres`;
const sql = new Client({
  connectionString,
});
let app;
try {
  await sql.connect();
  for (const migration of [
    "20261104000000_initial",
    "20261106000000_analysis_budget",
  ]) {
    await sql.query(
      await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"),
    );
  }
  const appPort = await port();
  const base = `http://127.0.0.1:${appPort}`;
  const origin = "https://scopepay.integration.test";
  const secret = randomBytes(32).toString("hex");
  const env = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: connectionString,
    APP_URL: origin,
    DEMO_ACCESS_SECRET: secret,
    MODEL_PROVIDER: "groq",
    MODEL_API_KEY: "synthetic-key",
    MODEL_NAME: "synthetic-model",
    PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
    PAYPAL_CLIENT_ID: "synthetic-id",
    PAYPAL_CLIENT_SECRET: "synthetic-secret",
    PAYPAL_MERCHANT_EMAIL: "merchant@example.test",
    PAYPAL_MERCHANT_BUSINESS_NAME: "Synthetic Merchant",
    PAYPAL_MERCHANT_GIVEN_NAME: "Demo",
    PAYPAL_MERCHANT_SURNAME: "Merchant",
    PAYPAL_MERCHANT_COUNTRY_CODE: "US",
    SCOPEPAY_TEST_STATE: statePath,
  };
  app = spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(join(process.cwd(), "tests/provider-fixtures.mjs")).href,
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let appLog = "";
  app.stdout.on("data", (chunk) => {
    appLog += chunk;
  });
  app.stderr.on("data", (chunk) => {
    appLog += chunk;
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* startup */
    }
    if (app.exitCode !== null) throw new Error(`App exited: ${appLog}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, appLog);
  let cookie;
  async function call(
    path,
    { method = "GET", body, token, headers = {}, expected = 200 } = {},
  ) {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        Origin: origin,
        ...(cookie && !token ? { Cookie: cookie } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    assert.equal(
      response.status,
      expected,
      `${method} ${path}: ${JSON.stringify(payload)}\n${appLog}`,
    );
    if (path === "/demo-session")
      cookie = response.headers.get("set-cookie").split(";")[0];
    return payload.data ?? payload.error;
  }
  await call("/demo-session", {
    method: "POST",
    body: { accessSecret: secret },
  });
  const project = await call("/projects", {
    method: "POST",
    expected: 201,
    body: {
      title: "Synthetic integration project",
      clientName: "Test client",
      scopeText: "Mobile layouts are excluded. One revision is included.",
      hourlyRateCents: 5000,
      currency: "USD",
    },
  });
  assert.equal((await call("/projects")).length, 1);
  const conversationText = "Please add mobile layouts. Change the heading.";
  await call(`/projects/${project.id}/analyses`, {
    method: "POST",
    body: { conversationText: `${conversationText} INVALID_CITATION` },
    expected: 502,
  });
  for (const marker of ["BLOCKED_RESPONSE", "TRUNCATED_RESPONSE"]) {
    await call(`/projects/${project.id}/analyses`, {
      method: "POST",
      body: { conversationText: conversationText + marker },
      expected: 502,
    });
  }
  const analysis = await call(`/projects/${project.id}/analyses`, {
    method: "POST",
    body: { conversationText },
    expected: 201,
  });
  assert.equal(
    (await call(`/projects/${project.id}`)).analyses.length,
    1,
    "invalid findings must not be saved",
  );
  const proposalBody = {
    analysisId: analysis.id,
    findingIds: [
      analysis.findings.find((f) => f.classification === "ADDITIONAL").id,
    ],
    title: "Mobile layouts",
    items: [
      {
        description: "Two mobile layouts",
        estimatedMinutes: 120,
        hourlyRateCents: 5000,
      },
    ],
  };
  await call(`/projects/${project.id}/proposals`, {
    method: "POST",
    body: {
      ...proposalBody,
      findingIds: [
        analysis.findings.find((f) => f.classification === "INCLUDED").id,
      ],
    },
    expected: 400,
  });
  const p = await call(`/projects/${project.id}/proposals`, {
    method: "POST",
    body: proposalBody,
    expected: 201,
  });
  assert.equal(p.totalCents, 10000);
  await call(`/proposals/${p.id}/invoice`, {
    method: "POST",
    body: { buyerEmail: "buyer@example.test" },
    headers: { "Idempotency-Key": "test-before-approval" },
    expected: 409,
  });
  const approval = await call(`/proposals/${p.id}/approve`, { method: "POST" });
  assert.deepEqual(
    await call(`/proposals/${p.id}/approve`, { method: "POST" }),
    approval,
  );
  const token = new URL(approval.approvalUrl).hash.slice(7);
  await call(`/proposals/${p.id}`, {
    method: "PATCH",
    body: { ...proposalBody, title: "Tampered" },
    expected: 409,
  });
  const view = await call("/client/proposal", { token });
  assert.equal(view.proposal.totalCents, 10000);
  for (const privateName of [
    "conversationText",
    "scopeText",
    "clientTokenHash",
    "buyerEmail",
  ])
    assert.equal(JSON.stringify(view).includes(privateName), false);
  await call("/client/proposal", { token: "x".repeat(43), expected: 404 });
  await call("/client/accept", {
    token,
    method: "POST",
    body: { accepted: false },
    expected: 400,
  });
  const accepted = await call("/client/accept", {
    token,
    method: "POST",
    body: { accepted: true },
  });
  assert.equal(accepted.status, "ACCEPTED");
  assert.deepEqual(
    await call("/client/accept", {
      token,
      method: "POST",
      body: { accepted: true },
    }),
    accepted,
  );
  const create = () =>
    call(`/proposals/${p.id}/invoice`, {
      method: "POST",
      body: { buyerEmail: "buyer@example.test", totalCents: 1 },
      headers: { "Idempotency-Key": "integration-invoice-1" },
    });
  const results = await Promise.all([create(), create()]);
  assert.equal(results[0].id, results[1].id);
  const invoice = await call(`/proposals/${p.id}/invoice`);
  assert.equal(invoice.status, "PENDING");
  assert.equal(invoice.totalCents, 10000);
  let state = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(state.creates, 1);
  assert.equal(state.sends, 1);
  state.paid = true;
  await writeFile(statePath, JSON.stringify(state));
  await sql.query('UPDATE "Invoice" SET "lastReconciledAt" = NULL');
  assert.equal(
    (await call("/client/proposal", { token })).invoice.status,
    "PAID",
  );
  state.paid = false;
  state.failAfterCreate = true;
  await writeFile(statePath, JSON.stringify(state));
  assert.equal(
    (await call(`/proposals/${p.id}/invoice`)).status,
    "PAID",
    "paid state must never regress",
  );
  const p2 = await call(`/projects/${project.id}/proposals`, {
    method: "POST",
    body: proposalBody,
    expected: 201,
  });
  const approved2 = await call(`/proposals/${p2.id}/approve`, {
    method: "POST",
  });
  await call("/client/accept", {
    method: "POST",
    token: new URL(approved2.approvalUrl).hash.slice(7),
    body: { accepted: true },
  });
  const failed = await call(`/proposals/${p2.id}/invoice`, {
    method: "POST",
    body: { buyerEmail: "buyer@example.test" },
    headers: { "Idempotency-Key": "integration-invoice-2" },
  });
  assert.equal(failed.status, "ERROR");
  assert.equal((await call(`/proposals/${p2.id}/invoice`)).status, "PENDING");
  state = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(
    state.creates,
    2,
    "timeout recovery must not create a duplicate",
  );
  assert.equal(
    (await sql.query('SELECT count(*) FROM "Invoice"')).rows[0].count,
    "2",
  );
  console.log(
    "Integration passed: migrations, projects, AI citation rejection, immutable approval, scoped acceptance, concurrent invoicing, verified payment, timeout reconciliation. Providers are synthetic fixtures; database is native PostgreSQL.",
  );
} finally {
  if (app && app.exitCode === null) {
    app.kill();
    await once(app, "exit");
  }
  await sql.end();
  await database.stop();
}
