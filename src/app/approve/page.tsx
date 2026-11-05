'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type ClientProposalView } from '@/lib/api-client';
import { Button, Card, ErrorNotice, Notice } from '@/components/ui';
import { LineItems } from '@/components/proposal-card';
import { PaymentStatus, isSettled } from '@/components/payment-status';
import { useBoundedPolling, useSubmit } from '@/components/utils/hooks';
import { formatCents, formatDateTime } from '@/components/utils/money';

/** Reads the opaque client token from `#token=…`; it is never sent anywhere but our API. */
function readToken(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('token');
}

export default function ApprovePage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [view, setView] = useState<ClientProposalView | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const sync = () => setToken(readToken());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const load = useSubmit(
    useCallback(async () => {
      if (token) setView(await api.getClientProposal(token));
    }, [token]),
  );
  const { run: reload } = load;
  useEffect(() => {
    if (token) void reload();
  }, [token, reload]);

  const accept = useSubmit(async () => {
    const proposal = await api.acceptAsClient(token!);
    setView((v) => v && { ...v, proposal });
  });

  const check = useCallback(async () => {
    if (!token) return;
    try {
      setView(await api.getClientProposal(token));
    } catch {
      // Retried on the next tick or by Refresh status.
    }
  }, [token]);
  // After acceptance, watch for the freelancer's invoice and then its payment.
  const poll = useBoundedPolling(
    check,
    !!view && view.proposal.status === 'ACCEPTED' && !isSettled(view.invoice) && view.invoice?.status !== 'ERROR',
    { intervalMs: 5_000, maxChecks: 24 },
  );

  if (token === undefined) return null;

  if (!token) {
    return (
      <Card>
        <h1 className="text-xl font-bold">Approval link incomplete</h1>
        <p className="mt-2 text-sm text-slate-700">
          This page needs the full link your freelancer sent you. Open that link again, or ask them
          to resend it.
        </p>
      </Card>
    );
  }

  if (!view) {
    if (load.error) {
      return (
        <Card>
          <h1 className="text-xl font-bold">
            {load.error.status === 401 || load.error.status === 403 || load.error.status === 404
              ? 'This link is not valid'
              : 'Could not load the change request'}
          </h1>
          <div className="mt-3">
            <ErrorNotice
              error={load.error}
              onRetry={load.error.status >= 500 || load.error.status === 0 ? () => void reload() : undefined}
              retryPending={load.pending}
            />
          </div>
        </Card>
      );
    }
    return (
      <p role="status" className="text-sm text-slate-600">
        Loading change request…
      </p>
    );
  }

  const { proposal, projectTitle, invoice } = view;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-slate-700">Change request for {projectTitle}</p>
        <h1 className="text-2xl font-bold">{proposal.title}</h1>
      </div>

      <Card>
        <h2 className="sr-only">Agreed change</h2>
        <p className="mb-4 text-sm text-slate-800">
          Your freelancer has reviewed your recent requests and quoted the work below as additional
          to the original agreement.
        </p>
        <LineItems proposal={proposal} />
      </Card>

      {proposal.status === 'APPROVED' && (
        <Card>
          <h2 className="text-lg font-semibold">Accept this change</h2>
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-900">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-indigo-700"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            I agree to this additional work for {formatCents(proposal.totalCents)} USD. I will
            receive a separate PayPal invoice.
          </label>
          <div className="mt-3">
            <ErrorNotice error={accept.error} />
          </div>
          <Button
            className="mt-3"
            disabled={!agreed}
            pending={accept.pending}
            pendingLabel="Accepting…"
            onClick={() => void accept.run()}
          >
            Accept {formatCents(proposal.totalCents)}
          </Button>
          <p className="mt-3 text-xs text-slate-600">
            Accepting does not charge you. An invoice is a payment request, not escrow.
          </p>
        </Card>
      )}

      {proposal.status === 'ACCEPTED' && (
        <Card>
          <h2 className="text-lg font-semibold">Payment</h2>
          <Notice tone="success">
            You accepted this change{proposal.acceptedAt ? ` on ${formatDateTime(proposal.acceptedAt)}` : ''}.
          </Notice>
          <div className="mt-4">
            {invoice ? (
              <PaymentStatus invoice={invoice} poll={poll} payLabel="Pay with PayPal (sandbox)" />
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-800">
                <span>Your freelancer has not sent the invoice yet. This page will show it when they do.</span>
                <Button variant="secondary" onClick={() => void poll.refresh()} pending={poll.checking} pendingLabel="Checking…">
                  Check again
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {proposal.status === 'DRAFT' && (
        <Notice tone="warning">This change request is not ready for review yet.</Notice>
      )}
    </div>
  );
}
