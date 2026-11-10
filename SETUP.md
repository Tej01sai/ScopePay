# Final integration setup

The UI and backend are connected on the integration branch. Complete these settings locally or in your host's environment settings; do not paste credentials into GitHub, PRs, screenshots, or chat.

## Details the team must provide

| Detail                                                              | Where it goes                              | Notes                                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL connection URI                                           | `DATABASE_URL`                             | Persistent database, with the provider's required TLS settings; use a direct connection for migrations.                                    |
| Groq API key                                                        | `MODEL_API_KEY`                            | Access to the selected Groq model and available account quota are required.                                                                |
| Structured-output-capable model ID                                  | `MODEL_NAME`                               | Set an exact model ID your account can use. `MODEL_PROVIDER=groq` is already selected.                                                     |
| PayPal sandbox app client ID and secret                             | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | The app must belong to the sandbox business merchant. Never use live app credentials.                                                      |
| Sandbox merchant email, business name, given name, surname, country | `PAYPAL_MERCHANT_*`                        | Explicit identity belonging to that merchant. Country is a two-letter uppercase code. Confirm invoicing/USD availability for that account. |
| Separate sandbox buyer account                                      | Enter its email in the invoice form        | Keep its password in PayPal; sign in yourself when paying the sandbox invoice.                                                             |
| Hosted app URL                                                      | `APP_URL`                                  | Local development defaults to `http://localhost:3000`. Production requires HTTPS; links and request-origin validation use this value.      |

`npm run setup:local` creates an ignored `.env` only when one does not already exist. It generates a strong `DEMO_ACCESS_SECRET` and sets the local origin, Groq provider, PayPal sandbox base URL, and real API mode. Read the generated demo secret locally to sign into the app. Copy the secret to your host's private environment if deploying; rotating it invalidates sessions and client links. For already-approved proposals, a secret rotation requires a new proposal/link.

`PAYPAL_BASE_URL` must remain `https://api-m.sandbox.paypal.com`. `NEXT_PUBLIC_USE_MOCKS=false` is needed for the real walkthrough. Public mode flags are embedded at build time, so rebuild after changing them.

## Run the integrated app

```powershell
npm.cmd ci
npm.cmd run setup:local
# Fill the missing values in .env locally.
npm.cmd run config:check
npm.cmd run db:deploy
npm.cmd run dev
```

Open http://localhost:3000, sign in, and create a project. On macOS/Linux use `npm` instead of `npm.cmd`. Use Node 22.13+ on Node 22, or Node 24+. The development checks used Node 22.14.0.

## Sandbox walkthrough

1. Create a fresh project with the synthetic scope from [the integration agreement](./docs/INTEGRATION.md).
2. Paste its conversation, run analysis, and inspect exact citations. Also try an ambiguous request.
3. Select an ADDITIONAL finding, enter 120 minutes at $50/hour, save, and approve $100.
4. Open the approval link in a separate browser/private window, explicitly accept, then refresh the freelancer's project.
5. Enter the separate sandbox buyer email and create an invoice. Open the hosted sandbox payment link and pay as that buyer.
6. Refresh the client or freelancer payment status. It must reach PAID only after backend verification. Repeat invoice creation and refresh to verify the same invoice ID is retained.

PayPal's send endpoint publishes the invoice with email notifications disabled; share the generated approval link manually. The app never sends email itself. Merchant/account-specific required fields and regional support must be verified against your actual sandbox account. Tests cannot prove account capability or a real payment.

## Verification

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

The integration runner starts a temporary native PostgreSQL database using the development-only `embedded-postgres` package, applies both migrations, and exercises the real HTTP handlers. Only Groq and PayPal network boundaries use synthetic fixtures injected into the test child process; no production flag enables them. It checks invalid citations, immutable approvals, scoped links, repeated acceptance, concurrent invoice creation, payment verification, and recovery after a simulated provider timeout. The temporary database is stopped afterward. The package wrapper is a prerelease dependency used only for tests, not the deployed runtime. It requires platform binaries/postinstall scripts and a non-root user on Linux. No host user accounts are created by the test runner.

## Deployment and remaining decisions

Use a persistent PostgreSQL service and a Node-compatible Next.js host. Set the private variables, run migrations, then build and start. Invoice requests can take up to 120 seconds for reconciliation; configure request/function timeouts of at least 180 seconds. The database must support PostgreSQL advisory locks and transactions. Do not deploy the temporary test database.

The team still needs to choose a hosting account/domain, an open-source license, safe judge-access details, and complete its demo video/submission. A real Groq analysis and a $100 USD PayPal sandbox payment were verified locally on November 11, 2026. Deployment and license selection remain pending.

## Operational limits

- Shared demo workspace, USD only, one invoice per accepted proposal; no taxes, tips, partial-payment options, refunds workflow, or real-money production mode.
- Analysis allows 10 calls per minute across instances using a database counter. Login limiting is per process; add a shared/edge limiter before scaling replicas.
- Invoice creation is reserved in PostgreSQL before contacting PayPal. An ambiguous create is searched by its stable invoice number; the app never blindly creates a replacement. If no matching invoice can be recovered, it stays ERROR and requires merchant-side investigation. Use a new accepted proposal only after confirming the prior invoice does not exist.
- Refund and manually marked payment states are not treated as verified PayPal payments. PAID is an immutable demo milestone; post-payment refund tracking is outside this MVP.
- Approved proposals cannot be edited. Create and accept a new draft for changes. Client tokens expose only their proposal and invoice, not source conversations or project lists.

Provider references: [Groq structured outputs](https://console.groq.com/docs/structured-outputs), [PayPal Invoicing v2](https://developer.paypal.com/api/invoicing/v2), [PayPal create invoice](https://developer.paypal.com/api/invoicing/v2/invoices-create), [PayPal invoice search](https://developer.paypal.com/api/invoicing/v2/invoices-search-invoices).

## Verified sandbox account requirements

Enable Invoicing on the exact sandbox REST app whose credentials are configured. Authentication alone does not prove invoice permission. For an India merchant, use an international test buyer (the verified walkthrough used a US Personal sandbox account); PayPal rejected an India-to-India invoice. Keep buyer passwords outside this repository. The failed draft was recovered manually during setup, then the same invoice was paid and verified; automatic recovery after a definitive permissions rejection is not yet implemented.
