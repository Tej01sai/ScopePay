// Test preload only. No production environment flag enables these fixtures.
// Loaded by the integration runner into its child Next.js process.
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

// This process contains synthetic data only. Capture driver diagnostics for failed tests.
const originalQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (...args) {
  const result = originalQuery.apply(this, args);
  if (result && typeof result.catch === "function")
    return result.catch((error) => {
      console.error("Test database error:", error.code, error.message);
      throw error;
    });
  return result;
};

const originalFetch = globalThis.fetch;
const statePath = process.env.SCOPEPAY_TEST_STATE;
if (!statePath) throw new Error("This preload is only for integration tests.");
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url === "https://api.groq.com/openai/v1/chat/completions") {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    const bad = input.conversationText.includes("INVALID_CITATION");
    const request = JSON.parse(init.body);
    if (
      init.headers.Authorization !== "Bearer synthetic-key" ||
      request.response_format.type !== "json_schema" ||
      !request.response_format.json_schema.strict
    )
      throw new Error("Invalid Groq request contract");
    if (input.conversationText.includes("BLOCKED_RESPONSE"))
      return json({
        choices: [
          {
            finish_reason: "stop",
            message: { refusal: "blocked", content: null },
          },
        ],
      });
    if (input.conversationText.includes("TRUNCATED_RESPONSE"))
      return json({
        choices: [{ finish_reason: "length", message: { content: "{}" } }],
      });
    const findings = [
      {
        classification: "ADDITIONAL",
        title: "Mobile layouts",
        explanation: "Mobile is excluded by the synthetic scope.",
        scopeQuote: bad ? "invented evidence" : "Mobile layouts are excluded.",
        requestQuote: "Please add mobile layouts.",
        clarificationQuestion: null,
      },
      {
        classification: "INCLUDED",
        title: "Heading revision",
        explanation: "One revision is included.",
        scopeQuote: "One revision is included.",
        requestQuote: "Change the heading.",
        clarificationQuestion: null,
      },
    ];
    return json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify({ findings }) },
        },
      ],
    });
  }

  if (!url.startsWith("https://api-m.sandbox.paypal.com/"))
    return originalFetch(input, init);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const save = () => writeFileSync(statePath, JSON.stringify(state));
  const path = new URL(url).pathname;
  if (path === "/v1/oauth2/token")
    return json({ access_token: "synthetic-token" });
  if (path === "/v2/invoicing/invoices" && init.method === "POST") {
    const body = JSON.parse(init.body);
    const id = `INV2-${++state.creates}`;
    const total = body.items.reduce(
      (sum, i) => sum + Math.round(Number(i.unit_amount.value) * 100),
      0,
    );
    state.invoices[id] = {
      id,
      status: "DRAFT",
      detail: {
        ...body.detail,
        metadata: {
          recipient_view_url: `https://www.sandbox.paypal.com/invoice/p/${id}`,
        },
      },
      amount: { currency_code: "USD", value: (total / 100).toFixed(2) },
      due_amount: { currency_code: "USD", value: (total / 100).toFixed(2) },
    };
    save();
    if (state.failAfterCreate) {
      state.failAfterCreate = false;
      save();
      throw new Error("Synthetic timeout after provider stored invoice");
    }
    return json(state.invoices[id], 201);
  }
  if (path === "/v2/invoicing/search-invoices") {
    const number = JSON.parse(init.body).invoice_number;
    return json({
      items: Object.values(state.invoices).filter(
        (i) => i.detail.invoice_number === number,
      ),
    });
  }
  const match = /^\/v2\/invoicing\/invoices\/([^/]+)(\/send)?$/.exec(path);
  if (!match || !state.invoices[match[1]]) return json({}, 404);
  const invoice = state.invoices[match[1]];
  if (match[2]) {
    invoice.status = "SENT";
    state.sends++;
    save();
    return new Response(null, { status: 204 });
  }
  if (state.paid) {
    invoice.status = "PAID";
    invoice.payments = {
      paid_amount: invoice.amount,
      transactions: [
        {
          type: "PAYPAL",
          payment_id: "synthetic-payment",
          amount: invoice.amount,
        },
      ],
    };
    invoice.due_amount = { currency_code: "USD", value: "0.00" };
  }
  return json(invoice);
};
