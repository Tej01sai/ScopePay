# ScopePay — shared scope, API contract, and Git workflow

## Decision

Use one GitHub repository, one Next.js application, and small pull requests from two feature branches. This is simpler for two people than separate frontend/backend repositories: types, deployment, and API URLs stay together.

This folder currently contains planning documents only and was not a Git repository when inspected. No GitHub repository, application scaffold, or deployed service has been created by these plans.

## MVP boundary

Scope text + pasted client conversation → evidence-backed AI findings → freelancer-reviewed change proposal → client acceptance → PayPal sandbox invoice → verified payment status.

- One freelancer workspace, a protected demo login, one currency (USD), text input, and one invoice per accepted proposal.
- AI classifies work as INCLUDED, ADDITIONAL, or UNCLEAR. It suggests; people approve.
- Skip interviews. Use synthetic fixtures and describe impact as a hypothesis, without invented user feedback or measured savings.
- Defer PDF/OCR, Gmail/WhatsApp connections, production payments, escrow, payouts, subscriptions, autonomous charging, and full multi-user accounts.
- An invoice is a payment request; it is not escrow or a guarantee that a client will pay.

## File ownership

| Area | Owner |
| --- | --- |
| Product pages, components, assets, API client, mocks | Teammate 1 |
| API route handlers, server code, Prisma, shared types | Teammate 2 |
| package.json, lockfile, configuration, environment example | Teammate 2 |
| README setup/deployment | Teammate 2 |
| Screenshots, demo video, submission copy | Teammate 1 |
| This contract and scope decisions | Both; reviewed PR required |

## Git setup and daily workflow

1. One person creates an empty GitHub repository named `scopepay` and invites the other as a collaborator. Keep it private during development if desired; the final submission requires public source and an open-source license.
2. In this folder, initialize Git, commit these plans, add the remote, and push `main`. Replace `<repository-url>` with your actual repository URL:

   ```powershell
   git init -b main
   git add INTEGRATION.md TEAMMATE_1_FRONTEND.md TEAMMATE_2_BACKEND.md
   git commit -m "docs: define ScopePay team plan and API contract"
   git remote add origin <repository-url>
   git push -u origin main
   ```

3. Teammate 2 creates `chore/scaffold`, implements the runnable scaffold and shared types, then opens a pull request. Teammate 1 reviews and merges it before both begin integration-dependent work.
4. Each teammate uses a separate local clone on their own computer. From the updated `main`, create `feat/frontend` or `feat/backend`:

   ```powershell
   git switch main
   git pull --ff-only origin main
   git switch -c feat/frontend
   ```

   Teammate 2 substitutes `feat/backend` for `feat/frontend`.

5. Commit small changes, push the feature branch, and open a PR to `main`. The other teammate reviews it. Run relevant checks and the shared happy path before merging.
6. After the other person's PR merges, commit your own local work, fetch, and merge the updated main into your branch:

   ```powershell
   git fetch origin
   git merge origin/main
   ```

   Resolve conflicts together if they touch the API contract. Do not overwrite the other person's changes or force-push shared branches.
7. After a feature branch merges, start the next small branch from updated main. Keep main runnable. Both teammates should integrate at least daily, beginning on day 2.

If you both work on one computer, use separate Git worktrees after initialization rather than switching a shared working directory between active tasks. For normal work on two computers, separate clones are sufficient. Avoid exchanging ZIP files: they lose reviewable history and make conflicts harder to resolve.

## Shared API conventions

Teammate 2 creates `src/shared/contracts.ts`; Teammate 1 imports types from it. The contracts below are the intended interface, not implemented endpoints.

- API prefix: `/api`. JSON requests and responses. IDs are opaque strings; timestamps are ISO 8601 UTC strings.
- Success: `{ data: T }`. Failure: `{ error: { code: string, message: string, fieldErrors?: Record<string, string> } }`.
- Use 400 for invalid input, 401/403 for unauthorized access, 404 for missing resources, 409 for invalid state transitions, and 502 for upstream provider failure.
- Amounts use integer USD cents. Proposed hours use integer minutes. Server computes `round(estimatedMinutes * hourlyRateCents / 60)` per line, then sums lines. No taxes, discounts, or fees in MVP.
- Invoice creation requires an application idempotency key and must remain safe under simultaneous requests; an in-flight request may return a recoverable conflict.
- Workspace routes require the demo session. Client routes require their scoped bearer token. Tokens and credentials must never appear in logs.

### Entities

```ts
type Classification = 'INCLUDED' | 'ADDITIONAL' | 'UNCLEAR';
type ProposalStatus = 'DRAFT' | 'APPROVED' | 'ACCEPTED';
type InvoiceStatus = 'CREATING' | 'PENDING' | 'PAID' | 'CANCELLED' | 'ERROR';

type Project = {
  id: string;
  title: string;
  clientName: string;
  scopeText: string;
  hourlyRateCents: number;
  currency: 'USD';
  createdAt: string;
};
type Finding = {
  id: string;
  classification: Classification;
  title: string;
  explanation: string;
  scopeQuote: string | null;
  requestQuote: string;
  clarificationQuestion: string | null;
};
type Analysis = {
  id: string;
  projectId: string;
  conversationText: string;
  findings: Finding[];
};
type ProposalItemInput = {
  description: string;
  estimatedMinutes: number;
  hourlyRateCents: number;
};
type Proposal = {
  id: string;
  projectId: string;
  analysisId: string;
  findingIds: string[];
  title: string;
  items: (ProposalItemInput & { amountCents: number })[];
  totalCents: number;
  currency: 'USD';
  status: ProposalStatus;
  approvedAt: string | null;
  acceptedAt: string | null;
};
type Invoice = {
  id: string;
  proposalId: string;
  providerInvoiceId: string | null;
  paymentUrl: string | null;
  status: InvoiceStatus;
  totalCents: number;
  currency: 'USD';
  paidAt: string | null;
};
```

