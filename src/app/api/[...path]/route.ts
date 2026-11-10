import { requireOrigin, requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { ApiFailure, handle, readJson, success } from "@/server/http";
import { analyze } from "@/server/ai";
import { text } from "@/server/domain";
import {
  clientProposal,
  clientToken,
  tokenHash,
  proposalDto,
  invoiceDto,
  proposalInclude,
  proposalInput,
  lockedProposal,
} from "@/server/proposals";
import { createInvoice, reconcileInvoice } from "@/server/paypal";

export const runtime = "nodejs";
export const maxDuration = 180;
type Context = { params: Promise<{ path: string[] }> };

async function dispatch(request: Request, context: Context) {
  return handle(async () => {
    const { path } = await context.params;
    const method = request.method;
    if (path[0] === "client" && path.length === 2) {
      if (method !== "GET") requireOrigin(request);
      const p = await clientProposal(request);
      if (method === "GET" && path[1] === "proposal") {
        const invoice = await getDb().invoice.findUnique({
          where: { proposalId: p.id },
        });
        return success({
          proposal: proposalDto(p),
          projectTitle: p.project.title,
          invoice: invoice
            ? invoiceDto(await reconcileInvoice(invoice.id))
            : null,
        });
      }
      if (method === "POST" && path[1] === "accept") {
        if ((await readJson(request)).accepted !== true)
          throw new ApiFailure(
            400,
            "INVALID_INPUT",
            "Explicit acceptance is required.",
          );
        const accepted = await lockedProposal(p.id, async (tx) => {
          await tx.proposal.updateMany({
            where: { id: p.id, status: "APPROVED" },
            data: { status: "ACCEPTED", acceptedAt: new Date() },
          });
          return tx.proposal.findUniqueOrThrow({
            where: { id: p.id },
            include: proposalInclude,
          });
        });
        return success(proposalDto(accepted));
      }
    } else {
      await requireSession();
      if (method !== "GET") requireOrigin(request);
      const [area, id, action] = path;
      if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id))
        throw new ApiFailure(404, "NOT_FOUND", "Resource not found.");
      if (area === "projects" && path.length === 3 && method === "POST") {
        const project = await getDb().project.findUnique({ where: { id } });
        if (!project)
          throw new ApiFailure(404, "NOT_FOUND", "Project not found.");
        const body = await readJson(request, 256000);
        if (action === "analyses") {
          const conversation = body.conversationText;
          if (
            typeof conversation !== "string" ||
            !conversation.trim() ||
            conversation.length > 40000
          )
            throw new ApiFailure(
              400,
              "INVALID_INPUT",
              "Enter 1–40000 characters of conversation.",
            );
          const minute = new Date(Math.floor(Date.now() / 60000) * 60000);
          // Atomic database counter across processes. Reserve before the model call.
          const rows = await getDb().$queryRaw<
            { count: number }[]
          >`INSERT INTO "AnalysisBudget" (id, "windowStart", count) VALUES ('workspace', ${minute}, 1) ON CONFLICT (id) DO UPDATE SET "windowStart" = EXCLUDED."windowStart", count = CASE WHEN "AnalysisBudget"."windowStart" < EXCLUDED."windowStart" THEN 1 ELSE "AnalysisBudget".count + 1 END WHERE "AnalysisBudget"."windowStart" < EXCLUDED."windowStart" OR "AnalysisBudget".count < 10 RETURNING count`;
          if (!rows.length)
            throw new ApiFailure(
              429,
              "RATE_LIMITED",
              "Analysis limit reached. Try again in a minute.",
            );
          const findings = await analyze(project.scopeText, conversation);
          const result = await getDb().analysis.create({
            data: {
              projectId: id,
              conversationText: conversation,
              findings: { create: findings },
            },
            include: { findings: true },
          });
          return success(
            {
              id: result.id,
              projectId: id,
              conversationText: conversation,
              findings: result.findings.map(
                ({
                  id,
                  classification,
                  title,
                  explanation,
                  scopeQuote,
                  requestQuote,
                  clarificationQuestion,
                }) => ({
                  id,
                  classification,
                  title,
                  explanation,
                  scopeQuote,
                  requestQuote,
                  clarificationQuestion,
                }),
              ),
            },
            201,
          );
        }
        if (action === "proposals") {
          const input = proposalInput(body);
          if (
            typeof body.analysisId !== "string" ||
            !Array.isArray(body.findingIds) ||
            body.findingIds.length < 1 ||
            body.findingIds.length > 30 ||
            !body.findingIds.every((v) => typeof v === "string") ||
            new Set(body.findingIds).size !== body.findingIds.length
          )
            throw new ApiFailure(
              400,
              "INVALID_INPUT",
              "Select additional findings from one analysis.",
            );
          const analysis = await getDb().analysis.findFirst({
            where: { id: body.analysisId, projectId: id },
            include: { findings: true },
          });
          const ids = body.findingIds as string[];
          if (
            !analysis ||
            ids.some(
              (id) =>
                !analysis.findings.some(
                  (f) => f.id === id && f.classification === "ADDITIONAL",
                ),
            )
          )
            throw new ApiFailure(
              400,
              "INVALID_FINDINGS",
              "Only additional findings from this project's analysis can be proposed.",
            );
          const p = await getDb().proposal.create({
            data: {
              projectId: id,
              analysisId: analysis.id,
              title: input.title,
              totalCents: input.totalCents,
              findings: { connect: ids.map((id) => ({ id })) },
              items: {
                create: input.items.map((i, position) => ({ ...i, position })),
              },
            },
            include: proposalInclude,
          });
          return success(proposalDto(p), 201);
        }
      }
      if (area === "proposals") {
        if (path.length === 2 && method === "PATCH") {
          const input = proposalInput(await readJson(request));
          return success(
            proposalDto(
              await lockedProposal(id, async (tx) => {
                const p = await tx.proposal.findUnique({ where: { id } });
                if (!p)
                  throw new ApiFailure(404, "NOT_FOUND", "Proposal not found.");
                if (p.status !== "DRAFT")
                  throw new ApiFailure(
                    409,
                    "PROPOSAL_FROZEN",
                    "Approved proposals cannot be edited. Create a new draft.",
                  );
                return tx.proposal.update({
                  where: { id },
                  data: {
                    title: input.title,
                    totalCents: input.totalCents,
                    items: {
                      deleteMany: {},
                      create: input.items.map((i, position) => ({
                        ...i,
                        position,
                      })),
                    },
                  },
                  include: proposalInclude,
                });
              }),
            ),
          );
        }
        if (path.length === 3 && action === "approve" && method === "POST") {
          const token = clientToken(id);
          const p = await lockedProposal(id, async (tx) => {
            const existing = await tx.proposal.findUnique({ where: { id } });
            if (!existing)
              throw new ApiFailure(404, "NOT_FOUND", "Proposal not found.");
            if (
              existing.status !== "DRAFT" &&
              existing.clientTokenHash !== tokenHash(token)
            )
              throw new ApiFailure(
                409,
                "CLIENT_LINK_REVOKED",
                "The demo secret changed. Create a new proposal and approval link.",
              );
            if (existing.status === "DRAFT")
              await tx.proposal.update({
                where: { id },
                data: {
                  status: "APPROVED",
                  approvedAt: new Date(),
                  clientTokenHash: tokenHash(token),
                },
              });
            return tx.proposal.findUniqueOrThrow({
              where: { id },
              include: proposalInclude,
            });
          });
          return success({
            proposal: proposalDto(p),
            approvalUrl: `${new URL(process.env.APP_URL!).origin}/approve#token=${token}`,
          });
        }
        if (path.length === 3 && action === "invoice") {
          if (method === "POST") {
            const body = await readJson(request);
            let email: string;
            try {
              email = text(body.buyerEmail, 254);
            } catch {
              throw new ApiFailure(
                400,
                "INVALID_INPUT",
                "Enter the sandbox buyer email.",
              );
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
              throw new ApiFailure(
                400,
                "INVALID_INPUT",
                "Enter a valid sandbox buyer email.",
              );
            const key = request.headers.get("idempotency-key") ?? "";
            if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key))
              throw new ApiFailure(
                400,
                "INVALID_INPUT",
                "A valid Idempotency-Key header is required.",
              );
            return success(invoiceDto(await createInvoice(id, email, key)));
          }
          if (method === "GET") {
            if (!(await getDb().proposal.findUnique({ where: { id } })))
              throw new ApiFailure(404, "NOT_FOUND", "Proposal not found.");
            const invoice = await getDb().invoice.findUnique({
              where: { proposalId: id },
            });
            return success(
              invoice ? invoiceDto(await reconcileInvoice(invoice.id)) : null,
            );
          }
        }
      }
    }
    throw new ApiFailure(404, "NOT_FOUND", "API endpoint not found.");
  });
}
export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
