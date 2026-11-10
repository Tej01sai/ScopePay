// In-browser mock of the ScopePay API (NEXT_PUBLIC_USE_MOCKS=true only).
// It follows INTEGRATION.md's envelopes, status codes, money math and state
// rules so the UI behaves the same against mocks and the real backend.
// Data lives in localStorage, so the client approval page and the mock PayPal
// page in other tabs of the same browser see the same "server".
import type {
  Analysis,
  Classification,
  Finding,
  Invoice,
  Project,
  Proposal,
  ProposalItemInput,
} from "@/shared/contracts";
import type { TransportRequest, TransportResponse } from "@/lib/api-client";
import { mockTriggers } from "./fixtures";

type ProviderStatus = "PENDING" | "PAID" | "CANCELLED";

type MockDb = {
  session: boolean;
  projects: Project[];
  analyses: Analysis[];
  proposals: Proposal[];
  invoices: Invoice[];
  /** Client token → proposal id. */
  tokens: Record<string, string>;
  /** Idempotency-Key → invoice id. */
  idempotency: Record<string, string>;
  /** What the simulated PayPal side thinks; copied into invoices on reconcile. */
  provider: Record<string, ProviderStatus>;
};

const STORAGE_KEY = "scopepay.mock.v1";

const emptyDb = (): MockDb => ({
  session: false,
  projects: [],
  analyses: [],
  proposals: [],
  invoices: [],
  tokens: {},
  idempotency: {},
  provider: {},
});

let memoryDb: MockDb = emptyDb();

function load(): MockDb {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptyDb(), ...(JSON.parse(raw) as Partial<MockDb>) };
  } catch {
    // Storage unavailable (private mode, blocked); fall back to memory.
  }
  return memoryDb;
}

function save(db: MockDb) {
  memoryDb = db;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Memory copy is enough for this tab.
  }
}

export function resetMockData() {
  save(emptyDb());
}

// ---- Simulated PayPal side, used by the mock checkout page ------------------

export function getMockInvoice(invoiceId: string): Invoice | null {
  return load().invoices.find((i) => i.id === invoiceId) ?? null;
}

export function setMockProviderStatus(
  invoiceId: string,
  status: ProviderStatus,
) {
  const db = load();
  if (!db.invoices.some((i) => i.id === invoiceId)) return;
  db.provider[invoiceId] = status;
  save(db);
}

// ---- Helpers ------------------------------------------------------------------

const ok = (data: unknown, status = 200): TransportResponse => ({
  status,
  json: { data },
});

const fail = (
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
): TransportResponse => ({
  status,
  json: { error: { code, message, fieldErrors } },
});

const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

const now = () => new Date().toISOString();

const delay = () =>
  new Promise((r) => setTimeout(r, 250 + Math.random() * 350));

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const lineAmount = (item: ProposalItemInput) =>
  Math.round((item.estimatedMinutes * item.hourlyRateCents) / 60);

function priced(items: ProposalItemInput[]) {
  const lines = items.map((i) => ({ ...i, amountCents: lineAmount(i) }));
  return {
    items: lines,
    totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0),
  };
}

function validateItems(raw: unknown): {
  items?: ProposalItemInput[];
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  if (!Array.isArray(raw) || raw.length === 0) {
    return { errors: { items: "Add at least one line item." } };
  }
  const items: ProposalItemInput[] = [];
  raw.forEach((r, i) => {
    const description =
      isRecord(r) && typeof r.description === "string"
        ? r.description.trim()
        : "";
    const minutes = isRecord(r) ? r.estimatedMinutes : undefined;
    const rate = isRecord(r) ? r.hourlyRateCents : undefined;
    if (!description) errors[`items.${i}.description`] = "Describe the work.";
    if (!Number.isInteger(minutes) || (minutes as number) <= 0)
      errors[`items.${i}.estimatedMinutes`] =
        "Enter a positive whole number of minutes.";
    if (!Number.isInteger(rate) || (rate as number) <= 0)
      errors[`items.${i}.hourlyRateCents`] = "Enter a positive hourly rate.";
    items.push({
      description,
      estimatedMinutes: minutes as number,
      hourlyRateCents: rate as number,
    });
  });
  return Object.keys(errors).length ? { errors } : { items, errors };
}

function reconcile(db: MockDb, invoice: Invoice): Invoice {
  const providerStatus = db.provider[invoice.id];
  // Never downgrade a verified PAID invoice.
  if (
    !providerStatus ||
    invoice.status === "PAID" ||
    providerStatus === invoice.status
  )
    return invoice;
  invoice.status = providerStatus;
  if (providerStatus === "PAID") invoice.paidAt = now();
  return invoice;
}

