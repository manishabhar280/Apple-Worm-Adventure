# Testing

This report records the automated results observed on 2026-11-05. Backend route and service tests use test doubles; browser E2E tests intercept the API with a mock. Neither proves behavior against the hosted backend or a real MongoDB database.

## Test results

| Area | Result | Evidence and limits |
|---|---|---|
| Backend suite | **PASS** — exit code 0; 53 passed, 4 skipped, 0 failed (57 total) | `npm --prefix backend test`. Covers mocked API/service flows, authentication, validation, and authorization. |
| MongoDB integration | **UNVERIFIED** — 4 skipped | `MONGODB_TEST_URI` was unset. No real MongoDB persistence, transactions, backend restart, or Mongo-backed isolation/concurrency behavior was tested. |
| Frontend unit tests | **PASS** — 31 passed, 0 skipped, 0 failed | Includes game rules, save queue, routes, wallet actions, and validation that all 50 level definitions are playable. |
| Browser E2E | **PASS** — 3 passed | Playwright starts the local Vite frontend and mocks API responses. The tests cover registration, play/save/reload/resume, logout and login again, login payload fields, wallet/leaderboard navigation, and the disabled reward-provider UI. They do not prove live API or database behavior. |
| Production build | **PASS** — exit code 0 | `npm --prefix frontend run build` completed with the configured HTTPS API origin. A build does not verify that the deployed service is reachable. |

### Requested feature checks

- **Registration and login — PASS with mocked browser API and backend route tests.** The backend tests cover account registration, successful login, and invalid credentials. The browser flow registers, logs out, logs in again, and asserts that login sends only `email` and `password`; browser API responses are mocked.
- **Logout and login again — PASS in the mocked browser flow.** Backend route tests separately verify logout revocation and rejection of the revoked session. A real hosted sign-in flow was not tested.
- **50-level progress — PARTIAL.** A frontend unit test validates 50 complete playable level definitions. Backend service tests cover completing level 1, recording progress, and unlocking level 2; browser E2E covers save/reload/resume against a mock API. Persisting and resuming progress across all 50 levels in MongoDB is **UNVERIFIED** because the MongoDB integration cases were skipped.
- **Dashboard, history, and leaderboard — PASS in mocked/model-backed tests.** Backend tests exercise dashboard calculations, caller-scoped history, and leaderboard scoring using test doubles; browser E2E checks navigation with mocked responses. Real database-backed results are unverified.
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

The four MongoDB-backed tests are opt-in and require a dedicated local replica set and `MONGODB_TEST_URI`. The harness rejects remote hosts and non-test database names and does not fall back to `MONGODB_URI`. The tests use separately suffixed databases named `apple_worm_adventure_test_<suffix>`.

**Current result: UNVERIFIED / SKIPPED (4 tests).** Do not treat the passing mocked tests as MongoDB persistence evidence. Follow the [safe Windows replica-set setup and verification instructions](./docs/TESTING.md) before running any database-backed tests. Never use production, staging, remote, or shared-user data as a test target.

## Test configuration notes

- Playwright uses Chromium in headless mode. The E2E suite uses an API mock; it does not verify live cookies/CORS, deployment availability, or MongoDB persistence.
- Wallet transactions and reward claims require replica-set transaction support.
- Environment variable names and application setup are documented in the [README](./README.md); keep credentials out of documentation and source control.
