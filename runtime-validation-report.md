# Runtime Validation Report

**Generated**: 2026-11-04T15:04:09+05:30  
**Target**: Apple Worm Adventure project

## Summary

| Step | Status | Exit Code | Details |
|---|---|---:|---|
| Startup | PASS | 0 | Playwright started Vite at `http://127.0.0.1:4173`; the frontend served both browser flows. Backend startup with a connected MongoDB was not attempted because no test database was available. |
| Backend tests | PASS | 0 | Latest rerun: 57 tests, 53 passed, 4 MongoDB integration cases skipped, 0 failed. |
| MongoDB safety guards | PASS | 0 | 3 harness tests passed, including remote-host and non-test-database rejection. |
| Frontend tests | PASS | 0 | 31 unit tests and 2 Playwright E2E tests passed. |
| Production build | PASS | 0 | `vite build` completed with an HTTPS API-origin build variable. |
| MongoDB integration | UNVERIFIED | n/a | The four database-backed cases were not run because no isolated test database could be confirmed. |

**Overall**: NEEDS_SIGNOFF — local MongoDB persistence, transactions, backend restart, and database-backed cross-user/concurrency tests still need to run against the dedicated local replica set described in [docs/TESTING.md](./docs/TESTING.md).

## Environment

- Node.js: `v24.13.1`.
- Playwright: `1.64.1`; Chromium installation completed successfully.
- Docker CLI: unavailable (`docker` is not installed).
- A local MongoDB service was found running, but it was not contacted because its data and purpose were not verified as disposable test-only.
- `mongod`: not on `PATH`; `mongosh` is installed.
- `MONGODB_TEST_URI`: not configured.
- `MONGODB_URI`: not configured.
- No MongoDB test target could be verified; no MongoDB integration connection was made. No production or staging database URI was used or contacted.

The integration harness accepts only a loopback MongoDB host and a database named `apple_worm_adventure_test_<suffix>`. It rejects production mode, rejects a URI equal to `MONGODB_URI`, and never falls back to `MONGODB_URI`. It does not drop databases; test cleanup targets only generated test-user IDs.

## Test evidence

### Backend

Latest command: `npm --prefix backend test`  
Exit code: `0` — 53 passed, 4 skipped, 0 failed (57 total).

Harness safety command: `node --test test/integration/mongoTestSupport.test.js` from `backend/`  
Exit code: `0` — 3 passed, 0 skipped, 0 failed. This verified no fallback to `MONGODB_URI`, rejection of production mode and non-test database names, and rejection of remote hosts.

Passed coverage included authentication and expiry, protected routes, validation/error responses, game replay and completion calculations, wallet debit/idempotency behavior, reward eligibility, and the production reward-provider guard. The dedicated MongoDB safety-guard unit tests passed.

The following four database-backed cases were skipped because the safe test URI and local MongoDB service were unavailable:

| Test file | Coverage when enabled | Result |
|---|---|---|
| `backend/test/integration/userJourney.integration.test.js` | Registration/login, persisted move replay across backend restart, level score/moves/stars, dashboard, leaderboard, wallet ledger, hint purchase, reward eligibility/idempotency | SKIPPED |
| `backend/test/integration/userIsolation.integration.test.js` | Cross-user session/progress/wallet/reward access; invalid/expired auth and API payloads | 2 SKIPPED |
| `backend/test/integration/concurrency.integration.test.js` | Concurrent wallet debits, duplicate game-session saves, duplicate reward creation/claims | SKIPPED |

These four tests were **not run against a database**: `MONGODB_TEST_URI` remained unset, Docker was unavailable, and the already-running local MongoDB service was not confirmed to be isolated. The test target verified for this run is **none** (no host or database). The exact Windows Docker Desktop setup, preflight target verification, safety-test command, four-test command, full-suite command, and cleanup instructions are in [docs/TESTING.md](./docs/TESTING.md).

### Frontend

Command: `npm --prefix frontend test`  
Exit code: `0` — 31 unit tests and 2 E2E tests passed.

Passed Playwright journeys:

1. Anonymous protected-route redirect → registration → launch/play → save → reload → resume the saved move state; a paid hint updates the mocked coin balance and ledger.
2. Wallet and leaderboard/levels navigation at desktop (`1280×800`) and mobile (`390×844`) widths; wallet reward offers remain unavailable when the provider is unconfigured, and the mobile wallet screen has no horizontal overflow.

These E2E tests use a mocked API. They validate browser behavior and responsive layout, not live API authentication or MongoDB persistence.

### Production build

Command: `npm --prefix frontend run build` with `VITE_API_BASE_URL=https://api.example.org`  
Exit code: `0`.

The example origin validates build configuration only; it is not a deployed service.

## Implementation notes

- Added loopback-only, test-database validation and opt-in real-Mongo integration suites; setup and execution commands are documented in [docs/TESTING.md](./docs/TESTING.md).
- Added Playwright coverage and made it part of the frontend `npm test` command.
- Fixed active-session reload so saved moves are replayed into the game state after progress is restored.
- Added a production-provider test confirming development ad simulation is not selected in production.
- The 50 shared level definitions were not changed.

## Issues and limitations

| # | Severity | Description | Status |
|---|---|---|---|
| 1 | MEDIUM | MongoDB replica-set persistence, transaction behavior, process restart, and real cross-user/concurrency boundaries were not exercised in this environment. | Run the opt-in suite with the isolated local replica set in [docs/TESTING.md](./docs/TESTING.md). |
| 2 | LOW | Browser E2E uses mocked API responses; live cookie/CORS behavior and hosted routes remain unverified. | No deployment or production credentials were available. |
| 3 | LOW | A real rewarded-ad provider/SDK was not available. | Production rewards remain disabled; no real ad-provider verification is claimed. |

## Verdict

```text
environment:
  docker: UNAVAILABLE — `docker` command not installed.
  node: AVAILABLE — v24.13.1.
  playwright: AVAILABLE — Playwright 1.64.1; Chromium installed successfully.
  infra-tier: UNVERIFIED — no verified isolated local replica set; mock-backed tests are not persistence evidence.
  browser-tier: PRIMARY(Playwright) — 2 browser E2E tests passed at desktop and mobile widths.
startup: PASS — Vite E2E server started and served the browser tests; backend startup with MongoDB remains unverified.
integration: UNVERIFIED — backend suite exit_code: 0, passed: 53, failed: 0, skipped: 4; separate safety checks exit_code: 0, passed: 3; no test database target was configured or contacted.
e2e: PASS — exit_code: 0, passed: 2, failed: 0; UI flows exercised with mocked API boundaries.
overall: NEEDS_SIGNOFF — rerun the MongoDB-backed integration suite against the dedicated local replica set before claiming full-stack persistence or concurrency verification.
```
