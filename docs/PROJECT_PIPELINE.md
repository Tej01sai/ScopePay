# ScopePay: from scope creep to verified payment

## The problem

Freelancers agree on a scope, but later client messages add work. The extra effort can disappear into informal conversations, creating unpaid work and disagreements about what was included.

## What we built

ScopePay turns a client request into an evidence-backed review, an explicit quote, client acceptance, and a PayPal sandbox invoice. The freelancer stays responsible for reviewing the AI classification and choosing the estimate.

## Application pipeline

1. **Sign in:** a shared demo secret creates a signed, HTTP-only workspace session.
2. **Create a project:** store the original scope, client name, and hourly rate in Neon PostgreSQL.
3. **Analyze requests:** send the scope and conversation to Groq (`openai/gpt-oss-20b`) with a strict JSON schema. Classify requests as INCLUDED, ADDITIONAL, or UNCLEAR.
4. **Validate evidence:** check that every quoted request and scope excerpt appears exactly in the source. Reject invalid responses. UNCLEAR findings require clarification.
5. **Review and estimate:** the freelancer selects additional work, edits line items, and supplies time and hourly rates. The server calculates integer-cent totals.
6. **Approve:** freeze the proposal and generate a scoped client link. Database locking prevents concurrent edits from changing approved work.
7. **Client acceptance:** the client sees the proposal and explicitly accepts its amount. The link does not expose project conversations or other projects.
8. **Invoice:** reserve one invoice per accepted proposal, create its PayPal sandbox draft, publish it without email notifications, and show the hosted payment link.
9. **Pay:** the client signs in to PayPal sandbox as a separate buyer and pays with test funds.
10. **Verify:** the backend retrieves PayPal's invoice and checks identity, currency, full amount, outstanding balance, and PayPal payment records before storing PAID. A browser redirect alone never marks payment complete.

## Verified example

- Agreed: desktop landing page, one revision; mobile layouts excluded.
- Requested: add mobile layouts and change the heading.
- Groq: mobile layouts ADDITIONAL; heading INCLUDED, with valid citations.
- Freelancer: 2 hours at $50/hour, totaling $100 USD.
- Client: explicitly accepted the proposal.
- PayPal: sandbox payment completed and backend verified PAID on November 11, 2026.

## Architecture

Next.js + React + Tailwind UI → Next.js API handlers → Prisma + PostgreSQL on Neon.

The analysis boundary calls Groq. The payment boundary calls PayPal sandbox. Provider secrets stay on the server in private environment configuration. Browser mock mode is optional and is never a fallback for failed real requests.

## Boundaries and remaining work

This is a shared-workspace hackathon MVP, with USD and sandbox payments only. It is not a multi-tenant production billing platform. Hosting, production authentication, refunds, tax handling, and submission assets remain separate work.

The verified merchant was an India sandbox Business account and the buyer a US Personal sandbox account. PayPal blocked the India-to-India attempt. Invoicing permission must be enabled on the configured REST app. The failed setup draft was manually recovered; the happy path works end to end, while user-facing repair for definitive provider rejections remains limited.

## Repository guide

- [README](../README.md): start commands and architecture overview.
- [Setup](../SETUP.md): private configuration, checks, and sandbox walkthrough.
- [Integration agreement](./INTEGRATION.md): original endpoint contracts.
- [Frontend plan](./TEAMMATE_1_FRONTEND.md) and [backend plan](./TEAMMATE_2_BACKEND.md): original team responsibilities.
