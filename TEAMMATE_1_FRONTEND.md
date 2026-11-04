# ScopePay — Teammate 1: frontend and product experience

Read [INTEGRATION.md](./INTEGRATION.md) before starting. Teammate 2 owns the backend plan in [TEAMMATE_2_BACKEND.md](./TEAMMATE_2_BACKEND.md).

## Your outcome

Build the experience from creating a freelance project through reviewing an additional request, client acceptance, and payment confirmation. Skip interviews. Use the synthetic demo fixture in the shared contract; do not describe it as customer research.

## Stack and ownership

- Next.js App Router, TypeScript, Tailwind CSS; one application shared with the backend.
- Own `src/app/(workspace)/`, `src/app/approve/`, `src/components/`, `src/lib/api-client.ts`, `src/mocks/`, and `public/`.
- Teammate 2 creates the initial runnable scaffold and owns configuration, dependencies, database, and API routes. Until that scaffold is merged, sketch screens and prepare fixtures in your owned files. Then branch from the scaffold commit.
- Both follow `src/shared/contracts.ts`, created by Teammate 2 from INTEGRATION.md. Request contract changes through a PR rather than changing the interface silently.

## Work in order

### 1. Screens and mock mode — days 1–2

- Project list and project creation: title, client display name, scope text, USD hourly rate. Monetary input must be converted to integer cents at the API boundary.
- Project page: agreed scope, pasted conversation, Analyze button, existing proposals.
- Analysis review: each finding shows classification, explanation, exact source excerpts, and whether clarification is needed.
- Editable change proposal: title, line items, estimated hours, rate, total, and freelancer approval.
- Client page: agreed change, total, Accept button, and invoice payment link when available.
- Payment result panel: pending, paid, cancelled, and error states based on backend responses.
- Use an API-client wrapper and fixtures implementing the shared contract. Select mocks with `NEXT_PUBLIC_USE_MOCKS=true`; show a visible mock-mode banner. Real mode must never silently fall back to mocks.

### 2. Connect the real backend — days 3–4

- Replace mock transport with actual HTTP calls; keep UI components independent of transport.
- Display field validation errors and loading states. Preserve entered text after failures.
- Render scope and conversation citations as text, never executable HTML.
- Display unclear findings without enabling proposal creation from them until clarified.
- Let the freelancer edit and explicitly approve a proposal before creating the client link.
- Client acceptance and invoice creation are separate states. Allow the freelancer to create an invoice only after client acceptance.
- Open the returned PayPal invoice URL for payment. Poll the backend payment-status endpoint with bounded retries and a manual refresh option.
- A payment return URL alone must never make the UI show PAID.

### 3. Polish and submit — days 5–7

- Check desktop and mobile layouts, keyboard navigation, labels, focus states, and readable contrast.
- Build empty, included-work, ambiguous-request, AI-error, payment-pending, and cancelled-invoice states.
- Make mock, synthetic, and sandbox labels explicit; label the app as a demo.
- Provide a demo reset button only if the backend supplies a safe, demo-only reset action; otherwise document how to create a fresh demo project.
- Own screenshots, Devpost draft, and the under-three-minute video. Coordinate final claims with Teammate 2.

## Frontend acceptance checklist

- [ ] User can create a project and analyze pasted conversation.
- [ ] Findings show their source excerpts and uncertainty.
- [ ] User can edit a proposal and approve its exact amount.
- [ ] Client sees the same immutable approved amount and can accept it.
- [ ] Invoice link and payment status come from the backend.
- [ ] Double clicks do not cause duplicate submissions.
- [ ] Failed requests can be retried without losing work.
- [ ] End-to-end demo works with mocks disabled.

## Suggested PRs

1. `feat: add workspace screens and API mocks`
2. `feat: add proposal review and client acceptance UI`
3. `feat: connect live API and sandbox payment status`
4. `fix: polish demo flow and submission assets`

Keep PRs small enough for your teammate to review and run in one sitting. Do not commit secrets, `.env`, generated build output, or `node_modules`.
