# ScopePay

ScopePay compares freelance scope with client requests, creates human-reviewed change proposals, records client acceptance, and requests payment through PayPal sandbox invoices. Examples are synthetic; this is a shared-workspace hackathon demo.

## Integrated application

The frontend from `Yaswanth-Teammate-1` is merged with the backend scaffold and completed workflow endpoints on `feat/integration`.

- Workspace login, project creation, analysis review, proposal editing, approval, client acceptance, and payment-status screens.
- PostgreSQL persistence and migrations, signed demo sessions, and scoped client links.
- Groq structured analysis with exact-source citation checks and a database-backed rate limit.
- Immutable approved proposals, server-calculated integer-cent totals, and explicit acceptance before invoicing.
- Sandbox-only PayPal create/send/retrieve, one invoice per proposal, transaction locking, and timeout reconciliation.
- Real API mode by default; optional browser mock mode is visibly labeled and never used as a fallback.

## Start here

Read [SETUP.md](./SETUP.md) for the exact credentials/account details to supply, local setup, tests, deployment requirements, and the verified sandbox walkthrough.

```powershell
npm.cmd ci
npm.cmd run setup:local
# Fill database and provider settings in the ignored .env.
npm.cmd run config:check
npm.cmd run db:deploy
npm.cmd run dev
```

Open http://localhost:3000. Node 22.13+ on Node 22 or Node 24+ is required. On non-Windows shells use `npm` instead of `npm.cmd`.

For a UI-only demo, set `NEXT_PUBLIC_USE_MOCKS=true` before starting/building. Mock data stays in that browser; it does not test the database, AI, or PayPal. Real mode must remain enabled for the payment demonstration.

## Contracts and ownership

See [INTEGRATION.md](./docs/INTEGRATION.md), [TEAMMATE_1_FRONTEND.md](./docs/TEAMMATE_1_FRONTEND.md), and [TEAMMATE_2_BACKEND.md](./docs/TEAMMATE_2_BACKEND.md). Those planning documents describe the original division of work; this README and SETUP document the implemented integration.

The frontend imports [shared contracts](./src/shared/contracts.ts). All planned endpoints are implemented under [API routes](./src/app/api). Workspace endpoints require the HTTP-only session cookie. Mutations also require an Origin matching APP_URL. Client endpoints require their scoped bearer token. Responses use `{ data }` or `{ error }`, with no-store caching. Money is integer USD cents and durations are integer minutes.

## Checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run format:check
npm.cmd test
npm.cmd run db:validate
npm.cmd run build
npm.cmd run test:http
npm.cmd run test:integration
```

Integration tests use native temporary PostgreSQL and synthetic provider fixtures. They do not prove real Groq access, PayPal merchant capability, or actual sandbox payment. Run the credential-backed walkthrough in [SETUP.md](./SETUP.md) before submission.

ESLint 9.39.5 is pinned because Next.js's selected lint plugins do not declare ESLint 10 support. npm marks that ESLint release deprecated; upgrade when compatible plugin versions are available. The embedded PostgreSQL wrapper is a development-only prerelease package and is not used by the deployed application.

No credentials are committed. An open-source license still needs the team's selection.

## Project pipeline

Read [the full project pipeline](./docs/PROJECT_PIPELINE.md) for the problem, architecture, user journey, verified $100 sandbox example, and remaining MVP limitations. Real Groq analysis and backend-verified PayPal sandbox payment were completed locally on November 11, 2026.
