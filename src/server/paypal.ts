import "server-only";
import { ApiFailure } from "@/server/http";
import {
  record,
  sandboxPaymentUrl,
  verifiedInvoiceStatus,
} from "@/server/domain";
import { getDb } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

const BASE = "https://api-m.sandbox.paypal.com";
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new ApiFailure(
      503,
      "PAYPAL_NOT_CONFIGURED",
      "Configure the PayPal sandbox credentials and merchant identity.",
    );
  return value;
}
export function paypalConfig() {
  if (required("PAYPAL_BASE_URL") !== BASE)
    throw new ApiFailure(
      503,
      "SANDBOX_REQUIRED",
      "Only PayPal sandbox is supported.",
    );
  return {
    id: required("PAYPAL_CLIENT_ID"),
    secret: required("PAYPAL_CLIENT_SECRET"),
    email: required("PAYPAL_MERCHANT_EMAIL"),
    business: required("PAYPAL_MERCHANT_BUSINESS_NAME"),
    given: required("PAYPAL_MERCHANT_GIVEN_NAME"),
    surname: required("PAYPAL_MERCHANT_SURNAME"),
    country: required("PAYPAL_MERCHANT_COUNTRY_CODE"),
  };
}
async function paypalClient() {
  const config = paypalConfig();
  const tokenResponse = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.id}:${config.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenResponse.ok) throw new Error("Sandbox authentication failed.");
  const token = record(await tokenResponse.json()).access_token;
  if (typeof token !== "string") throw new Error("Invalid sandbox token.");
  return async (
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<Record<string, unknown>> => {
    const response = await fetch(`${BASE}${path}`, {
      method,
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error("Sandbox request failed.");
    if (response.status === 204) return {};
    return record(await response.json());
  };
}

type StoredInvoice = Prisma.InvoiceGetPayload<object>;
export async function reconcileInvoice(
  id: string,
  allowCreate = false,
): Promise<StoredInvoice> {
  paypalConfig();
  const pending = await getDb().invoice.findUniqueOrThrow({ where: { id } });
  // Do not steal the create worker's lock during the reservation-to-create gap.
  if (
    !allowCreate &&
    pending.status === "CREATING" &&
    !pending.providerInvoiceId &&
    Date.now() - pending.createdAt.getTime() < 120000
  )
    return pending;
  return getDb().$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(hashtext(${id})) AS locked`;
      const stored = await tx.invoice.findUniqueOrThrow({
        where: { id },
        include: {
          proposal: { include: { items: { orderBy: { position: "asc" } } } },
        },
      });
      if (
        !lock.locked ||
        stored.status === "PAID" ||
        stored.status === "CANCELLED"
      )
        return stored;
      if (
        !allowCreate &&
        stored.status === "PENDING" &&
        stored.lastReconciledAt &&
        Date.now() - stored.lastReconciledAt.getTime() < 10000
      )
        return stored;
      try {
        const request = await paypalClient();
        let providerId = stored.providerInvoiceId;
        if (!providerId && allowCreate) {
          const config = paypalConfig();
          const draft = await request("/v2/invoicing/invoices", "POST", {
            detail: {
              invoice_number: stored.id,
              currency_code: "USD",
              reference: stored.proposalId,
              note: "ScopePay sandbox demonstration. Approved additional work.",
              payment_term: { term_type: "DUE_ON_RECEIPT" },
            },
            invoicer: {
              name: { given_name: config.given, surname: config.surname },
              business_name: config.business,
              email_address: config.email,
              address: { country_code: config.country },
            },
            primary_recipients: [
              { billing_info: { email_address: stored.buyerEmail } },
            ],
            items: stored.proposal.items.map((i) => ({
              name: i.description.slice(0, 200),
              description: `${i.description}\n${i.estimatedMinutes} minutes at ${(i.hourlyRateCents / 100).toFixed(2)} USD/hour.`,
              quantity: "1",
              unit_amount: {
                currency_code: "USD",
                value: (i.amountCents / 100).toFixed(2),
              },
            })),
            configuration: {
              partial_payment: { allow_partial_payment: false },
              allow_tip: false,
              tax_calculated_after_discount: false,
              tax_inclusive: false,
            },
          });
          if (typeof draft.id === "string") providerId = draft.id;
          else if (typeof draft.href === "string") {
            const link = new URL(draft.href);
            if (link.origin === BASE)
              providerId = link.pathname.split("/").pop() ?? null;
          }
          if (!providerId) throw new Error("Missing provider invoice ID.");
          await tx.invoice.update({
            where: { id },
            data: { providerInvoiceId: providerId },
          });
        }
        if (!providerId) {
          // Recover ambiguous creates by invoice number; never blindly create again.
          const search = await request(
            "/v2/invoicing/search-invoices?page=1&page_size=100&total_required=true",
            "POST",
            { invoice_number: stored.id },
          );
          const matches = (Array.isArray(search.items) ? search.items : [])
            .map(record)
            .filter((i) => record(i.detail).invoice_number === stored.id);
          if (matches.length !== 1 || typeof matches[0].id !== "string")
            throw new Error("Invoice creation needs reconciliation.");
          providerId = matches[0].id;
          await tx.invoice.update({
            where: { id },
            data: { providerInvoiceId: providerId },
          });
        }
        const path = `/v2/invoicing/invoices/${encodeURIComponent(providerId)}`;
        let provider = await request(path);
        if (
          record(provider.detail).invoice_number !== stored.id ||
          record(provider.detail).reference !== stored.proposalId
        )
          throw new Error("Provider invoice reference mismatch.");
        verifiedInvoiceStatus(provider, providerId, stored.totalCents);
        if (provider.status === "DRAFT") {
          // Publish the hosted payment URL without sending email notifications.
          await request(`${path}/send`, "POST", {
            send_to_recipient: false,
            send_to_invoicer: false,
          });
          provider = await request(path);
        }
        const status = verifiedInvoiceStatus(
          provider,
          providerId,
          stored.totalCents,
        );
        const paymentUrl = sandboxPaymentUrl(
          record(record(provider.detail).metadata).recipient_view_url,
        );
        if (status === "PENDING" && !paymentUrl)
          throw new Error("Missing sandbox payment link.");
        return await tx.invoice.update({
          where: { id },
          data: {
            providerInvoiceId: providerId,
            status,
            paymentUrl,
            lastReconciledAt: new Date(),
            ...(status === "PAID" ? { paidAt: new Date() } : {}),
          },
        });
      } catch {
        return tx.invoice.update({
          where: { id },
          data: { status: "ERROR", lastReconciledAt: new Date() },
        });
      }
    },
    { timeout: 120000, maxWait: 5000 },
  );
}

export async function createInvoice(
  proposalId: string,
  buyerEmail: string,
  idempotencyKey: string,
) {
  paypalConfig();
  const db = getDb();
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new ApiFailure(404, "NOT_FOUND", "Proposal not found.");
  if (proposal.status !== "ACCEPTED")
    throw new ApiFailure(
      409,
      "NOT_ACCEPTED",
      "The client must accept the approved proposal first.",
    );
  let invoice = await db.invoice.findUnique({ where: { proposalId } });
  let created = false;
  if (!invoice) {
    try {
      invoice = await db.invoice.create({
        data: {
          proposalId,
          buyerEmail,
          idempotencyKey,
          totalCents: proposal.totalCents,
        },
      });
      created = true;
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "P2002"
      )
        throw error;
      invoice = await db.invoice.findUnique({ where: { proposalId } });
      if (!invoice)
        throw new ApiFailure(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This idempotency key is already in use. Refresh and retry with a new key.",
        );
    }
  }
  if (invoice.buyerEmail !== buyerEmail)
    throw new ApiFailure(
      409,
      "INVOICE_EXISTS",
      "An invoice already exists for this proposal and its original buyer.",
    );
  return reconcileInvoice(invoice.id, created);
}
