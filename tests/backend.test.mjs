import assert from "node:assert/strict";
import test from "node:test";
import {
  issueSession,
  verifySession,
  SESSION_SECONDS,
} from "../src/server/session.ts";
import { validateProject } from "../src/server/project-input.ts";

const secret = "synthetic-test-secret-not-a-real-credential";
const now = 1700000000000;

test("signed sessions expire exactly at eight hours and reject future issuance", () => {
  const token = issueSession(secret, now);
  assert.equal(verifySession(token, secret, now), true);
  assert.equal(
    verifySession(token, secret, now + SESSION_SECONDS * 1000 - 1),
    true,
  );
  assert.equal(
    verifySession(token, secret, now + SESSION_SECONDS * 1000),
    false,
  );
  assert.equal(verifySession(token, secret, now - 1000), false);
});

test("tampering, malformed sessions and a rotated secret fail closed", () => {
  const token = issueSession(secret, now);
  const [issued, expiry, signature] = token.split(".");
  for (const bad of [
    undefined,
    "",
    "abc",
    `${issued}.${Number(expiry) + 1}.${signature}`,
    `${issued}.${expiry}.forged`,
    `${token}.extra`,
    "x".repeat(1000),
  ]) {
    assert.equal(verifySession(bad, secret, now), false);
  }
  assert.equal(verifySession(token, "rotated-secret", now), false);
});

const project = {
  title: " Portfolio ",
  clientName: " Synthetic client ",
  scopeText: "  Exact source text.\n",
  hourlyRateCents: 5000,
  currency: "USD",
};

test("project validation preserves evidence whitespace and strips untrusted fields", () => {
  const result = validateProject({
    ...project,
    id: "attacker-id",
    createdAt: "fake",
  });
  assert.deepEqual(result.fieldErrors, {});
  assert.deepEqual(result.data, {
    ...project,
    title: "Portfolio",
    clientName: "Synthetic client",
  });
});

test("project rates reject fractions, strings, overflow and nonpositive amounts", () => {
  for (const hourlyRateCents of [
    0,
    -1,
    1.5,
    "5000",
    null,
    NaN,
    Infinity,
    10000001,
  ]) {
    assert.ok(
      validateProject({ ...project, hourlyRateCents }).fieldErrors
        .hourlyRateCents,
    );
  }
});

test("project validation bounds input and restricts currency", () => {
  for (const [key, value] of [
    ["title", " "],
    ["title", "x".repeat(201)],
    ["clientName", null],
    ["scopeText", "x".repeat(40001)],
    ["currency", "EUR"],
  ]) {
    const result = validateProject({ ...project, [key]: value });
    assert.equal(result.data, undefined);
    assert.ok(result.fieldErrors[key]);
  }
});