### Endpoint agreement

All return values below are inside the success `data` envelope. Teammate 2 must define the remaining request/response types explicitly before frontend integration.

| Endpoint | Request | Returns |
| --- | --- | --- |
| `POST /api/demo-session` | `{ accessSecret }` | `{ authenticated: true }`; sets secure HTTP-only session cookie |
| `GET /api/projects` | — | `Project[]` |
| `POST /api/projects` | `{ title, clientName, scopeText, hourlyRateCents, currency: 'USD' }` | `Project` |
| `GET /api/projects/:id` | — | `{ project: Project, analyses: Analysis[], proposals: Proposal[], invoices: Invoice[] }` |
| `POST /api/projects/:id/analyses` | `{ conversationText }` | `Analysis` |
| `POST /api/projects/:id/proposals` | `{ analysisId, findingIds, title, items: ProposalItemInput[] }` | `Proposal` in DRAFT |
| `PATCH /api/proposals/:id` | `{ title, items: ProposalItemInput[] }` | Updated DRAFT proposal |
| `POST /api/proposals/:id/approve` | — | `{ proposal: Proposal, approvalUrl: string }` |
| `GET /api/client/proposal` | `Authorization: Bearer <token>` | `{ proposal: Proposal, projectTitle: string, invoice: Invoice \| null }` |
| `POST /api/client/accept` | Same bearer token; `{ accepted: true }` | `Proposal` in ACCEPTED |
| `POST /api/proposals/:id/invoice` | `{ buyerEmail }` and `Idempotency-Key` header | `Invoice` |
| `GET /api/proposals/:id/invoice` | — | `Invoice \| null`; reconciles with PayPal when appropriate |

Client approval pages live at `/approve#token=<opaque-token>`. The browser reads the fragment and sends the token in the authorization header; it must not forward it to analytics or third-party content. The public client view exposes no full conversation, internal analysis, or other projects. Client-side payment refresh uses the client endpoint, whose backend reconciles status with PayPal as needed.

### State rules

- Proposal: DRAFT → APPROVED → ACCEPTED. Only DRAFT is editable. APPROVED generates a client link; ACCEPTED records explicit client acceptance. Repeat approval/acceptance requests return the existing result.
- Only ADDITIONAL findings can back an MVP proposal. Resolve UNCLEAR findings through revised source inputs and a new analysis first.
- Only ACCEPTED proposals may create invoices. The backend loads stored approved line items; it never accepts a browser-provided invoice total.
- Invoice: CREATING → PENDING → PAID, or PENDING → CANCELLED. ERROR is recoverable only after provider reconciliation. Do not downgrade a verified PAID invoice because an older event arrives.
- Payment status and paid amount must be checked against the expected invoice. Partial payments do not count as fully PAID. Disable partial payment options for MVP where supported.
- Polling is sufficient for MVP. Add webhooks only after the full polling-based sandbox flow works.
- If a provider operation is unavailable in sandbox, flag the blocker immediately. A fixture is not a substitute for the required working payment demonstration.

## Synthetic demo fixture

Scope: “Design five desktop screens for a portfolio website. Includes one revision round. Mobile layouts and extra screens are excluded.”

Conversation: “Please add two mobile layouts for the homepage and contact page. Also change the homepage heading as part of our first revision.”

Expected interpretation:

- Two mobile layouts: ADDITIONAL, citing the explicit exclusion.
- Heading revision: INCLUDED, assuming it is within the stated first revision round.
- A separate test, “Make the design better,” should be UNCLEAR with a clarification question.

Freelancer manually enters 120 minutes at 5,000 cents/hour for the mobile layouts. Expected total: 10,000 cents ($100.00 USD). Client accepts; freelancer creates invoice; sandbox buyer pays; backend confirms PAID. These are demonstration values, not market pricing or validated customer data.

## Daily integration checkpoint — 15 minutes

1. What merged and runs on main?
2. Did any request/response shape or environment variable change?
3. Can we complete today's agreed milestone with mocks disabled?
4. What is blocked, who owns it, and what will be cut if needed?

## Milestones and fallback priorities

- Day 1: scaffold/types merged, sandbox invoicing proven, UI/mock work started.
- Day 2: real project creation and AI analysis connected.
- Day 3: editable proposal, freelancer approval, client acceptance connected.
- Day 4: complete sandbox payment flow. This is the critical milestone.
- Day 5: fix errors and meaningful edge cases; freeze features.
- Days 6–7: deploy, verify from fresh setup, finish documentation and video.
- Keep the final day before the deadline for submission checks. Target submission on 12 November 2026 IST; the listed event cutoff is 13 November 2026 at 01:30 IST. Verify the event page again before submitting: https://paypalaihackathon.devpost.com/rules

If behind, cut PDF support, webhooks, charts, and visual extras first. Keep evidence review, human approval, client acceptance, genuine sandbox invoicing, and verified payment status.

## Definition of integrated and ready

- Both teammates run the same main commit with mocks disabled.
- Included, additional, and unclear fixtures behave sensibly; citations are valid.
- Proposal totals match the approved client view and PayPal invoice.
- Real sandbox payment updates the app; failed/repeated actions do not duplicate invoices.
- Lint, typecheck, build, and meaningful backend tests pass using the scaffold's documented commands.
- Public repository contains source, license, environment template, and complete run instructions; no secrets.
- Hosted demo or reproducible local build is available with safe judge access instructions.
- Demo video is publicly visible on YouTube and under three minutes, showing the functioning end-to-end flow.
