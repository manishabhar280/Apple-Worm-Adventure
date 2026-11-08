# Testing

This report records the automated results observed on 2026-11-07. Backend route and service tests use test doubles; browser E2E tests intercept the API with a mock. MongoDB-backed integration tests use a real local replica set. Mocked browser APIs do not prove hosted deployment behavior.

## Test results

| Area | Result | Evidence and limits |
|---|---|---|
| Backend complete suite | **PASS** — 78 passed, 0 failed, 0 skipped | `npm --prefix backend test`. Includes backend unit/API tests and the configured MongoDB-backed integration tests. |
| MongoDB integration | **PASS** — real local MongoDB replica set | Covers user journey and persistence across backend restart; user isolation and authorization; concurrent wallet/reward operations; paid Hint validation and idempotency; and wallet purchase transaction rollback in `walletRollback.integration.test.js`. |
| Frontend unit tests | **PASS** — 93 passed | Includes game rules, routes, wallet actions, world configuration, and all 100 playable level definitions. |
| Browser E2E | **PASS** — 7 passed | Playwright starts the local Vite frontend and mocks API responses. The tests do not prove live API, hosted deployment, or database behavior. |
| Production build | **PASS** | `npm --prefix frontend run build` completed with the configured HTTPS API origin. A build does not verify that the deployed service is reachable. |

### Requested feature checks

- **Registration and login — PASS with mocked browser API and backend route tests.** The backend tests cover account registration, successful login, and invalid credentials. The browser flow registers, logs out, logs in again, and asserts that login sends only `email` and `password`; browser API responses are mocked.
- **Logout and login again — PASS in the mocked browser flow.** Backend route tests separately verify logout revocation and rejection of the revoked session. A real hosted sign-in flow was not tested.
- **100-level progress — PARTIAL.** Frontend unit tests validate all 100 generated definitions, preserve a fingerprint of levels 1–50, and verify a completion route for every level. Backend route tests cover starting and saving levels 51 and 100 and reject level 101; browser E2E checks dynamic level/star totals and next-level navigation. MongoDB integration verifies persistence across a backend restart for a Level 1 session; it does not complete and persist every level against MongoDB.
- **Dashboard, history, and leaderboard — PASS in mocked/model-backed tests.** Backend tests exercise dashboard calculations, caller-scoped history, and leaderboard scoring using test doubles; browser E2E checks navigation with mocked responses. MongoDB integration separately verifies user-scoped access and persistence across restart.
- **Achievements and profile — PASS in route/service tests using test doubles.** Tests cover achievement endpoint access/progress and profile retrieval/update behavior. The profile/achievement UI against a live backend and database was not verified.
- **Mobile responsive behavior — PASS at emulated viewports.** Chromium checked the wallet screen for horizontal overflow at iPhone 16 logical viewport dimensions (**393 × 852 CSS pixels**) and iPhone 16 Pro Max logical viewport dimensions (**440 × 956 CSS pixels**). These are viewport emulations, not tests on physical iPhones or Mobile Safari. Other screens were not all exhaustively checked at those sizes.
- **Rewarded ads — UNAVAILABLE, not passed as an available feature.** The configured production provider is `unconfigured`; the browser test confirms reward offers are disabled and backend tests verify production does not select development simulation. No real ad provider is integrated or verified.

## Run locally

Install dependencies from the repository root:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
```

Run backend tests:

```powershell
npm --prefix backend test
```

Run frontend unit and browser tests (install Chromium once if needed):

```powershell
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend test
```

Build the frontend with an HTTPS API origin. Set this to the actual API origin for a deployment; the URL below is the project API origin, and the build itself does not contact it:

```powershell
$env:VITE_API_BASE_URL = 'https://apple-worm-adventure-api.onrender.com'
npm --prefix frontend run build
Remove-Item Env:VITE_API_BASE_URL
```

## MongoDB integration tests

MongoDB-backed tests require a dedicated local replica set and `MONGODB_TEST_URI`. The harness rejects remote hosts and non-test database names and does not fall back to `MONGODB_URI`. Tests use separately suffixed databases named `apple_worm_adventure_test_<suffix>` and clean up records by generated test-user IDs.

**Current result: PASS against a real local MongoDB replica set.** Coverage includes `userJourney.integration.test.js`, `userIsolation.integration.test.js`, `concurrency.integration.test.js`, and `walletRollback.integration.test.js`; `mongoTestSupport.test.js` checks harness safety. The rollback test injects a failure after the booster inventory update and confirms balance, inventory, and transaction ledger are unchanged. See [safe Windows replica-set setup and verification instructions](./docs/TESTING.md). Never use production, staging, remote, or shared-user data as a test target.

## Test configuration notes

- Playwright uses Chromium in headless mode. The E2E suite uses an API mock; it does not verify live cookies/CORS, deployment availability, or MongoDB persistence.
- Wallet transactions and reward claims require replica-set transaction support.
- Environment variable names and application setup are documented in the [README](./README.md); keep credentials out of documentation and source control.
