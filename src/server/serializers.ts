import type { Prisma } from "@/generated/prisma/client";
import type { Project, GetProjectResponse } from "@/shared/contracts";

export function projectDto(row: Prisma.ProjectGetPayload<object>): Project {
  return {
    id: row.id,
    title: row.title,
    clientName: row.clientName,
    scopeText: row.scopeText,
    hourlyRateCents: row.hourlyRateCents,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
  };
}

export const projectDetailInclude = {
  analyses: {
    include: { findings: true },
    orderBy: { createdAt: "asc" as const },
  },
  proposals: {
    include: {
      findings: { select: { id: true } },
      items: { orderBy: { position: "asc" as const } },
      invoice: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.ProjectInclude;

/** Explicit public fields keep client token hashes, emails and idempotency keys private. */
export function projectDetailDto(
  row: Prisma.ProjectGetPayload<{ include: typeof projectDetailInclude }>,
): GetProjectResponse {
  return {
    project: projectDto(row),
    analyses: row.analyses.map((a) => ({
      id: a.id,
      projectId: a.projectId,
      conversationText: a.conversationText,
      findings: a.findings.map((f) => ({
        id: f.id,
        classification: f.classification,
        title: f.title,
        explanation: f.explanation,
        scopeQuote: f.scopeQuote,
        requestQuote: f.requestQuote,
        clarificationQuestion: f.clarificationQuestion,
      })),
    })),
    proposals: row.proposals.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      analysisId: p.analysisId,
      findingIds: p.findings.map((f) => f.id),
      title: p.title,
      items: p.items.map((i) => ({
        description: i.description,
        estimatedMinutes: i.estimatedMinutes,
        hourlyRateCents: i.hourlyRateCents,
        amountCents: i.amountCents,
      })),
      totalCents: p.totalCents,
      currency: p.currency,
      status: p.status,
      approvedAt: p.approvedAt?.toISOString() ?? null,
      acceptedAt: p.acceptedAt?.toISOString() ?? null,
    })),
    invoices: row.proposals.flatMap((p) =>
      p.invoice
        ? [
            {
              id: p.invoice.id,
              proposalId: p.invoice.proposalId,
              providerInvoiceId: p.invoice.providerInvoiceId,
              paymentUrl: p.invoice.paymentUrl,
              status: p.invoice.status,
              totalCents: p.invoice.totalCents,
              currency: p.invoice.currency,
              paidAt: p.invoice.paidAt?.toISOString() ?? null,
            },
          ]
        : [],
    ),
  };
}
