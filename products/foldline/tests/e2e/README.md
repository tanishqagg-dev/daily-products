# Hosted Google and core workflow acceptance

Run only after the operator authorizes mutations on the exact ready preview.
Use the T3 collaborative browser. Do not launch a separate browser, copy cookies,
record OAuth URL fragments, seed users, forge JWTs or substitute mocked auth.
The harness uses the browser's existing legitimate session. Provider consent and
account selection happen visibly through the normal Google login flow.

## Fixture policy

Use two approved real provider accounts. The first must have no existing test
workspace. The fixture name and slug start with E2E/e2e, and its text is synthetic.
The harness creates at most one workspace and saves progress after each mutation
to sessionStorage using `foldline-e2e-fixture-v1`. It stores only fixture IDs and
synthetic labels, never credentials. A repeated call resumes known fixture steps.
If a network interruption makes a create response uncertain, inspect the owner
workspace first; do not blindly retry or delete unknown data.

The harness refuses production hosts. `allowMutations: true` and an exact
`confirmOrigin` are both required for write phases. Cleanup removes only the
verified synthetic fixture and must be separately authorized.

## Running through the collaborative browser

Use `preview_status`, then the normal snapshot and interaction tools for login.
After callback completes, require `/api/session` to show a real server-verified
user. Never infer login success from a redirect or Google consent alone.

Generate an expression locally, then pass its exact stdout to
`preview_evaluate` with `awaitPromise: true`, targeting the inspected preview tab:

```bash
node tests/e2e/print-expression.mjs '{"phase":"preflight"}'
```

For owner workflow, replace the origin with the exact approved preview:

```bash
node tests/e2e/print-expression.mjs '{"phase":"owner-workflow","allowMutations":true,"confirmOrigin":"https://foldline-preview--foldline-tanishq.netlify.app"}'
```

The owner phase tests server persistence, anonymous intake, private review,
decision/reason, merge provenance, release links, public privacy and CSV export.
It does not open a payment provider or create a charge.

Use the normal UI to log out. Run `logged-out`, then sign in through Google as
the second approved account. Run `second-owner` with the same authorization
arguments. It verifies read, export, edit, merge, release and deletion isolation.
Those denial probes are expected to create no records. If switching tabs, supply
the returned nonsensitive fixture object explicitly in the options.

Run `logged-out` after the second logout. Restore the original owner's legitimate
session and run `cleanup` only when fixture deletion is authorized.

## Actual UI checks, separate from API acceptance

At desktop and a narrow mobile viewport, inspect and exercise the real pages:

- `/auth`: Google button appears only when actual settings enable Google.
- Google returns to the same preview origin, callback finishes, URL hash clears,
  and refreshing `/app` preserves the verified session.
- `/app`: create a workspace, add a note and inspect the saved problem/workaround.
- Save a decision and reason. Merge notes; open the preserved source evidence.
- Publish a release connected to the target. Confirm target status becomes shipped.
- Public board allows anonymous intake and shows title/status/releases only.
- Export downloads a CSV with source text and release links.
- Sign out through the UI. Back navigation and refresh cannot reopen private data.
- Mobile: no clipped controls or horizontal page overflow; open/close feedback
  dialog, use workspace navigation, save a decision and submit public feedback.

Record viewports, inspected URLs, screenshots without tokens, and each actual UI
action. A passing browser-fetch harness does not prove these visual interactions.

## Blockers that prevent a launch claim

Google disabled in actual Identity settings, provider consent/error, callback to
another hostname, stale callback hash, `/api/session` without a verified user,
missing schema, unavailable second account, and any failed core interaction are
unverified or blocked gates. Report them directly. Do not replace provider proof
with injected cookies, mock sessions or local database tests.
