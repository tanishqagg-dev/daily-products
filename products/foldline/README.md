# Foldline

Feedback, decisions and release notes for small software teams. Built as the first
product in Tanishq's daily product pipeline. Current release status is an online preview until hosted data/authentication and
live billing pass the release checks.

## Run

```sh
npm install
npm run dev
npm run check
```

Local Vite serves the interactive demo. Hosted Netlify Identity is required for
real accounts. Local unavailable-backend states are explicit; demo data is never
saved or presented as a real workspace.

## Deployment

React/Vite, modern Netlify Functions, hosted Netlify Identity and Netlify Database.
Migrations in `netlify/database/migrations/` apply through deployment. Never edit
an applied migration or run DDL directly on the hosted database.

Environment variables for server-side billing:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Keys stay in encrypted provider environment settings. They never go into Vite
variables, source code or GitHub. Checkout is disabled without live credentials.
The webhook URL is `/api/billing/webhook`. The gateway accepts only captured,
server-priced INR499 passes; verifies signatures; handles replay and refunds.
A pass lasts 30 days, applies to the owner account across its workspaces, and does not auto-renew.

## Sign-in and interface

The interface uses a Google-first sign-in screen when the hosted provider enables
Google, with email sign-in as a fallback. Provider availability comes from the
actual Identity settings. The app completes authentication callbacks before
loading the workspace and refreshes the client session before asking the server
for the verified account. No local demo or fixture grants a real account.

The current redesign follows the user's Aestrum reference for typography, custom
orange artwork and motion. The generated folded-ribbon illustration was traced
into actual SVG geometry. App screens use readable controls, mobile list/detail
navigation, guided onboarding, search and clear public/private labels.

## Verification

`npm test` covers actual PostgreSQL-compatible SQL with PGlite, ownership, quotas,
merges, releases and billing behavior. These tests do not prove hosted Identity or
live Razorpay operation. Browser reports and deployment receipts remain private
under `artifacts/` and `evidence/`, which are excluded from public source exports.

The public intake shows titles and statuses. Problem and workaround evidence,
internal decision reasons and billing data stay private to the workspace owner.
Deletion removes workspace content; minimal payment records remain for refund and
entitlement reconciliation. No card or bank details are stored by Foldline.

## Capacity

Free includes one workspace, 30 requests, 25 releases, 200 decision-history entries
and 250,000 bytes of stored text per workspace. Plus supports up to five workspaces,
500 requests, 100 releases, 1,000 history entries and 1,000,000 bytes of text each.
Record counts and the text budget both apply. Small system metadata is excluded.
At a limit, existing content remains available for review, export and deletion.
The workspace response includes the newest 50 history entries; request details
retain their current decision and reason. See `server/RECORD_LIMITS.md`.

## Preview deployment

Use a matching alias and branch context so Netlify Database attaches the correct
branch at runtime, for example `--alias foldline-preview --context branch:foldline-preview`.
An anonymous draft deploy did not receive a database URL during this pilot. The
aligned preview did. The health endpoint checks all required tables before it
reports readiness. Production publication is handled by the audited pipeline.

## Research

Original code and branding. No competitor code, assets or private customer data
are reused. The first market investigation found a plausible workflow gap, not
proven paid demand or a monopoly. The product should earn adoption through real use.

## Publication requirement

The pipeline publishes an immutable hosted preview first. Production promotion
requires independent evidence of real provider sign-in and logout, persistence
after reload, two-account isolation, the full feedback/decision/release workflow,
CSV export, desktop/mobile UI and error states on that exact preview origin.
Health checks and the public synthetic demo cannot satisfy this gate. See
`tests/e2e/README.md` for the hosted workflow harness and its limits.
