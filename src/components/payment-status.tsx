"use client";

import type { Invoice, InvoiceStatus } from "@/shared/contracts";
import { Badge, Button } from "./ui";
import type { PollState } from "./utils/hooks";
import { formatCents, formatDateTime } from "./utils/money";

const statusUi: Record<
  InvoiceStatus,
  {
    label: string;
    tone: "slate" | "green" | "amber" | "red" | "sky";
    text: string;
  }
> = {
  CREATING: {
    label: "Creating",
    tone: "sky",
    text: "The invoice is being created in PayPal.",
  },
  PENDING: {
    label: "Awaiting payment",
    tone: "amber",
    text: "The invoice has been sent. This status updates once ScopePay confirms the payment with PayPal.",
  },
  PAID: {
    label: "Paid",
    tone: "green",
    text: "Payment confirmed with PayPal.",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "slate",
    text: "This invoice was cancelled. No payment will be collected through it.",
  },
  ERROR: {
    label: "Problem",
    tone: "red",
    text: "PayPal reported a problem with this invoice. Refresh to check again with PayPal.",
  },
};

export const isSettled = (invoice: Invoice | null) =>
  !!invoice && (invoice.status === "PAID" || invoice.status === "CANCELLED");

/**
 * Shows the invoice state exactly as the backend reports it. A return from
 * PayPal never changes this panel; only a backend response does.
 */
export function PaymentStatus({
  invoice,
  poll,
  payLabel,
}: {
  invoice: Invoice;
  poll: PollState & { refresh: () => Promise<void> };
  payLabel: string;
}) {
  const ui = statusUi[invoice.status];
  const canPay = invoice.status === "PENDING" && invoice.paymentUrl;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">
            Invoice {formatCents(invoice.totalCents)}
          </span>
          <Badge tone={ui.tone}>{ui.label}</Badge>
        </div>
        {invoice.providerInvoiceId && (
          <span className="break-all font-mono text-xs text-slate-600">
            {invoice.providerInvoiceId}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-800" aria-live="polite">
        {ui.text}
        {invoice.status === "PAID" &&
          invoice.paidAt &&
          ` Paid ${formatDateTime(invoice.paidAt)}.`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {canPay && (
          <a
            href={invoice.paymentUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center rounded-full bg-[#003087] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {payLabel} <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        {!isSettled(invoice) && (
          <Button
            variant="secondary"
            onClick={() => void poll.refresh()}
            pending={poll.checking}
            pendingLabel="Checking…"
          >
            Refresh status
          </Button>
        )}
        {!isSettled(invoice) && (
          <span className="text-xs text-slate-600">
            {invoice.status === "ERROR"
              ? "Automatic checks paused. Refresh status to reconcile this invoice."
              : poll.exhausted
                ? "Automatic checks paused. Use Refresh status after paying."
                : "Checking automatically every few seconds."}
            {poll.lastCheckedAt &&
              ` Last checked ${poll.lastCheckedAt.toLocaleTimeString()}.`}
          </span>
        )}
      </div>
    </div>
  );
}
