import assert from "node:assert/strict";
import test from "node:test";
import {
  priceItems,
  validateFindings,
  verifiedInvoiceStatus,
  sandboxPaymentUrl,
} from "../src/server/domain.ts";

test("server calculates line totals in cents and rejects invalid or excessive estimates", () => {
  assert.equal(
    priceItems([
      {
        description: "Mobile layouts",
        estimatedMinutes: 120,
        hourlyRateCents: 5000,
      },
    ]).totalCents,
    10000,
  );
  assert.equal(
    priceItems([
      { description: "Work", estimatedMinutes: 1, hourlyRateCents: 100 },
    ]).totalCents,
    2,
  );
  for (const estimatedMinutes of [0, -1, 1.5, "120", 60001])
    assert.throws(() =>
      priceItems([
        { description: "Work", estimatedMinutes, hourlyRateCents: 5000 },
      ]),
    );
  assert.throws(() => priceItems([]));
  assert.throws(() =>
    priceItems([
      {
        description: "Work",
        estimatedMinutes: 60000,
        hourlyRateCents: 10000000,
      },
    ]),
  );
});

test("findings require verbatim evidence and clarification for uncertainty", () => {
  const finding = {
    title: "Mobile",
    classification: "ADDITIONAL",
    explanation: "Explicit exclusion",
    scopeQuote: "Mobile excluded.",
    requestQuote: "Add mobile.",
    clarificationQuestion: null,
  };
  assert.equal(
    validateFindings({ findings: [finding] }, "Mobile excluded.", "Add mobile.")
      .length,
    1,
  );
  assert.throws(() =>
    validateFindings(
      { findings: [{ ...finding, scopeQuote: "invented" }] },
      "Mobile excluded.",
      "Add mobile.",
    ),
  );
  assert.throws(() =>
    validateFindings(
      { findings: [{ ...finding, requestQuote: "invented" }] },
      "Mobile excluded.",
      "Add mobile.",
    ),
  );
  assert.throws(() =>
    validateFindings(
      { findings: [{ ...finding, classification: "UNCLEAR" }] },
      "Mobile excluded.",
      "Add mobile.",
    ),
  );
});

const money = (value) => ({ currency_code: "USD", value });
const paid = {
  id: "INV2-test",
  status: "PAID",
  amount: money("100.00"),
  due_amount: money("0.00"),
  payments: {
    paid_amount: money("100.00"),
    transactions: [
      { type: "PAYPAL", payment_id: "TX-test", amount: money("100.00") },
    ],
  },
};

test("payment verification rejects partial, manual, wrong-currency and mismatched payments", () => {
  assert.equal(verifiedInvoiceStatus(paid, "INV2-test", 10000), "PAID");
  assert.equal(
    verifiedInvoiceStatus(
      { ...paid, status: "PARTIALLY_PAID" },
      "INV2-test",
      10000,
    ),
    "PENDING",
  );
  assert.equal(
    verifiedInvoiceStatus(
      { ...paid, status: "MARKED_AS_PAID" },
      "INV2-test",
      10000,
    ),
    "ERROR",
  );
  assert.equal(
    verifiedInvoiceStatus(
      {
        ...paid,
        payments: {
          paid_amount: money("100.00"),
          transactions: [{ type: "EXTERNAL", amount: money("100.00") }],
        },
      },
      "INV2-test",
      10000,
    ),
    "ERROR",
  );
  assert.equal(
    verifiedInvoiceStatus(
      { ...paid, due_amount: money("1.00") },
      "INV2-test",
      10000,
    ),
    "ERROR",
  );
  assert.throws(() => verifiedInvoiceStatus(paid, "another-id", 10000));
  assert.throws(() => verifiedInvoiceStatus(paid, "INV2-test", 20000));
  assert.throws(() =>
    verifiedInvoiceStatus(
      { ...paid, amount: { currency_code: "EUR", value: "100.00" } },
      "INV2-test",
      10000,
    ),
  );
});

test("payment links only allow HTTPS PayPal sandbox hosts", () => {
  assert.ok(sandboxPaymentUrl("https://www.sandbox.paypal.com/invoice/p/test"));
  for (const value of [
    "https://www.paypal.com/invoice/p/test",
    "https://sandbox.paypal.com.evil.test/",
    "javascript:alert(1)",
    "http://sandbox.paypal.com/",
    "https://user@sandbox.paypal.com/",
  ])
    assert.equal(sandboxPaymentUrl(value), null);
});
