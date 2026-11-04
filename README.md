# Apple Worm Adventure

A full-stack grid puzzle game in the Apple Worm style. Collect apples, grow the worm, avoid obstacles, and reach the portal. The project includes accounts, server-validated game progress, leaderboard, achievements, a virtual coin wallet, a rewarded-ad verification seam, and admin reward configuration.

> **Deployment status:** This repository contains deployment configuration and instructions, but the application is not deployed by this change. Do not treat deployment as complete until the deployed URLs pass the checklist in [DEPLOYMENT_CHECKLIST.md](./docs/DEPLOYMENT_CHECKLIST.md).

## Features

- 50 playable levels with keyboard, WASD, and swipe controls; hints, pause, restart, and level unlocking.
- JWT authentication in an HttpOnly browser cookie, bcrypt password hashing, and player/admin role authorization.
- MongoDB-backed game sessions, resumable progress, best results, history, dashboard, and leaderboard.
- Player-scoped achievement progress for level completions, apples, stars, perfect levels, and winning streaks.
- Virtual coin wallet and transaction ledger; gameplay hints cost 5 coins and are debited server-side. No client balance mutation endpoint.
- Reward configuration/session flow with daily limits, cooldowns, and duplicate-claim protection. Development simulation supports server-verified bonus coins and safe gameplay hints; no real ad provider is integrated, and production disables rewards.
- Admin-only dashboard and audited reward configuration updates.
- Responsive React screens with loading, empty, and error states.

## Tech stack

- Frontend: React 18, Vite 6, CSS.
- Backend: Node.js 20+, Express 4, Zod request validation.
- Persistence: MongoDB Atlas or another MongoDB replica set, Mongoose 8.
- Security: JWT, bcryptjs, server-side role checks, strict request validation.
- Browser sessions: HttpOnly cookies, credentialed API requests, state-changing request Origin validation, and server-side logout revocation.
- Hosting configuration: Netlify static frontend, Render Node.js API, MongoDB Atlas persistent database.

## Project layout

```text
frontend/   React + Vite app, browser game and UI
backend/    Express API, authentication, services, routes, and Mongoose models
shared/     Canonical level definitions and game rules used by frontend and backend
docs/       End-user guide and deployment checklist
netlify.toml
render.yaml
```

## Local setup

Install Node.js 20+ (Node 22 is selected by `.node-version`) and npm. From the project root:

```powershell
Set-Location 'D:\Intership task\VELoop Rewards\Apple-Worm-Adventure\backend'
npm ci
Copy-Item .env.example .env
```

Edit `backend\.env` for local development:

- Set `NODE_ENV=development`.
- Set `FRONTEND_ORIGIN=http://localhost:5173`.
- Set `MONGODB_URI` to a reachable MongoDB instance.
- Set a unique `JWT_SECRET` of at least 32 characters. Generate one with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

- For local simulation only, set `REWARDED_AD_PROVIDER=development_simulation`. It is not a real ad. Set it to `unconfigured` to disable reward claims.

In another terminal:

```powershell
Set-Location 'D:\Intership task\VELoop Rewards\Apple-Worm-Adventure\frontend'
npm ci
Copy-Item .env.example .env
```

Edit `frontend\.env` and set `VITE_API_BASE_URL=http://localhost:5000`.

Run the API and frontend in separate terminals:

```powershell
Set-Location 'D:\Intership task\VELoop Rewards\Apple-Worm-Adventure\backend'
npm run dev
```

```powershell
Set-Location 'D:\Intership task\VELoop Rewards\Apple-Worm-Adventure\frontend'
npm run dev
```

Open <http://localhost:5173>. API readiness is at <http://localhost:5000/api/health/ready>.

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

`backend/.env.example` illustrates production-shaped values; replace its host/user/password/secret placeholders. For local setup, explicitly use development values as described above.

## API overview

All API routes are prefixed with `/api`. Protected routes require `Authorization: Bearer <JWT>`.

