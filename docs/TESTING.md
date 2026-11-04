# Testing

## Requirements

- Node.js 20 or newer and npm.
- Chromium for the frontend Playwright tests.
- Docker and Docker Compose are not required for unit or browser tests. Docker is needed for the local MongoDB integration setup below.
- A MongoDB replica set is required for wallet and reward transaction tests; a standalone MongoDB server is insufficient.

Install the locked dependencies from the project root:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
```

## Run backend tests

From the project root:

```powershell
npm --prefix backend test
```

This runs the backend's mock-backed unit/API tests and the MongoDB-backed integration tests. Integration cases are explicitly skipped unless `MONGODB_TEST_URI` is set to a safe test target.

## Run frontend tests

Install the browser once, then run unit and browser E2E tests:

```powershell
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend test
```

The browser suite starts Vite on `127.0.0.1:4173` and intercepts the API. It tests protected-route redirects, registration, level launch, save/reload/resume, wallet and leaderboard navigation, disabled production reward offers, and mobile viewport overflow. These browser tests do not claim a live backend or MongoDB integration.

## Run the production build

The frontend build requires an HTTPS API origin. Use the actual API origin for a deployment. A syntactically valid example can be used only to validate the build:

```powershell
$env:VITE_API_BASE_URL = 'https://api.example.org'
npm --prefix frontend run build
Remove-Item Env:VITE_API_BASE_URL
```

## Run MongoDB integration tests safely

The integration harness **only reads `MONGODB_TEST_URI`**. It never falls back to `MONGODB_URI`. It refuses to run in `NODE_ENV=production`, refuses a test URI equal to `MONGODB_URI`, requires a loopback MongoDB host, and requires the database name to start with `apple_worm_adventure_test_`. Remote databases are rejected, so this test harness cannot connect to a production MongoDB host.

The tests create accounts with unique `@example.test` emails and clean up records only by those generated user IDs. They never drop or reset a database. Do not set `MONGODB_TEST_URI` to any production or shared-user database.

### Windows setup with Docker Desktop

If Docker Desktop is not installed, install it from an approved source (for example, in an elevated PowerShell window with `winget install --id Docker.DockerDesktop --exact`), complete any requested Windows restart, and start Docker Desktop. Open a fresh PowerShell window at the repository root and confirm `docker info` succeeds. The commands below create an unauthenticated, disposable single-node replica set with **no mounted data volume**, published only on the local loopback interface. The example uses port `27028` so it does not reuse the usual MongoDB port. If any command fails, stop and resolve that failure; do not point the tests at another MongoDB instance.

```powershell
# Confirm the Docker engine is running.
docker info
if ($LASTEXITCODE -ne 0) { throw 'Docker is unavailable; stop here.' }

# Do not stop or remove an existing container with this name.
$existing = docker ps -aq --filter "name=^/apple-worm-test-mongo$"
if ($existing) { throw 'Container name is already in use; inspect it before proceeding.' }

# Do not connect to or stop a process already using this port.
$listener = Get-NetTCPConnection -State Listen -LocalPort 27028 -ErrorAction SilentlyContinue
if ($listener) { throw 'Port 27028 is occupied; choose a different unused loopback port.' }

# No volume is mounted; data is discarded when this container is stopped.
docker run --name apple-worm-test-mongo --rm -d `
  -p 127.0.0.1:27028:27028 mongo:8.0 `
  mongod --port 27028 --replSet rs0 --bind_ip_all
if ($LASTEXITCODE -ne 0) { throw 'Could not start the disposable MongoDB container.' }

# Initiate the single-node replica set.
Start-Sleep -Seconds 5
docker exec apple-worm-test-mongo mongosh --quiet --port 27028 `
  --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27028'}]})"
if ($LASTEXITCODE -ne 0) { throw 'Replica-set initiation failed.' }

# Wait for the new replica set to elect its primary.
$primary = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $status = docker exec apple-worm-test-mongo mongosh --quiet --port 27028 `
    --eval "db.hello().isWritablePrimary" 2>$null
  if ($LASTEXITCODE -eq 0 -and "$status" -match 'true') {
    $primary = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $primary) { throw 'MongoDB did not elect a primary; do not run tests.' }

