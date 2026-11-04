# Deployment Checklist

## Before deploying

- [ ] Push the project without `.env` files, database credentials, tokens, or provider keys. `.gitignore` excludes local environment files; verify the Git history and hosting logs too.
- [ ] Use a supported Node.js runtime (22 is selected by `.node-version`).
- [ ] Create a persistent MongoDB Atlas cluster in an appropriate region. Create a least-privilege application database user, use a strong generated password, and restrict network access to the hosting provider's outbound IPs where available.
- [ ] Copy the Atlas SRV connection string into the backend host's secret environment variable `MONGODB_URI`; encode special characters in credentials.
- [ ] Generate a new `JWT_SECRET` per environment. Never reuse the example value.
- [ ] Keep `REWARDED_AD_PROVIDER=unconfigured` in production until a real ad SDK and server-side provider verification adapter are implemented and tested.
- [ ] Production reward configuration must report rewards disabled while the provider remains unconfigured. Development simulation is not a real ad and must never be enabled as a production provider.
- [ ] Create/select the Netlify site name or configure a custom domain and record its final HTTPS origin before deploying Render. The backend accepts one exact frontend origin.

## Deploy the backend to Render

1. Import the Git repository in Render and deploy the included `render.yaml` Blueprint.
2. In Render's private environment settings, set `MONGODB_URI` to the Atlas SRV connection string and `JWT_SECRET` to a newly generated random value of at least 32 characters. Set `FRONTEND_ORIGIN` to the exact Netlify/custom-domain origin, such as `https://<your-site>.netlify.app`, without a path or trailing slash.
3. Keep the Blueprint values `NODE_ENV=production`, `REWARDED_AD_PROVIDER=unconfigured`, and `JWT_EXPIRES_IN=1h`. Do not put credentials in the Blueprint or repository.
4. Deploy the web service. Render uses `npm --prefix backend ci`, `npm --prefix backend start`, and `/api/health/ready` as its health check. Production startup exits if MongoDB cannot be reached.
5. Replace `<render-service-host>` below with the actual Render service host. Confirm `https://<render-service-host>/api/health/ready` returns HTTP 200 and reports the database as connected. `/api/health/live` should return HTTP 200; `/api/health/ready` returns HTTP 503 until MongoDB connects.

## Deploy the frontend to Netlify

1. In Netlify, import the same repository and use the site URL recorded above. `netlify.toml` configures the `frontend` base directory, build, publish directory, and SPA route fallback.
2. In Netlify environment variables, set `VITE_API_BASE_URL` to `https://<render-service-host>` (actual HTTPS API origin, with no path or trailing slash). This is embedded at build time, so redeploy after changing it.
3. Deploy and open the Netlify site. Check that direct navigation to `/login`, `/dashboard`, and `/achievements` serves the SPA shell and that browser requests use the Render API origin, never `localhost`.
4. Confirm the Render `FRONTEND_ORIGIN` matches the live Netlify origin. If you use a custom domain or change the Netlify site name, update Render and restart/redeploy it.
5. Register a test player, sign in, complete a level, and verify saved progress/history. Confirm production reward offers are unavailable, and confirm the API rejects a player token at `/api/admin/dashboard`.

## Production verification

- [ ] Frontend root page and client-side routes load over HTTPS.
- [ ] Browser network requests target the deployed API origin, not `localhost`.
- [ ] Browser requests from the deployed frontend origin succeed; an unrelated origin does not receive `Access-Control-Allow-Origin`.
- [ ] API liveness returns HTTP 200.
- [ ] API readiness returns HTTP 200 and reports MongoDB connected.
- [ ] Registration/login work and a password is not returned by any API.
- [ ] Progress, history, wallet, and achievements remain available after an application restart.
- [ ] Wallet/reward claims and admin audit/configuration changes work with MongoDB transactions.
- [ ] Player tokens receive HTTP 403 for admin routes; provision an admin account only through a trusted operator workflow.
- [ ] Production environment uses a real MongoDB URI, strong unique JWT secret, HTTPS frontend origin, and `REWARDED_AD_PROVIDER=unconfigured`; verify reward sessions cannot be started.
- [ ] Configure MongoDB backups/retention, hosting alerts, and a credential rotation plan.

Use these PowerShell checks after replacing both host placeholders with the actual deployed hosts:

```powershell
$api = 'https://<render-service-host>'
$frontend = 'https://<your-site>.netlify.app'
Invoke-RestMethod "$api/api/health/live"
Invoke-RestMethod "$api/api/health/ready"
curl.exe -i -H "Origin: $frontend" "$api/api/health/live"
curl.exe -i -H "Origin: https://unrelated.example.org" "$api/api/health/live"
```

The ready response must report `database.connected: true`. The allowed-origin response must contain `Access-Control-Allow-Origin` equal to `$frontend` and `Access-Control-Allow-Credentials: true`; the unrelated-origin response must not contain the allow-origin header. These checks are a minimum: complete the browser registration/gameplay and persistence checks above too.

## Known limitations

- There is no live deployment until hosting accounts are configured and the deployed URLs above are tested.
- Rewarded ads have no real ad SDK/provider verification. Production rewards are disabled; the development simulation is not an ad.
- Development simulation grants only bonus coins and server-computed hints; no real ad is displayed. Production needs a provider SDK plus a `RewardProviderAdapter` implementation that validates provider-side signed callbacks/receipts using private host environment credentials. The app currently has no production adapter or credentials.
- Revive, double score, extra moves, and boosters remain unsupported and disabled.
- Rewarded hints are tied to the current eligible in-progress session. The separate 5-coin hint is supported independently.
- Browser sessions use Secure, HttpOnly cookies and expire with the JWT (one hour by default); there is no refresh-token flow. Browser third-party-cookie restrictions may block sessions on the default separate Netlify and Render hostnames. Same-site HTTPS custom domains are recommended and should be tested in target browsers.
- Wallet and admin audit operations require MongoDB transaction support (Atlas or a replica set); standalone MongoDB does not provide it.
- Local unit, mocked browser E2E, and opt-in isolated MongoDB integration tests are documented in [TESTING.md](./TESTING.md). They do not replace testing the actual hosted URLs, production database, or target-browser cookie behavior.
