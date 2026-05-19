# `@workspace/scripts`

Shared utility scripts for the Rathinam Crackers monorepo.

## Available scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @workspace/scripts run hello` | Sanity-check the toolchain. |
| `pnpm --filter @workspace/scripts run verify` | Run the **CLI verifier** (`src/verifier.ts`) — fires HTTP requests at the running stack and prints PASS/FAIL for every check. |
| `pnpm --filter @workspace/scripts run test:e2e` | Run the **UI verifier** end-to-end test (Playwright) — drives a real browser through `/login` → `/verifier`, clicks **Run all checks**, and fails if any check is RED. |
| `pnpm --filter @workspace/scripts run typecheck` | Type-check `src/`. |

## Running the e2e verifier locally

The Playwright spec at `e2e/verifier.spec.ts` is the same 40+ checks the in-app
`/verifier` page renders. It is the broadest single smoke test we have — it
exercises auth, all four frontends, the pricing engine, the immutable stock
ledger, the end-to-end transfer flow, and the end-to-end purchase-order flow.

### Prerequisites

1. All artifact workflows must be running (`API Server`, `ERP web`, `POS web`,
   `Warehouse web`, `Website web`). The shared proxy on `localhost:80` routes
   the test traffic.
2. Admin seed user must exist (default `admin` / `admin123`).
3. A Chromium binary must be available. The default Playwright bundled
   browser ships without GTK/GLib on this NixOS image, so we point Playwright
   at the system `chromium` package via the `PLAYWRIGHT_CHROMIUM_PATH` env var.

### Run it

```bash
PLAYWRIGHT_CHROMIUM_PATH=$(which chromium) \
  pnpm --filter @workspace/scripts run test:e2e
```

You should see all checks pass — the test only succeeds when every row in
the verifier UI is GREEN and the run produced at least 43 checks (the
verifier may grow over time):

```
Verifier summary: <N>/<N> (baseURL=http://localhost:80)
  ✓  1 e2e/verifier.spec.ts:6:1 › ERP /verifier runs all checks and every one passes
  1 passed
```

The test fails the build the moment any verifier row turns red, and prints
the full list of failing rows so the CI log tells you exactly what regressed.

### Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `VERIFIER_BASE_URL` | `http://localhost:80` | Where to point the browser. Set to your published `$REPLIT_DEV_DOMAIN` (or production URL) to smoke-test a deployment. |
| `PLAYWRIGHT_CHROMIUM_PATH` | _(unset)_ | Absolute path to a Chromium executable. Required on hosts where Playwright's bundled browser cannot launch. Omit to use the bundled browser. |
| `VERIFIER_USER` / `VERIFIER_PASS` | `admin` / `admin123` | Login credentials for the ERP UI. |

## Running in CI

In a CI environment, install both the Playwright npm package (already a
`devDependency` of `@workspace/scripts`) and a Chromium binary, start every
artifact workflow, then run:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium \
VERIFIER_BASE_URL=http://localhost:80 \
pnpm --filter @workspace/scripts run test:e2e
```

Exit code is non-zero if any verifier check fails. That single test is
enough for a stack-level smoke gate — keep it in the **required** check list.