# Verify the exact loopback host, replica-set primary, and test-only database name.
$env:MONGODB_TEST_URI = 'mongodb://127.0.0.1:27028/apple_worm_adventure_test_local?replicaSet=rs0'
Remove-Item Env:MONGODB_URI -ErrorAction SilentlyContinue
mongosh --quiet $env:MONGODB_TEST_URI --eval `
  "const h=db.hello(); print(JSON.stringify({database:db.getName(),setName:h.setName,primary:h.isWritablePrimary,hosts:h.hosts})); if(db.getName()!=='apple_worm_adventure_test_local'||h.setName!=='rs0'||!h.isWritablePrimary||!h.hosts.includes('127.0.0.1:27028')) quit(1)"
if ($LASTEXITCODE -ne 0) { throw 'MongoDB target verification failed; do not run tests.' }

# Run the harness safety checks before the database-backed tests.
Push-Location backend
try {
  node --test test/integration/mongoTestSupport.test.js
  if ($LASTEXITCODE -ne 0) { throw 'MongoDB safety-guard tests failed.' }

  # Run exactly the four database-backed test cases (one journey, two isolation,
  # and one concurrency case).
  node --test test/integration/userJourney.integration.test.js `
    test/integration/userIsolation.integration.test.js `
    test/integration/concurrency.integration.test.js
  if ($LASTEXITCODE -ne 0) { throw 'MongoDB integration tests failed.' }

  # Then run the complete backend suite with the same isolated test target.
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'Backend test suite failed.' }
}
finally {
  Pop-Location
  Remove-Item Env:MONGODB_TEST_URI -ErrorAction SilentlyContinue
  Remove-Item Env:MONGODB_URI -ErrorAction SilentlyContinue
  docker stop apple-worm-test-mongo 2>$null | Out-Null
}
```

The integration suite starts and stops separate backend processes against uniquely suffixed test databases (for example, `apple_worm_adventure_test_local_journey`). The application subprocess uses the harness-derived, validated test URI as its database connection setting; the parent shell's `MONGODB_URI` is removed above. The suite verifies database read-after-write and persistence across a backend restart, user-scoped access, reward and session duplicate protection, concurrent wallet debits, expired sessions, validation failures, wallet history, and level completion calculations.

If `docker info` fails, do not use an already-running `mongod` unless you have independently confirmed that it is a newly created, disposable local test instance. The tests must remain skipped until the isolated replica set above (or an equivalently isolated local test instance) is available. To use another free port, change all occurrences of `27028` consistently in the port check, Docker port mapping, `mongod`/`mongosh` port arguments, replica-set member address, and test URI.

If replica-set initialization or target verification fails after the container starts, do not run tests. Stop only the disposable container created by these instructions with `docker stop apple-worm-test-mongo`; its `--rm` option removes its container and unmounted data. Do not stop or remove any other MongoDB container or service.

Remote database credentials and URIs are intentionally unsupported. Integration cleanup is record-scoped, but tests still write to the configured local test databases.

## Test coverage and limitations

- Existing backend and frontend unit tests use local mocks or pure logic and do not require MongoDB.
- Frontend browser E2E exercises the UI with a mocked API, not actual backend authorization or persistence.
- MongoDB tests are the only tests here that verify real MongoDB transactions, indexes, persistence, and backend restart behavior.
- Production ad-provider verification cannot be tested because no real provider SDK, credentials, or deployment are configured. Automated tests verify that development simulation is not selected by the production provider factory.
- Hosted deployment, real browser third-party-cookie policies, and production MongoDB are not tested by local suites.