| Area | Routes |
|---|---|
| Health | `GET /health/live`, `GET /health/ready`, `GET /health` |
| Authentication | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me`, `POST /auth/logout` |
| Player | `GET /player/progress`, `GET /player/dashboard`, `GET /player/history`, `POST /player/sessions`, `PUT /player/sessions/:sessionId/actions`, `GET /player/leaderboard` |
| Achievements | `GET /achievements` |
| Wallet | `GET /wallet/balance`, `GET /wallet/transactions`, `POST /wallet/hints` |
| Rewards | `GET /rewards/configuration`, `POST /rewards/sessions`, `POST /rewards/sessions/:sessionId/verify`, `GET /rewards/history` |
| Admin only | `GET /admin/dashboard`, `GET /admin/reward-configurations`, `PATCH /admin/reward-configurations/:rewardType` |

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
$env:VITE_API_BASE_URL = 'https://api.example.org'
npm --prefix frontend run build
Remove-Item Env:VITE_API_BASE_URL
```

MongoDB integration tests require a separately configured `MONGODB_TEST_URI`; they never fall back to `MONGODB_URI`. See the exact isolated replica-set setup and safety checks in [testing documentation](./docs/TESTING.md). The frontend E2E suite mocks the API and does not prove live backend behavior. The frontend build example validates configuration only; use the actual API URL for a deployment.

## Deployment

The project is prepared for this deployment path:

1. **MongoDB Atlas** — create a persistent cluster/database, application user, backups, and restricted network access. Obtain the SRV URI.
2. **Choose the Netlify site URL** — create the Netlify site from this repository and select its site name or configure its custom domain. Record its exact HTTPS origin (scheme and host only); this value is needed by the backend CORS setting.
3. **Render backend** — deploy the repository's `render.yaml` Blueprint. It builds with `npm --prefix backend ci`, starts with `npm --prefix backend start`, and checks `/api/health/ready`. Set the prompted `FRONTEND_ORIGIN` to the final Netlify origin, `MONGODB_URI` to the private Atlas SRV URI, and `JWT_SECRET` to a new randomly generated secret. The Blueprint sets `NODE_ENV=production` and `REWARDED_AD_PROVIDER=unconfigured`. Production startup stops if MongoDB is unreachable.
4. **Netlify frontend** — configure `VITE_API_BASE_URL` to the HTTPS origin of the deployed Render API (scheme and host only), then deploy. `netlify.toml` selects `frontend` as the base directory, `npm ci && npm run build`, `dist` as the publish directory, and an SPA route fallback. The API URL is embedded at build time.
5. Confirm Render's `FRONTEND_ORIGIN` exactly matches the deployed Netlify/custom-domain origin, including scheme, with no path or trailing slash. Redeploy/restart Render after changing it.
6. Test the actual deployed URLs, CORS, registration, login, persistence, and role access using [DEPLOYMENT_CHECKLIST.md](./docs/DEPLOYMENT_CHECKLIST.md). Deployment is not complete until these checks pass against your real URLs.

Exact provider setup, environment values, verification checks, and known limitations are in the [deployment checklist](./docs/DEPLOYMENT_CHECKLIST.md). Player instructions are in the [user guide](./docs/USER_GUIDE.md).

Production sessions use a Secure, HttpOnly cookie; frontend JavaScript cannot read or persist the JWT. Logout revokes issued sessions. The cookie expires with its JWT (one hour by default), and there is no refresh-token flow, so players must sign in again after expiry. Default Netlify and Render hostnames are cross-site, and browser third-party-cookie restrictions may block sessions. For broader compatibility, use HTTPS custom domains under the same site (for example, `game.example.com` and `api.example.com`) and test in supported browsers.

## Known limitations

- No live deployment is claimed until the hosted URLs have actually been tested.
- There is no real ad SDK or server-side ad-provider verification. Production rewards are disabled; the local simulation is not an ad.
- Rewarded revive, double score, extra moves, and boosters are not implemented and are disabled. Rewarded hints and bonus coins are supported only in the explicitly labeled development simulation until a real provider is configured. The separate 5-coin gameplay hint is available independently.
- Sessions expire after the configured JWT lifetime (one hour by default); there is no refresh-token flow. Browser support for cross-site cookies on the default Netlify/Render hostnames varies; same-site custom domains are recommended.
- Transaction-dependent features require MongoDB replica-set/Atlas support.
- Automated browser E2E and opt-in MongoDB-backed integration suites are available; hosted-service and production browser tests remain unverified.
- No production rewarded-ad provider SDK/adapter or provider credentials are configured. Production reward claims stay disabled. Integrating a provider requires a provider-specific client SDK/placement, a `RewardProviderAdapter` implementation that verifies signed server callbacks or provider receipts, private credentials in host environment variables, and end-to-end verification before enabling rewards. The development simulation is not an advertisement.
