# ScopePay

Sandbox demo for evidence-backed scope reviews, human-approved change proposals, and PayPal invoicing. All demonstration examples are synthetic.

## Current milestone

The Teammate 2 foundation contains Next.js App Router, TypeScript, Tailwind, shared wire types, PostgreSQL models and an initial SQL migration. Signed demo sessions and protected project create/list/detail routes are implemented. Product screens, AI analysis, proposal workflows, and PayPal operations are **not implemented yet**. Remaining shared types describe the intended interface. No payment flow has been verified.

See [the integration agreement](./INTEGRATION.md), [backend plan](./TEAMMATE_2_BACKEND.md), and [frontend plan](./TEAMMATE_1_FRONTEND.md). Frontend development should import [shared contracts](./src/shared/contracts.ts).

## Runtime and installation

Use Node.js 22.13+ on the Node 22 line, or Node 24+; development uses Node 22.14.0. Dependencies are locked by npm. Next.js 16.4.5 and stable Prisma 7.10.1 were selected from the registry; the registry's Prisma default was a release candidate and was intentionally excluded.

ESLint is pinned to 9.39.5 because the React, accessibility, and import plugins bundled with the selected Next.js lint configuration do not yet declare ESLint 10 compatibility. npm marks this ESLint release deprecated; upgrade when the plugin peer ranges support the newer major.

On Windows PowerShell use `npm.cmd` if the execution policy blocks `npm.ps1`. On other shells use `npm`.

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run db:generate
npm.cmd run dev
```

Visit http://localhost:3000. The placeholder page runs without provider credentials or a database. Do not overwrite an existing `.env` when repeating setup. For API access set `APP_URL=http://localhost:3000`, a random `DEMO_ACCESS_SECRET` of at least 32 characters, and `DATABASE_URL` in `.env`.

## Implemented API

- `POST /api/demo-session`: `{ "accessSecret": "your locally configured secret" }`; issues an HTTP-only, SameSite=Strict cookie, secure in production, expiring after eight hours. Changing the secret invalidates existing sessions.
- `GET /api/projects`: authenticated project list, newest first.
- `POST /api/projects`: validates and persists the agreed project request; returns 201 with `{ data: Project }`.
- `GET /api/projects/:id`: authenticated project detail with analyses, proposals, and invoices; internal token hashes and provider bookkeeping are excluded.

Send JSON with `Content-Type: application/json`. Every POST requires an `Origin` header matching `APP_URL`; browser same-origin requests supply it automatically. Command-line clients must explicitly supply that header and retain the session cookie. Production requires an HTTPS `APP_URL`. GET requests require the cookie. API responses use the agreed envelope and `Cache-Control: no-store`.

The login endpoint permits 20 attempts per minute per server process. Before running multiple replicas, configure a shared/edge rate limiter; this initial limiter is not durable across restarts. Project bodies are capped at 256 KB and scope text at 40,000 characters. Scope text whitespace is preserved for later citation validation. Missing database configuration or database failures return a generic 503 without connection details.

## PostgreSQL

Provision an empty PostgreSQL database (local PostgreSQL 16+ or a hosted PostgreSQL service). Set `DATABASE_URL` in `.env` to its connection URI, for example `postgresql://USER:PASSWORD@localhost:5432/scopepay`. Use the host's required TLS settings for hosted connections.

```powershell
npm.cmd run db:validate
npm.cmd run db:deploy
```

`db:deploy` applies the committed migration. For later schema development, use `npm.cmd run db:migrate -- --name describe_change`; Prisma development migrations need a shadow database or permission to create one. Use a direct database connection for migrations when your provider requires it. Do not run development resets against a shared or production database.

The [schema](./prisma/schema.prisma) stores all six domain entities, ordered proposal items, proposal-scoped token hashes, invoice idempotency keys, and unique provider invoice IDs. One invoice per proposal is enforced by the database. These constraints are groundwork: state transitions, token generation, approval immutability, cross-analysis finding validation, and provider reconciliation still need application-level enforcement.

## Configuration

[.env.example](./.env.example) contains variable names only. Never commit credentials or use `NEXT_PUBLIC_` for service secrets.

| Variables                                                                                                                                         | Purpose                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                                                    | PostgreSQL connection                                                     |
| `MODEL_PROVIDER`, `MODEL_API_KEY`, `MODEL_NAME`                                                                                                   | Reserved for the next AI integration milestone; provider not selected yet |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`                                                                                                        | Sandbox REST application credentials                                      |
| `PAYPAL_BASE_URL`                                                                                                                                 | Set only to `https://api-m.sandbox.paypal.com`                            |
| `PAYPAL_MERCHANT_EMAIL`, `PAYPAL_MERCHANT_BUSINESS_NAME`, `PAYPAL_MERCHANT_GIVEN_NAME`, `PAYPAL_MERCHANT_SURNAME`, `PAYPAL_MERCHANT_COUNTRY_CODE` | Explicit sandbox merchant identity                                        |
| `APP_URL`                                                                                                                                         | Local `http://localhost:3000`, or the hosted HTTPS origin                 |
| `DEMO_ACCESS_SECRET`                                                                                                                              | Strong random shared secret for the future server-checked demo session    |

PayPal setup requires a sandbox business merchant, a separate sandbox personal buyer, and an app associated with the merchant. The merchant's country/account must support invoicing and USD. Account-specific support and required identity fields remain to be verified with those accounts. Do not use real credentials or production endpoints.

The next payment milestone must create and send a payable invoice, retain its hosted URL, and retrieve its state after buyer payment. Provider timeouts require reconciliation before retry. A return URL or a mock payment is not proof of payment.

Documentation checked during scaffolding:

- [Prisma 7 PostgreSQL adapter and connection pooling](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool)
- [PayPal Invoicing overview](https://developer.paypal.com/invoicing/about)

## Checks and deployment

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run db:validate
npm.cmd run build
npm.cmd start
```

Run `npm.cmd test` for session tampering/expiry and project validation tests. Node 22.14 uses experimental type stripping for these tests. After a successful build, run `npm.cmd run test:http` for production-server HTTP checks covering unauthorized access, origin checks, secure cookie attributes, invalid/oversized bodies, and safe database failures. The smoke test starts and stops its own local server with a synthetic random secret and no database credentials. Live PostgreSQL persistence and migration execution require a configured database and remain unverified until that walkthrough is completed.

Add tests for invalid AI citations, approved-price immutability, concurrent invoice creation, and verified payment amounts with those features.

For deployment, use a Node-compatible Next.js host and persistent PostgreSQL. Set private environment variables, run `npm ci`, `npm run db:deploy`, and `npm run build`, then `npm start` (or the platform's Next.js runtime). Build does not connect to PostgreSQL. Existing project APIs enforce demo access; future workspace routes must use the same session guard, and future client routes need scoped tokens. The placeholder root page is public and contains no workspace data.

## Next backend work

1. Configure PostgreSQL, apply the initial migration, and verify project persistence end to end.
2. Structured AI findings with exact-source citation validation and input/rate limits.
3. Draft editing, immutable approval, scoped client links, and explicit acceptance.
4. Sandbox invoice creation/send/retrieval, concurrency controls, and payment reconciliation.
5. End-to-end sandbox walkthrough, tests, deployment, and teammate review.

License selection is pending the team's decision; no open-source license is asserted yet.