// ---- Mock analysis: keyword rules standing in for the AI --------------------

function sentences(text: string): string[] {
  return (text.match(/[^.!?\n]+[.!?]?/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

const stem = (w: string) => w.toLowerCase().replace(/(es|s)$/, "");

function keywords(text: string): Set<string> {
  return new Set((text.match(/[a-z]{4,}/gi) ?? []).map(stem));
}

const VAGUE = /\b(better|nicer|improve|polish|pop|modern|cleaner|fresh)\b/i;
const REVISION = /\b(revision|revise|tweak|change|adjust|fix)\b/i;
const NEW_WORK = /\b(add|extra|new|another|more|additional|also need)\b/i;

function titleFrom(sentence: string): string {
  const t = sentence
    .replace(/^(please|also|and|could you|can you)\s+/i, "")
    .replace(/[.!?]$/, "");
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return capped.length > 70 ? `${capped.slice(0, 67)}…` : capped;
}

function classify(scopeText: string, request: string): Omit<Finding, "id"> {
  const scope = sentences(scopeText);
  const words = keywords(request);
  const shares = (s: string) => [...keywords(s)].some((w) => words.has(w));
  const base = { title: titleFrom(request), requestQuote: request };

  if (VAGUE.test(request) && request.split(/\s+/).length <= 8) {
    return {
      ...base,
      classification: "UNCLEAR",
      explanation:
        "The request does not say what should change, so it cannot be compared with the agreed scope.",
      scopeQuote: null,
      clarificationQuestion:
        "Which screens should change, and what specifically should be different?",
    };
  }
  const revisionClause = scope.find((s) => /revision/i.test(s));
  if (
    REVISION.test(request) &&
    revisionClause &&
    !NEW_WORK.test(request.replace(/^also\s+/i, ""))
  ) {
    return {
      ...base,
      classification: "INCLUDED",
      explanation:
        "This reads as a change within the agreed revision round, assuming that round has not been used yet.",
      scopeQuote: revisionClause,
      clarificationQuestion: null,
    };
  }
  const exclusion = scope.find(
    (s) => /exclud|not included|out of scope/i.test(s) && shares(s),
  );
  if (exclusion) {
    return {
      ...base,
      classification: "ADDITIONAL",
      explanation: "The agreed scope explicitly excludes this work.",
      scopeQuote: exclusion,
      clarificationQuestion: null,
    };
  }
  if (NEW_WORK.test(request)) {
    return {
      ...base,
      classification: "ADDITIONAL",
      explanation: "This asks for work that the agreed scope does not mention.",
      scopeQuote: null,
      clarificationQuestion: null,
    };
  }
  const covered = scope.find(shares);
  if (covered) {
    return {
      ...base,
      classification: "INCLUDED",
      explanation: "This appears to be covered by the agreed scope.",
      scopeQuote: covered,
      clarificationQuestion: null,
    };
  }
  return {
    ...base,
    classification: "UNCLEAR" as Classification,
    explanation: "The agreed scope neither covers nor excludes this clearly.",
    scopeQuote: null,
    clarificationQuestion:
      "Is this part of the original deliverables, or new work you would like a quote for?",
  };
}

// ---- Router -------------------------------------------------------------------

export async function handleMockRequest(
  req: TransportRequest,
): Promise<TransportResponse> {
  await delay();
  const db = load();
  const res = route(db, req);
  save(db);
  // Deep-copy so callers cannot mutate the stored objects.
  return JSON.parse(JSON.stringify(res)) as TransportResponse;
}

function route(
  db: MockDb,
  { method, path, body, headers = {} }: TransportRequest,
): TransportResponse {
  const b = isRecord(body) ? body : {};
  const seg = path.split("/").filter(Boolean).map(decodeURIComponent);

  // Client routes: scoped bearer token, no workspace session.
  if (seg[0] === "client") {
    const token = (headers.Authorization ?? "").replace(/^Bearer\s+/i, "");
    const proposalId = token ? db.tokens[token] : undefined;
    const proposal = db.proposals.find((p) => p.id === proposalId);
    if (!proposal)
      return fail(
        401,
        "INVALID_TOKEN",
        "This approval link is invalid or has expired.",
      );

    if (method === "GET" && seg[1] === "proposal") {
      const project = db.projects.find((p) => p.id === proposal.projectId);
      const invoice = db.invoices.find((i) => i.proposalId === proposal.id);
      return ok({
        proposal,
        projectTitle: project?.title ?? "",
        invoice: invoice ? reconcile(db, invoice) : null,
      });
    }
    if (method === "POST" && seg[1] === "accept") {
      if (b.accepted !== true)
        return fail(400, "VALIDATION_ERROR", "Acceptance must be explicit.");
      if (proposal.status === "APPROVED") {
        proposal.status = "ACCEPTED";
        proposal.acceptedAt = now();
      }
      return ok(proposal); // Repeat acceptance returns the existing result.
    }
    return fail(404, "NOT_FOUND", "Not found.");
  }

  if (method === "POST" && seg[0] === "demo-session" && seg.length === 1) {
    if (typeof b.accessSecret !== "string" || !b.accessSecret.trim()) {
      return fail(400, "VALIDATION_ERROR", "Enter the demo access secret.", {
        accessSecret: "Required.",
      });
    }
    db.session = true;
    return ok({ authenticated: true });
  }

  if (!db.session)
    return fail(401, "UNAUTHORIZED", "Sign in to the demo workspace first.");

  // /projects
  if (seg[0] === "projects" && seg.length === 1) {
    if (method === "GET") {
      return ok(
        [...db.projects].sort((a, z) => z.createdAt.localeCompare(a.createdAt)),
      );
    }
    if (method === "POST") {
      const errors: Record<string, string> = {};
      const title = typeof b.title === "string" ? b.title.trim() : "";
      const clientName =
        typeof b.clientName === "string" ? b.clientName.trim() : "";
      const scopeText =
        typeof b.scopeText === "string" ? b.scopeText.trim() : "";
      if (!title) errors.title = "Enter a project title.";
      if (!clientName) errors.clientName = "Enter the client name.";
      if (!scopeText) errors.scopeText = "Paste the agreed scope.";
      if (
        !Number.isInteger(b.hourlyRateCents) ||
        (b.hourlyRateCents as number) <= 0
      )
        errors.hourlyRateCents = "Enter a positive hourly rate.";
      if (b.currency !== "USD") errors.currency = "Only USD is supported.";
      if (Object.keys(errors).length)
        return fail(
          400,
          "VALIDATION_ERROR",
          "Some fields need attention.",
          errors,
        );
      const project: Project = {
        id: newId("prj"),
        title,
        clientName,
        scopeText,
        hourlyRateCents: b.hourlyRateCents as number,
        currency: "USD",
        createdAt: now(),
      };
      db.projects.push(project);
      return ok(project, 201);
    }
  }

  // /projects/:id[/analyses|/proposals]
  if (seg[0] === "projects" && seg[1]) {
    const project = db.projects.find((p) => p.id === seg[1]);
    if (!project) return fail(404, "NOT_FOUND", "Project not found.");

    if (method === "GET" && seg.length === 2) {
      const proposals = db.proposals.filter((p) => p.projectId === project.id);
      return ok({
        project,
        analyses: db.analyses.filter((a) => a.projectId === project.id),
        proposals,
        invoices: db.invoices
          .filter((i) => proposals.some((p) => p.id === i.proposalId))
          .map((i) => reconcile(db, i)),
      });
    }

    if (method === "POST" && seg[2] === "analyses") {
      const conversationText =
        typeof b.conversationText === "string" ? b.conversationText.trim() : "";
      if (!conversationText) {
        return fail(400, "VALIDATION_ERROR", "Paste the client conversation.", {
          conversationText: "Required.",
        });
      }
      if (conversationText.includes(mockTriggers.aiError)) {
        return fail(
          502,
          "AI_PROVIDER_ERROR",
          "The analysis model did not respond. Your text is kept; try again.",
        );
      }
      const analysis: Analysis = {
        id: newId("ana"),
        projectId: project.id,
        conversationText,
        findings: sentences(conversationText).map((s) => ({
          id: newId("fnd"),
          ...classify(project.scopeText, s),
        })),
      };
      db.analyses.push(analysis);
      return ok(analysis, 201);
    }

    if (method === "POST" && seg[2] === "proposals") {
      const analysis = db.analyses.find(
        (a) => a.id === b.analysisId && a.projectId === project.id,
      );
      if (!analysis)
        return fail(
          400,
          "VALIDATION_ERROR",
          "Choose an analysis from this project.",
        );
      const findingIds = Array.isArray(b.findingIds)
        ? (b.findingIds as unknown[]).map(String)
        : [];
      if (!findingIds.length)
        return fail(400, "VALIDATION_ERROR", "Select at least one finding.");
      const findings = findingIds.map((id) =>
        analysis.findings.find((f) => f.id === id),
      );
      if (findings.some((f) => !f))
        return fail(
          400,
          "VALIDATION_ERROR",
          "A selected finding does not exist.",
        );
      if (findings.some((f) => f!.classification !== "ADDITIONAL"))
        return fail(
          409,
          "INVALID_FINDING",
          "Only ADDITIONAL findings can back a proposal.",
        );
      const title = typeof b.title === "string" ? b.title.trim() : "";
      const { items, errors } = validateItems(b.items);
      if (!title) errors.title = "Enter a proposal title.";
      if (!items || Object.keys(errors).length)
        return fail(
          400,
          "VALIDATION_ERROR",
          "Some fields need attention.",
          errors,
        );
      const proposal: Proposal = {
        id: newId("prp"),
        projectId: project.id,
        analysisId: analysis.id,
        findingIds,
        title,
        ...priced(items),
        currency: "USD",
        status: "DRAFT",
        approvedAt: null,
        acceptedAt: null,
      };
      db.proposals.push(proposal);
      return ok(proposal, 201);
    }
  }

  // /proposals/:id[/approve|/invoice]
  if (seg[0] === "proposals" && seg[1]) {
    const proposal = db.proposals.find((p) => p.id === seg[1]);
    if (!proposal) return fail(404, "NOT_FOUND", "Proposal not found.");

    if (method === "PATCH" && seg.length === 2) {
      if (proposal.status !== "DRAFT")
        return fail(
          409,
          "INVALID_STATE",
          "Only draft proposals can be edited.",
        );
      const title = typeof b.title === "string" ? b.title.trim() : "";
      const { items, errors } = validateItems(b.items);
      if (!title) errors.title = "Enter a proposal title.";
      if (!items || Object.keys(errors).length)
        return fail(
          400,
          "VALIDATION_ERROR",
          "Some fields need attention.",
          errors,
        );
      Object.assign(proposal, { title, ...priced(items) });
      return ok(proposal);
    }

    if (method === "POST" && seg[2] === "approve") {
      if (proposal.status === "DRAFT") {
        proposal.status = "APPROVED";
        proposal.approvedAt = now();
      }
      let token = Object.keys(db.tokens).find(
        (t) => db.tokens[t] === proposal.id,
      );
      if (!token) {
        token =
          crypto.randomUUID().replace(/-/g, "") +
          crypto.randomUUID().replace(/-/g, "");
        db.tokens[token] = proposal.id;
      }
      return ok({
        proposal,
        approvalUrl: `${window.location.origin}/approve#token=${token}`,
      });
    }

    if (seg[2] === "invoice" && method === "GET") {
      const invoice = db.invoices.find((i) => i.proposalId === proposal.id);
      return ok(invoice ? reconcile(db, invoice) : null);
    }

    if (seg[2] === "invoice" && method === "POST") {
      const key = headers["Idempotency-Key"];
      if (!key)
        return fail(
          400,
          "MISSING_IDEMPOTENCY_KEY",
          "Idempotency-Key header is required.",
        );
      const replay = db.idempotency[key];
      if (replay) return ok(db.invoices.find((i) => i.id === replay));
      if (proposal.status !== "ACCEPTED")
        return fail(
          409,
          "INVALID_STATE",
          "The client must accept the proposal before you invoice.",
        );
      const existing = db.invoices.find((i) => i.proposalId === proposal.id);
      if (existing) {
        db.idempotency[key] = existing.id;
        return ok(reconcile(db, existing));
      }
      const buyerEmail =
        typeof b.buyerEmail === "string" ? b.buyerEmail.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
        return fail(400, "VALIDATION_ERROR", "Enter a valid buyer email.", {
          buyerEmail: "Enter a valid email address.",
        });
      }
      if (buyerEmail.toLowerCase() === mockTriggers.providerErrorEmail) {
        return fail(
          502,
          "PAYPAL_ERROR",
          "PayPal sandbox did not create the invoice. Try again.",
        );
      }
      const id = newId("inv");
      const invoice: Invoice = {
        id,
        proposalId: proposal.id,
        providerInvoiceId: `MOCK-INV-${id.slice(-6).toUpperCase()}`,
        paymentUrl: `${window.location.origin}/approve/mock-paypal#invoice=${id}`,
        status: "PENDING",
        totalCents: proposal.totalCents, // Always the stored approved total.
        currency: "USD",
        paidAt: null,
      };
      db.invoices.push(invoice);
      db.provider[id] = "PENDING";
      db.idempotency[key] = id;
      return ok(invoice, 201);
    }
  }

  return fail(404, "NOT_FOUND", `No mock route for ${method} ${path}.`);
}
