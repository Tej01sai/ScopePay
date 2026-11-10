import "server-only";
import { createHash, createHmac } from "node:crypto";
import { getDb } from "@/server/db";
import { demoSecret } from "@/server/auth";
import { ApiFailure } from "@/server/http";
import { priceItems, text } from "@/server/domain";
import type { Prisma } from "@/generated/prisma/client";
import type { Proposal, Invoice } from "@/shared/contracts";

export const proposalInclude = {
  items: { orderBy: { position: "asc" as const } },
  findings: { select: { id: true } },
} satisfies Prisma.ProposalInclude;
export function proposalDto(
  p: Prisma.ProposalGetPayload<{ include: typeof proposalInclude }>,
): Proposal {
  return {
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
  };
}
export function invoiceDto(i: Prisma.InvoiceGetPayload<object>): Invoice {
  return {
    id: i.id,
    proposalId: i.proposalId,
    providerInvoiceId: i.providerInvoiceId,
    paymentUrl: i.paymentUrl,
    status: i.status,
    totalCents: i.totalCents,
    currency: i.currency,
    paidAt: i.paidAt?.toISOString() ?? null,
  };
}
export function proposalInput(body: Record<string, unknown>) {
  try {
    return { title: text(body.title), ...priceItems(body.items) };
  } catch (e) {
    throw new ApiFailure(
      400,
      "INVALID_INPUT",
      e instanceof Error ? e.message : "Invalid proposal.",
    );
  }
}
export function clientToken(id: string) {
  return createHmac("sha256", demoSecret())
    .update(`scopepay-client:${id}`)
    .digest("base64url");
}
export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function clientProposal(request: Request) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match)
    throw new ApiFailure(
      401,
      "INVALID_TOKEN",
      "This approval link is not valid.",
    );
  const p = await getDb().proposal.findUnique({
    where: { clientTokenHash: tokenHash(match[1]) },
    include: { ...proposalInclude, project: { select: { title: true } } },
  });
  if (
    !p ||
    p.status === "DRAFT" ||
    tokenHash(clientToken(p.id)) !== tokenHash(match[1])
  )
    throw new ApiFailure(404, "NOT_FOUND", "This approval link is not valid.");
  return p;
}

/** Row locking serializes edits, approval and acceptance across app replicas. */
export async function lockedProposal<T>(
  id: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return getDb().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Proposal" WHERE id = ${id} FOR UPDATE`;
      return work(tx);
    },
    // Remote database round trips can exceed Prisma's five-second default.
    { maxWait: 10000, timeout: 30000 },
  );
}
