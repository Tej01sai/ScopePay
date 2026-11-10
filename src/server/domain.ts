import type {
  Finding,
  InvoiceStatus,
  ProposalItemInput,
} from "../shared/contracts.ts";

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function text(value: unknown, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("Invalid text input.");
  return value.trim();
}

export function priceItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30)
    throw new Error("Use 1–30 line items.");
  const items = value.map((raw) => {
    const item = record(raw);
    const description = text(item.description, 1000);
    const minutes = item.estimatedMinutes;
    const rate = item.hourlyRateCents;
    if (
      typeof minutes !== "number" ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 60000 ||
      typeof rate !== "number" ||
      !Number.isInteger(rate) ||
      rate < 1 ||
      rate > 10000000
    )
      throw new Error("Invalid minutes or hourly rate.");
    const amountCents = Math.round((minutes * rate) / 60);
    if (amountCents < 1 || amountCents > 100000000)
      throw new Error("Line total must be between $0.01 and $1,000,000.");
    return {
      description,
      estimatedMinutes: minutes,
      hourlyRateCents: rate,
      amountCents,
    } satisfies ProposalItemInput & { amountCents: number };
  });
  const totalCents = items.reduce((sum, i) => sum + i.amountCents, 0);
  if (totalCents > 100000000)
    throw new Error("Proposal total exceeds the demo limit.");
  return { items, totalCents };
}

export function validateFindings(
  value: unknown,
  scope: string,
  conversation: string,
): Omit<Finding, "id">[] {
  const rows = record(value).findings;
  if (!Array.isArray(rows) || rows.length > 30)
    throw new Error("Invalid findings.");
  return rows.map((raw) => {
    const f = record(raw);
    if (
      !["INCLUDED", "ADDITIONAL", "UNCLEAR"].includes(String(f.classification))
    )
      throw new Error("Invalid classification.");
    const title = text(f.title, 200);
    const explanation = text(f.explanation, 4000);
    if (
      typeof f.requestQuote !== "string" ||
      !f.requestQuote.trim() ||
      !conversation.includes(f.requestQuote)
    )
      throw new Error("Invalid request citation.");
    if (
      f.scopeQuote !== null &&
      (typeof f.scopeQuote !== "string" ||
        !f.scopeQuote.trim() ||
        !scope.includes(f.scopeQuote))
    )
      throw new Error("Invalid scope citation.");
    if (
      f.clarificationQuestion !== null &&
      (typeof f.clarificationQuestion !== "string" ||
        !f.clarificationQuestion.trim() ||
        f.clarificationQuestion.length > 1000)
    )
      throw new Error("Invalid clarification.");
    if (f.classification === "UNCLEAR" && !f.clarificationQuestion)
      throw new Error("Clarification is required.");
    return {
      classification: f.classification as Finding["classification"],
      title,
      explanation,
      scopeQuote: f.scopeQuote as string | null,
      requestQuote: f.requestQuote,
      clarificationQuestion: f.clarificationQuestion as string | null,
    };
  });
}

export function usdCents(value: unknown): number | null {
  const amount = record(value);
  if (
    amount.currency_code !== "USD" ||
    typeof amount.value !== "string" ||
    !/^\d{1,10}(\.\d{1,2})?$/.test(amount.value)
  )
    return null;
  const [whole, fraction = ""] = amount.value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function verifiedInvoiceStatus(
  raw: unknown,
  expectedId: string,
  totalCents: number,
): InvoiceStatus {
  const invoice = record(raw);
  if (invoice.id !== expectedId || usdCents(invoice.amount) !== totalCents)
    throw new Error("Provider invoice identity or amount mismatch.");
  if (["CANCELLED", "AUTO_CANCELLED"].includes(String(invoice.status)))
    return "CANCELLED";
  if (invoice.status === "PAID") {
    const payments = record(invoice.payments);
    const transactions = Array.isArray(payments.transactions)
      ? payments.transactions
      : [];
    const paypalPaid = transactions.reduce((sum: number, raw) => {
      const t = record(raw);
      return (
        sum +
        (t.type === "PAYPAL" && typeof t.payment_id === "string" && t.payment_id
          ? (usdCents(t.amount) ?? 0)
          : 0)
      );
    }, 0);
    if (
      usdCents(payments.paid_amount) === totalCents &&
      usdCents(invoice.due_amount) === 0 &&
      paypalPaid === totalCents
    )
      return "PAID";
    return "ERROR";
  }
  if (
    ["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING", "SHARED"].includes(
      String(invoice.status),
    )
  )
    return "PENDING";
  if (invoice.status === "DRAFT") return "CREATING";
  return "ERROR";
}

export function sandboxPaymentUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["www.sandbox.paypal.com", "sandbox.paypal.com"].includes(url.hostname) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
