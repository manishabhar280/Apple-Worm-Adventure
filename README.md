# Apple Worm Adventure

Apple Worm Adventure is a guest-based grid puzzle game. Start immediately, guide a growing worm through orchard boards, collect every apple, avoid hazards, and reach the portal. Level results, active puzzles, and settings are saved locally in the browser; no account or backend connection is required to play.

## Project URLs

- Frontend: [https://apple-worm-adventure-frontend.onrender.com](https://apple-worm-adventure-frontend.onrender.com/)
- Backend API: [https://apple-worm-adventure-api.onrender.com](https://apple-worm-adventure-api.onrender.com/)

These are the project URLs supplied for this documentation. Their availability and live behavior were not checked as part of the local test runs below.

## Features

- One continuous 100-level progression with keyboard, WASD, and swipe controls; locally solved hints, pause, restart, and sequential unlocking.
- Versioned and validated browser-local guest progress, including completed-level scores and stars, unlocked level, active puzzle actions, and the reduced-motion preference.
- Local achievements derived from saved level results; they do not grant online rewards.
- Optional golden apples, hidden treasures, and four reusable puzzle mechanics are configured in `shared/levelFeatures.js`, separate from the canonical 100 level layouts.
- A UTC-based daily challenge with idempotent local streak rewards; guest coins are cosmetic-only and are separate from the authenticated server wallet.
- Five worm skins unlock from completed-level milestones and can be previewed/equipped locally.
- A browser-local reduced-motion setting and responsive layouts.
- Optional moving obstacles advance one path step with each valid in-bounds move. Collisions use the resulting move tick; invalid and out-of-bounds moves do not advance them. Their positions are replayed from shared rules, and hints are unavailable on these boards until the solver supports them.
- Optional ice tiles make the worm slide in its chosen direction while its head remains on ice. Each slide step resolves normal collisions and item interactions; wall contact stops at the last in-bounds cell. A direction action advances moving obstacles once, before the slide steps, and hints are unavailable on ice boards until the solver supports them.
- Optional positive-integer `moveLimit` metadata marks a level as a limited-move challenge (`isChallengeLevel` identifies it). A direction action counts once regardless of ice or teleport movement. Each internal step checks collisions before pickups; the moving obstacles use the next action tick once. A wall stops an ice slide at the last in-bounds cell, while obstacles, locked gates, and body collisions fail the attempt. After movement and pickups, a completed win takes precedence over exhaustion; otherwise reaching the move limit fails the challenge. Limited-move hints are disabled until the solver can guarantee a route within the limit.
- The legacy backend retains JWT authentication, account-scoped MongoDB sessions/progress, profiles, server achievements, wallet/boosters, rewards, leaderboard, and admin services for existing account data and API clients. These features are not exposed in the guest game interface.
- Guest play does not make authentication or gameplay API requests. It has no wallet, purchases, boosters, rewarded ads, account sync, or online leaderboard.
- Responsive React screens with loading, empty, and error states.

## Technologies

- Frontend: React 18, Vite 6, JavaScript, and CSS.
- Backend: Node.js 20+, Express 4, and Zod request validation.
- Database: MongoDB with Mongoose 8; transaction-dependent features require a replica set or MongoDB Atlas.
- Authentication/security: bcryptjs password hashing, signed JWT sessions in HttpOnly cookies, authorization checks, strict request validation, CORS, and Origin validation for state-changing requests.
- Browser testing: Playwright.
- Deployment configuration: Render service configuration in `render.yaml`.

## Architecture and project layout

```text
frontend/
  src/App.jsx             Guest navigation, local progress, and game state
  src/pages/              Guest landing, levels, gameplay, achievements, and settings
  src/data/guestProgress.js Versioned and validated browser-local save
  src/services/api.js     Legacy HTTP API client for account-dependent features
  e2e/                    Playwright browser tests
backend/
  src/app.js              Express middleware and route registration
  src/routes/             API route definitions and validation
  src/controllers/        HTTP request/response handlers
  src/services/           Authentication, gameplay, wallet, rewards, and stats
  src/models/             Mongoose persistence models
shared/                   Canonical level definitions, game rules, world progression, and additive level features
docs/                     User guide, deployment checklist, MongoDB test setup
render.yaml               Render backend service configuration
```

The guest React/Vite game runs without the Express API and stores its progress in browser local storage. The existing Express API, authentication routes, MongoDB models, and account-scoped services remain available for existing account data and other API clients; guest-local results are not sent to the server or trusted for server rewards.

## Local setup

Install Node.js 20+ and npm. From the project root, install dependencies and copy the environment templates:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Configure `backend\.env` for local development: set `NODE_ENV` to development, `FRONTEND_ORIGIN` to your local frontend origin, `MONGODB_URI` to your development MongoDB instance, and `JWT_SECRET` to a private random value of at least 32 characters. Keep `.env` files out of version control. Transaction-backed wallet and reward operations require a MongoDB replica set.

In `frontend\.env`, set `VITE_API_BASE_URL` to the local backend origin. Start the API and frontend in separate terminals from the project root:

```powershell
npm --prefix backend run dev
```

```powershell
npm --prefix frontend run dev
```

The frontend is served at <http://localhost:5173>; API readiness is at <http://localhost:5000/api/health/ready>. The optional development reward simulation is not an advertisement; use `unconfigured` to keep reward claims unavailable.

### Environment variables

Both committed `.env.example` files contain placeholders, not usable credentials. Copy them only as templates and replace placeholders locally or configure variables in the hosting dashboards. Never commit `.env` or paste secrets into source files.

| Variable | Service | Description |
|---|---|---|
| `NODE_ENV` | API | Use `production` on the host; `development` locally. |
| `PORT` | API | HTTP port. The hosting platform provides this in production; local default is 5000. |
| `MONGODB_URI` | API | Persistent MongoDB connection string; keep it private. Production startup validation rejects placeholders. |
| `JWT_SECRET` | API | Unique private signing secret, at least 32 characters. Never reuse the example value. |
| `JWT_EXPIRES_IN` | API | JWT lifetime, e.g. `1h`. |
| `FRONTEND_ORIGIN` | API | Exact frontend origin allowed by CORS, including scheme but no path/trailing slash. Production requires HTTPS. |
| `REWARDED_AD_PROVIDER` | API | `unconfigured` in production. The development simulation is local-only and not a real ad. |
| `REWARD_SIMULATION_MIN_WATCH_SECONDS` | API | Development simulation wait duration, integer 1–300. |
| `VITE_API_BASE_URL` | Frontend build | HTTPS API origin embedded at build time. Frontend production build fails if it is missing, HTTP, or still the example placeholder. It is an origin, not a secret. |
| `MONGODB_TEST_URI` | Backend tests only | Optional isolated loopback MongoDB replica-set URI. It must use a database named `apple_worm_adventure_test_<suffix>` and is never an application fallback. |

The environment templates contain placeholders only. Keep real credentials in local environment files or hosting secret settings; never commit them.

## API overview

All API routes are prefixed with `/api`. Protected routes require `Authorization: Bearer <JWT>`.

| Area | Routes |
|---|---|
| Health | `GET /api/health/live`, `GET /api/health/ready`, `GET /api/health` |
| Authentication/profile | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PATCH /api/auth/me`, `POST /api/auth/logout` |
| Player/game | `GET /api/player/progress`, `GET /api/player/dashboard`, `GET /api/player/history`, `POST /api/player/sessions`, `PUT /api/player/sessions/:sessionId/actions`, `GET /api/player/leaderboard` |
| Achievements | `GET /api/achievements` |
| Wallet | `GET /api/wallet/balance`, `GET /api/wallet/boosters`, `POST /api/wallet/boosters`, `GET /api/wallet/transactions`, `POST /api/wallet/hints` |
| Rewards | `GET /api/rewards/configuration`, `POST /api/rewards/sessions`, `POST /api/rewards/sessions/:sessionId/verify`, `GET /api/rewards/history` |
| Admin only | `GET /api/admin/dashboard`, `GET /api/admin/reward-configurations`, `PATCH /api/admin/reward-configurations/:rewardType` |

The readiness endpoint returns 503 until MongoDB is connected; liveness remains 200 while the API process is responsive. The existing `/health` endpoint has the same database-aware readiness behavior.

Game results are derived by replaying actions against shared server-side boards. The leaderboard sums each player's best score per completed level. Wallet and reward coin changes, and admin configuration plus audit writes, use MongoDB transactions. Use Atlas or a replica-set deployment; a standalone MongoDB server cannot support these operations.

Public registration always assigns the `player` role. Provision admins only through a trusted operator/database workflow; there is no public role update API.

## Testing

From the project root:

```powershell
npm --prefix backend test
```

```powershell
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend test
$env:VITE_API_BASE_URL = 'https://apple-worm-adventure-api.onrender.com'
npm --prefix frontend run build
Remove-Item Env:VITE_API_BASE_URL
```

See [TESTING.md](./TESTING.md) for test commands, actual results, coverage boundaries, and the isolated MongoDB setup. MongoDB integration tests require a separately configured `MONGODB_TEST_URI`; they never fall back to `MONGODB_URI`. Browser E2E tests use a mocked API and do not establish live backend persistence.

## Deployment

The deployment URLs listed above are supplied for this project. The repository's [render.yaml](./render.yaml) configures the Node.js backend service and health check; deployment settings such as the database URI, JWT secret, and allowed frontend origin are provided through the hosting environment. Configure `VITE_API_BASE_URL` to the backend HTTPS origin when building the frontend and `FRONTEND_ORIGIN` to the frontend HTTPS origin in the backend environment. See [DEPLOYMENT_CHECKLIST.md](./docs/DEPLOYMENT_CHECKLIST.md) for deployment verification steps.

Production sessions use Secure, HttpOnly cookies and logout revokes issued sessions. Cookies expire with the configured JWT lifetime (one hour by default); there is no refresh-token flow. Browser cookie restrictions can affect sessions when frontend and backend are on different sites. The URLs' availability, deployed API behavior, and hosted persistence were not checked in the local test runs.

## Known limitations

- The project URLs are listed as supplied, but their live availability and behavior were not verified in this test run.
- There is no real ad SDK or server-side ad-provider verification. Production rewards are disabled; the local simulation is not an ad.
- Rewarded revive and double score remain unavailable. In-game boosters are purchased directly with coins and do not simulate rewarded advertisements. The separate 5-coin gameplay hint remains available; rewarded hints and bonus coins are supported only in the explicitly labeled development simulation until a real provider is configured.
- Sessions expire after the configured JWT lifetime (one hour by default); there is no refresh-token flow. Browser support for cross-site cookies varies; test the deployed origins in target browsers.
- Transaction-dependent features require MongoDB replica-set/Atlas support.
- Automated browser E2E and opt-in MongoDB-backed integration suites are available; hosted-service and production browser tests remain unverified.
- No production rewarded-ad provider SDK/adapter or provider credentials are configured. Production reward claims stay disabled. Integrating a provider requires a provider-specific client SDK/placement, a `RewardProviderAdapter` implementation that verifies signed server callbacks or provider receipts, private credentials in host environment variables, and end-to-end verification before enabling rewards. The development simulation is not an advertisement.
