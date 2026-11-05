'use client';

import { useCallback, useState, type FormEvent } from 'react';
import type { Invoice, Proposal } from '@/shared/contracts';
import { api, isMockMode } from '@/lib/api-client';
import { mockTriggers } from '@/mocks/fixtures';
import { Button, ErrorNotice, InputField } from './ui';
import { PaymentStatus, isSettled } from './payment-status';
import { useAuthRedirect, useBoundedPolling, useDraft, useSubmit } from './utils/hooks';
import { formatCents } from './utils/money';

/**
 * One Idempotency-Key per proposal, kept until an invoice comes back, so a
 * retry after a timeout or a double click can never create a second invoice.
 */
function idempotencyKeyFor(proposalId: string): string {
  const storageKey = `scopepay.invoiceKey.${proposalId}`;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const key = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, key);
    return key;
  } catch {
    return `${proposalId}-invoice`;
  }
}

function clearIdempotencyKey(proposalId: string) {
  try {
    window.sessionStorage.removeItem(`scopepay.invoiceKey.${proposalId}`);
  } catch {
    // Ignore.
  }
}

/** Freelancer side: create the PayPal invoice for an accepted proposal and track it. */
export function InvoicePanel({
  proposal,
  invoice,
  onInvoice,
}: {
  proposal: Proposal;
  invoice: Invoice | null;
  onInvoice: (invoice: Invoice) => void;
}) {
  const [buyerEmail, setBuyerEmail] = useDraft(`buyerEmail.${proposal.id}`);
  const [emailError, setEmailError] = useState<string>();

  const create = useSubmit(async () => {
    const created = await api.createInvoice(
      proposal.id,
      buyerEmail.trim(),
      idempotencyKeyFor(proposal.id),
    );
    clearIdempotencyKey(proposal.id);
    onInvoice(created);
  });
  useAuthRedirect(create.error);

  const check = useCallback(async () => {
    try {
      const latest = await api.getInvoice(proposal.id);
      if (latest) onInvoice(latest);
    } catch {
      // A failed check is retried on the next tick or by Refresh status.
    }
  }, [proposal.id, onInvoice]);

  const poll = useBoundedPolling(
    check,
    !!invoice && !isSettled(invoice) && invoice.status !== 'ERROR',
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail.trim())) {
      setEmailError('Enter the email address of the client’s PayPal sandbox buyer account.');
      return;
    }
    setEmailError(undefined);
    void create.run();
  }

  if (invoice) {
    return <PaymentStatus invoice={invoice} poll={poll} payLabel="Open PayPal invoice" />;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-800">
        The client accepted. Create a PayPal sandbox invoice for the approved{' '}
        <strong>{formatCents(proposal.totalCents)}</strong>. The amount comes from the stored
        proposal, not from this page.
      </p>
      <InputField
        label="Client’s email for the invoice"
        type="email"
        autoComplete="off"
        value={buyerEmail}
        onChange={(e) => setBuyerEmail(e.target.value)}
        error={emailError ?? create.error?.fieldErrors.buyerEmail}
        hint={
          isMockMode
            ? `Mock: use ${mockTriggers.providerErrorEmail} to simulate a PayPal failure.`
            : 'Use a PayPal sandbox buyer account email.'
        }
      />
      <ErrorNotice
        error={create.error?.status === 401 ? null : create.error}
        onRetry={create.error?.status === 409 || create.error?.status === 502 || create.error?.status === 0 ? () => void create.run() : undefined}
        retryPending={create.pending}
      />
      <div>
        <Button type="submit" pending={create.pending} pendingLabel="Creating invoice…">
          Create PayPal invoice
        </Button>
      </div>
    </form>
  );
}
