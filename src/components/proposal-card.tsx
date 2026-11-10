"use client";

import { useCallback, useState } from "react";
import type {
  Finding,
  Invoice,
  Proposal,
  ProposalStatus,
} from "@/shared/contracts";
import { api } from "@/lib/api-client";
import { Badge, Button, Card, ErrorNotice } from "./ui";
import { ProposalForm, type ProposalFormValues } from "./proposal-form";
import { InvoicePanel } from "./invoice-panel";
import { useAuthRedirect, useSubmit } from "./utils/hooks";
import { formatCents, formatDateTime, formatMinutes } from "./utils/money";

const statusUi: Record<
  ProposalStatus,
  { label: string; tone: "slate" | "indigo" | "green" }
> = {
  DRAFT: { label: "Draft", tone: "slate" },
  APPROVED: { label: "Sent to client", tone: "indigo" },
  ACCEPTED: { label: "Accepted by client", tone: "green" },
};

export function ProposalCard({
  proposal,
  findings,
  invoice,
  approvalUrl,
  onProposal,
  onApprovalUrl,
  onInvoice,
  onRefresh,
  refreshing,
}: {
  proposal: Proposal;
  findings: Finding[];
  invoice: Invoice | null;
  approvalUrl: string | undefined;
  onProposal: (proposal: Proposal) => void;
  onApprovalUrl: (url: string) => void;
  onInvoice: (invoice: Invoice) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const save = useSubmit(async (values: ProposalFormValues) => {
    onProposal(await api.updateProposal(proposal.id, values));
    setConfirmed(false);
  });
  // Repeat approval returns the existing link, so this also recovers a lost link.
  const approve = useSubmit(async () => {
    const result = await api.approveProposal(proposal.id);
    onProposal(result.proposal);
    onApprovalUrl(result.approvalUrl);
  });
  useAuthRedirect(save.error ?? approve.error);

  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);
  const ui = statusUi[proposal.status];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{proposal.title}</h3>
          {findings.length > 0 && (
            <p className="text-sm text-slate-700">
              For: {findings.map((f) => f.title).join("; ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={ui.tone}>{ui.label}</Badge>
          <span className="text-lg font-bold">
            {formatCents(proposal.totalCents)}
          </span>
        </div>
      </div>

      {proposal.status === "DRAFT" ? (
        <div className="mt-4 flex flex-col gap-5">
          <ProposalForm
            initial={{ title: proposal.title, items: proposal.items }}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            pending={save.pending}
            error={save.error}
            onSubmit={(values) => void save.run(values)}
            onDirtyChange={onDirtyChange}
          />
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
            <h4 className="font-semibold text-blue-950">
              Approve and create the client link
            </h4>
            <p className="mt-1 text-sm text-blue-950">
              Once approved, the proposal can no longer be edited and your
              client is asked to accept exactly{" "}
              <strong>{formatCents(proposal.totalCents)}</strong>.
            </p>
            {dirty ? (
              <p className="mt-3 text-sm font-medium text-amber-900">
                Save your changes before approving.
              </p>
            ) : (
              <>
                <label className="mt-3 flex items-start gap-2 text-sm text-blue-950">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-blue-700"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I have reviewed the line items and approve{" "}
                  {formatCents(proposal.totalCents)} USD.
                </label>
                <ErrorNotice
                  error={approve.error?.status === 401 ? null : approve.error}
                />
                <Button
                  className="mt-3"
                  disabled={!confirmed}
                  pending={approve.pending}
                  pendingLabel="Approving…"
                  onClick={() => void approve.run()}
                >
                  Approve proposal
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <LineItems proposal={proposal} />
          <p className="text-xs text-slate-600">
            {proposal.approvedAt &&
              `Approved ${formatDateTime(proposal.approvedAt)}. `}
            {proposal.acceptedAt &&
              `Accepted by client ${formatDateTime(proposal.acceptedAt)}.`}
          </p>

          <ClientLink
            url={approvalUrl}
            onReveal={() => void approve.run()}
            pending={approve.pending}
          />
          <ErrorNotice
            error={approve.error?.status === 401 ? null : approve.error}
          />

          {proposal.status === "APPROVED" && (
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3 text-sm text-slate-800">
              <span>
                Waiting for the client to accept. You can invoice after they
                accept.
              </span>
              <Button
                variant="secondary"
                onClick={onRefresh}
                pending={refreshing}
                pendingLabel="Checking…"
              >
                Check for acceptance
              </Button>
            </div>
          )}

          {proposal.status === "ACCEPTED" && (
            <InvoicePanel
              proposal={proposal}
              invoice={invoice}
              onInvoice={onInvoice}
            />
          )}
        </div>
      )}
    </Card>
  );
}

export function LineItems({ proposal }: { proposal: Proposal }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs sm:text-sm">
        <caption className="sr-only">Line items</caption>
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Work
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Time
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Rate
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {proposal.items.map((item, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-2 pr-3 break-words">{item.description}</td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {formatMinutes(item.estimatedMinutes)}
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {formatCents(item.hourlyRateCents)}/h
              </td>
              <td className="py-2 text-right whitespace-nowrap">
                {formatCents(item.amountCents)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3} className="pt-2 font-semibold">
              Total (USD)
            </th>
            <td className="pt-2 text-right font-bold">
              {formatCents(proposal.totalCents)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ClientLink({
  url,
  onReveal,
  pending,
}: {
  url: string | undefined;
  onReveal: () => void;
  pending: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!url) {
    return (
      <div>
        <Button
          variant="secondary"
          onClick={onReveal}
          pending={pending}
          pendingLabel="Loading link…"
        >
          Show client approval link
        </Button>
      </div>
    );
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <label
        className="text-sm font-medium text-slate-800"
        htmlFor="client-link"
      >
        Client approval link: share it only with your client
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="client-link"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs"
        />
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          Open client view <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
