"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { Invoice, Proposal } from "@/shared/contracts";
import { api, isMockMode, type ProjectDetail } from "@/lib/api-client";
import {
  demoConversation,
  demoUnclearRequest,
  mockTriggers,
} from "@/mocks/fixtures";
import { AnalysisReview } from "./analysis-review";
import { ProposalCard } from "./proposal-card";
import { Button, Card, ErrorNotice, TextAreaField } from "./ui";
import { useAuthRedirect, useDraft, useSubmit } from "./utils/hooks";
import { formatCents } from "./utils/money";

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  // Approval links are only returned by the approve call, so keep them for this visit.
  const [approvalUrls, setApprovalUrls] = useState<Record<string, string>>({});

  const load = useSubmit(
    useCallback(async () => {
      setDetail(await api.getProject(projectId));
    }, [projectId]),
  );
  useAuthRedirect(load.error);
  const { run: reload } = load;

  useEffect(() => {
    void reload();
  }, [reload]);

  const upsertProposal = useCallback((proposal: Proposal) => {
    setDetail(
      (d) =>
        d && {
          ...d,
          proposals: d.proposals.some((p) => p.id === proposal.id)
            ? d.proposals.map((p) => (p.id === proposal.id ? proposal : p))
            : [...d.proposals, proposal],
        },
    );
  }, []);

  const upsertInvoice = useCallback((invoice: Invoice) => {
    setDetail(
      (d) =>
        d && {
          ...d,
          invoices: d.invoices.some((i) => i.id === invoice.id)
            ? d.invoices.map((i) => (i.id === invoice.id ? invoice : i))
            : [...d.invoices, invoice],
        },
    );
  }, []);

  const conversationRef = useRef<HTMLDivElement>(null);
  const [conversation, setConversation] = useDraft(`conversation.${projectId}`);

  if (!detail) {
    if (load.error && load.error.status !== 401) {
      return (
        <div className="flex flex-col gap-4">
          <BackLink />
          <ErrorNotice
            error={load.error}
            onRetry={
              load.error.status === 404 ? undefined : () => void reload()
            }
            retryPending={load.pending}
          />
        </div>
      );
    }
    return (
      <p role="status" className="text-sm text-slate-600">
        Loading project…
      </p>
    );
  }

  const { project, analyses, proposals, invoices } = detail;
  const allFindings = analyses.flatMap((a) => a.findings);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <BackLink />
        <h1 className="mt-2 text-2xl font-bold">{project.title}</h1>
        <p className="text-sm text-slate-700">
          Client: {project.clientName} · {formatCents(project.hourlyRateCents)}
          /hour · USD
        </p>
      </div>

      <nav
        aria-label="Project progress"
        className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm"
      >
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Scope agreed", done: true },
            { label: "Requests analyzed", done: analyses.length > 0 },
            {
              label: "Client accepted",
              done: proposals.some((p) => p.status === "ACCEPTED"),
            },
            {
              label: "Payment verified",
              done: detail.invoices.some((i) => i.status === "PAID"),
            },
          ].map((step, index) => (
            <li
              key={step.label}
              className="flex items-center gap-2 text-xs font-semibold sm:text-sm"
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-[#003087] text-white" : "bg-slate-100 text-slate-500"}`}
                aria-hidden="true"
              >
                {step.done ? "?" : index + 1}
              </span>
              <span>
                {step.label}
                <span className="sr-only">
                  {step.done ? ": complete" : ": pending"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <Card>
        <h2 className="text-lg font-semibold">Agreed scope</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
          {project.scopeText}
        </p>
      </Card>

      <div ref={conversationRef} tabIndex={-1} className="outline-none">
        <ConversationForm
          projectId={project.id}
          value={conversation}
          onChange={setConversation}
          onAnalyzed={(analysis) => {
            setDetail(
              (d) => d && { ...d, analyses: [...d.analyses, analysis] },
            );
            setConversation("");
          }}
        />
      </div>

      <section
        aria-labelledby="analyses-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="analyses-heading" className="text-lg font-semibold">
          Findings
        </h2>
        {analyses.length === 0 ? (
          <p className="text-sm text-slate-700">
            Paste a client message above and analyze it to see which requests
            are included, additional, or unclear.
          </p>
        ) : (
          [...analyses].reverse().map((analysis) => (
            <AnalysisReview
              key={analysis.id}
              analysis={analysis}
              index={analyses.indexOf(analysis) + 1}
              project={project}
              proposals={proposals}
              onProposalCreated={upsertProposal}
              onReviseConversation={(text) => {
                setConversation(`${text}\n\nClient clarification: `);
                conversationRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
                conversationRef.current?.querySelector("textarea")?.focus();
              }}
            />
          ))
        )}
      </section>

      <section
        aria-labelledby="proposals-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="proposals-heading" className="text-lg font-semibold">
          Change proposals
        </h2>
        {proposals.length === 0 ? (
          <p className="text-sm text-slate-700">
            Select additional requests in a finding to draft a proposal.
          </p>
        ) : (
          [...proposals]
            .reverse()
            .map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                findings={allFindings.filter((f) =>
                  proposal.findingIds.includes(f.id),
                )}
                invoice={
                  invoices.find((i) => i.proposalId === proposal.id) ?? null
                }
                approvalUrl={approvalUrls[proposal.id]}
                onProposal={upsertProposal}
                onApprovalUrl={(url) =>
                  setApprovalUrls((m) => ({ ...m, [proposal.id]: url }))
                }
                onInvoice={upsertInvoice}
                onRefresh={() => void reload()}
                refreshing={load.pending}
              />
            ))
        )}
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/projects"
      className="rounded text-sm font-medium text-blue-800 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600"
    >
      ← All projects
    </Link>
  );
}

function ConversationForm({
  projectId,
  value,
  onChange,
  onAnalyzed,
}: {
  projectId: string;
  value: string;
  onChange: (value: string) => void;
  onAnalyzed: (
    analysis: Awaited<ReturnType<typeof api.analyzeConversation>>,
  ) => void;
}) {
  const analyze = useSubmit(async () => {
    onAnalyzed(await api.analyzeConversation(projectId, value.trim()));
  });
  useAuthRedirect(analyze.error);
  const [emptyError, setEmptyError] = useState<string>();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) {
      setEmptyError("Paste the client conversation first.");
      return;
    }
    setEmptyError(undefined);
    void analyze.run();
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Analyze a client request</h2>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              className="min-h-8 py-1"
              onClick={() => onChange(demoConversation)}
            >
              Insert fixture conversation
            </Button>
            <Button
              variant="ghost"
              className="min-h-8 py-1"
              onClick={() => onChange(demoUnclearRequest)}
            >
              Insert unclear request
            </Button>
          </div>
        </div>
        <TextAreaField
          label="Client conversation"
          hint={
            <>
              Paste messages as plain text. The AI suggests a classification for
              each request; you decide what to quote.
              {isMockMode &&
                ` Mock: include ${mockTriggers.aiError} to simulate an AI failure.`}
            </>
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          error={emptyError ?? analyze.error?.fieldErrors.conversationText}
          rows={6}
        />
        <ErrorNotice
          error={analyze.error?.status === 401 ? null : analyze.error}
          onRetry={
            analyze.error?.status === 502 || analyze.error?.status === 0
              ? () => void analyze.run()
              : undefined
          }
          retryPending={analyze.pending}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            pending={analyze.pending}
            pendingLabel="Analyzing…"
          >
            Analyze
          </Button>
        </div>
      </form>
    </Card>
  );
}
