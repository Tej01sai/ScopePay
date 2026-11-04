# ScopePay — Teammate 2: backend, AI, and PayPal

Read [INTEGRATION.md](./INTEGRATION.md) first. Teammate 1 owns the frontend plan in [TEAMMATE_1_FRONTEND.md](./TEAMMATE_1_FRONTEND.md).

## Your outcome

Implement a reliable backend that compares scope with new requests, records human approvals, creates a PayPal sandbox invoice, and verifies payment. Skip interviews; use clearly labeled synthetic examples.

## Stack and ownership

- Next.js App Router route handlers, TypeScript, Prisma, PostgreSQL, and a model API with structured output.
- Own `src/app/api/`, `src/server/`, `prisma/`, `src/shared/contracts.ts`, configuration, lockfile, migrations, `.env.example`, and README setup instructions.
- Use PostgreSQL locally and when hosted. Keep provider choice separate from business logic.
- Own dependency additions. Teammate 1 requests packages through a PR or message to avoid competing lockfile edits.
- Start with the latest mutually supported stable packages available when scaffolding; commit the lockfile and document the actual Node/runtime requirements. Verify provider documentation during implementation.

## Work in order

### 1. Scaffold and feasibility — day 1

- Create the runnable Next.js/TypeScript/Tailwind scaffold with a `src/` layout. Keep the root page minimal; Teammate 1 owns product pages.
- Add formatting, lint/typecheck/build scripts, `.gitignore`, `.env.example`, and setup instructions.
- Translate INTEGRATION.md into shared TypeScript request/response types. Merge this scaffold before parallel feature development.
- Configure PostgreSQL and Prisma migrations for Project, Analysis, Finding, Proposal, ProposalItem, and Invoice records.
- Prove PayPal sandbox authentication, invoice creation, payment, and retrieval work with separate sandbox merchant and buyer accounts.
- Check required invoice fields, region/currency support, and sandbox account capabilities using current PayPal documentation. Record any constraints immediately.

### 2. AI analysis and proposals — days 2–3

- Implement project creation and retrieval, then analysis endpoints using the shared contract.
- Treat supplied scope and conversation as untrusted data. Instructions inside them must not override the analysis task or trigger tools/payments.
- Require structured model output: classification, explanation, exact scope excerpt if available, exact request excerpt, and a clarification question when ambiguous.
- Validate the output schema and verify cited text exists in its original input. Reject invalid output with a recoverable error.
- Never invent contract terms, agreed prices, or evidence. An unclear request remains unclear.
- AI analysis cannot approve proposals or create invoices. The freelancer enters/approves estimated hours and price.
- Implement proposal draft editing, approval, opaque client-link tokens, and client acceptance. Freeze proposal contents on freelancer approval; later edits require a new draft and acceptance.

### 3. PayPal and payment state — days 3–4

- Create an invoice only for an accepted proposal, using server-calculated line totals and USD integer cents.
- Populate merchant identity from server configuration and buyer email from an explicit input; do not infer an email address from conversation text.
- Store PayPal invoice ID and hosted payment URL. Ensure the invoice is payable using the supported PayPal create/send flow.
- Use supported PayPal idempotency mechanisms where available, plus a database uniqueness constraint and concurrency-safe invoice creation. Repeated clicks or retries must return the existing invoice.
- Implement server-side invoice-status retrieval so the demo works without webhooks.
- If adding webhooks, verify their authenticity, deduplicate events, and reconcile with PayPal before applying sensitive state changes. Never trust frontend-reported payment completion.
- Handle provider timeouts without creating a second invoice blindly; reconcile the prior attempt before retrying.

### 4. Reliability, hosting, and submission — days 5–7

- Add meaningful tests for approval/state rules, monetary calculations, duplicate creation, invalid AI citations, and payment-status mapping.
- Coordinate a real sandbox walkthrough with Teammate 1; test a fresh project, a pending payment, a paid invoice, and a repeated request.
- Provide `.env.example` variable names only: database connection, model provider/key/model, PayPal client ID/secret, sandbox base URL, merchant settings, app URL, demo access secret, and webhook ID only if used.
- Restrict all provider configuration to sandbox mode for this build. Keep secrets server-side and redact them from logs.
- Protect freelancer workspace/API routes with a server-checked demo session backed by a shared demo access secret; protect client routes with high-entropy scoped tokens. Do not expose project lists publicly.
- Apply input size limits and basic rate limits to AI endpoints; provide safe, recoverable error messages.
- Deploy with persistent PostgreSQL, run migrations, and document exact run/test commands. Avoid relying on local files or in-memory storage in production.
- Include an open-source license after the team chooses one, testing instructions, provider setup requirements, and limitations. Give judges safe demo access; do not publish service secrets in the repository.

## Backend acceptance checklist

- [ ] Fresh checkout can install, migrate, and run from documented steps.
- [ ] AI findings use validated excerpts from the submitted texts.
- [ ] Unapproved/unaccepted proposals cannot be invoiced.
- [ ] Approved prices cannot be altered through client requests.
- [ ] Concurrent retries cannot create duplicate invoices.
- [ ] Verified PayPal state drives PAID; return URLs cannot do so.
- [ ] Workspace access is restricted; client tokens expose only their proposal.
- [ ] No credentials are committed or returned to the browser.
- [ ] Teammate 1 completes the real sandbox flow on the integrated branch.

## Suggested PRs

1. `chore: scaffold app and freeze shared API types`
2. `feat: add project analysis and proposal lifecycle`
3. `feat: integrate PayPal sandbox invoicing and status`
4. `fix: harden state transitions and document deployment`
