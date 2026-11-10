"use client";

import { useState } from "react";
import type {
  Analysis,
  Classification,
  Finding,
  Project,
  Proposal,
} from "@/shared/contracts";
import { api } from "@/lib/api-client";
import { demoEstimate } from "@/mocks/fixtures";
import { Badge, Button, Card, Quote } from "./ui";
import { ProposalForm, type ProposalFormValues } from "./proposal-form";
import { useAuthRedirect, useSubmit } from "./utils/hooks";

const classificationUi: Record<
  Classification,
  { label: string; tone: "green" | "indigo" | "amber"; summary: string }
> = {
  INCLUDED: {
    label: "Included",
    tone: "green",
    summary: "Covered by the agreed scope. No extra charge.",
  },
  ADDITIONAL: {
    label: "Additional",
    tone: "indigo",
    summary: "Outside the agreed scope. Can be quoted.",
  },
  UNCLEAR: {
    label: "Unclear",
    tone: "amber",
    summary: "Needs clarification before it can be quoted.",
  },
};

export function AnalysisReview({
  analysis,
  project,
  proposals,
  index,
  onProposalCreated,
  onReviseConversation,
}: {
  analysis: Analysis;
  project: Project;
  proposals: Proposal[];
  index: number;
  onProposalCreated: (proposal: Proposal) => void;
  onReviseConversation: (text: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);

  const quoted = new Set(proposals.flatMap((p) => p.findingIds));
  const counts = analysis.findings.reduce<Record<Classification, number>>(
    (acc, f) => ({ ...acc, [f.classification]: acc[f.classification] + 1 }),
    { INCLUDED: 0, ADDITIONAL: 0, UNCLEAR: 0 },
  );
  const selectedFindings = analysis.findings.filter((f) =>
    selected.includes(f.id),
  );

  const create = useSubmit(async (values: ProposalFormValues) => {
    const proposal = await api.createProposal(project.id, {
      analysisId: analysis.id,
      findingIds: selected,
      ...values,
    });
    setDrafting(false);
    setSelected([]);
    onProposalCreated(proposal);
  });
  useAuthRedirect(create.error);

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Analysis {index}</h3>
        <p className="text-sm text-slate-700">
          {counts.ADDITIONAL} additional · {counts.INCLUDED} included ·{" "}
          {counts.UNCLEAR} unclear
        </p>
      </div>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-blue-800">
          Conversation analyzed
        </summary>
        <p className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-slate-800">
          {analysis.conversationText}
        </p>
      </details>

      {analysis.findings.length === 0 ? (
        <p className="mt-4 text-sm text-slate-700">
          No requests were found in this conversation.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {analysis.findings.map((f) => (
            <FindingItem
              key={f.id}
              finding={f}
              selected={selected.includes(f.id)}
              alreadyQuoted={quoted.has(f.id)}
              onToggle={() => toggle(f.id)}
              disabled={drafting}
            />
          ))}
        </ul>
      )}

      {counts.UNCLEAR > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-950">
          <p>
            Unclear requests cannot be quoted. Ask the client the clarification
            question, add their answer to the conversation, and analyze again.
          </p>
          <Button
            variant="secondary"
            onClick={() => onReviseConversation(analysis.conversationText)}
          >
            Revise conversation
          </Button>
        </div>
      )}

      {counts.ADDITIONAL > 0 && !drafting && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <p className="text-sm text-slate-700" aria-live="polite">
            {selected.length
              ? `${selected.length} additional request${selected.length > 1 ? "s" : ""} selected`
              : "Select additional requests to quote"}
          </p>
          <Button disabled={!selected.length} onClick={() => setDrafting(true)}>
            Draft change proposal
          </Button>
        </div>
      )}

      {drafting && (
        <div className="mt-5 border-t border-slate-200 pt-5">
          <h4 className="mb-3 font-semibold">New change proposal</h4>
          <ProposalForm
            initial={{
              title:
                selectedFindings.length === 1
                  ? selectedFindings[0]!.title
                  : `Additional work: ${selectedFindings.length} requests`,
              items: selectedFindings.map((f) => ({
                description: f.title,
                estimatedMinutes: 0,
                hourlyRateCents: project.hourlyRateCents,
              })),
            }}
            submitLabel="Save draft proposal"
            pendingLabel="Saving…"
            pending={create.pending}
            error={create.error}
            onSubmit={(values) => void create.run(values)}
            onCancel={() => setDrafting(false)}
          />
          <p className="mt-3 text-xs text-slate-600">
            Synthetic demo: the fixture estimate is {demoEstimate.minutes}{" "}
            minutes at $50/hour.
          </p>
        </div>
      )}
    </Card>
  );
}

function FindingItem({
  finding,
  selected,
  alreadyQuoted,
  onToggle,
  disabled,
}: {
  finding: Finding;
  selected: boolean;
  alreadyQuoted: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const ui = classificationUi[finding.classification];
  const selectable = finding.classification === "ADDITIONAL";
  const checkboxId = `select-${finding.id}`;
  return (
    <li
      className={`rounded-md border p-4 ${selected ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {selectable && (
            <input
              id={checkboxId}
              type="checkbox"
              className="mt-1 size-4 accent-blue-700"
              checked={selected}
              onChange={onToggle}
              disabled={disabled}
              aria-describedby={`${checkboxId}-summary`}
            />
          )}
          <div>
            <label
              htmlFor={selectable ? checkboxId : undefined}
              className="font-medium text-slate-900"
            >
              {finding.title}
            </label>
            <p id={`${checkboxId}-summary`} className="text-sm text-slate-700">
              {ui.summary}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {alreadyQuoted && <Badge tone="slate">In a proposal</Badge>}
          <Badge tone={ui.tone}>{ui.label}</Badge>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-800">{finding.explanation}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <Quote label="Client request">{finding.requestQuote}</Quote>
        {finding.scopeQuote ? (
          <Quote label="Agreed scope">{finding.scopeQuote}</Quote>
        ) : (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            No matching line in the agreed scope.
          </p>
        )}
      </div>
      {finding.clarificationQuestion && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <strong>Ask the client:</strong> {finding.clarificationQuestion}
        </p>
      )}
    </li>
  );
}
