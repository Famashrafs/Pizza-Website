# Demo Order API (`server/`)

A free-tier HTTP stand-in for the Firebase Callable Functions while the project
is on the Spark (free) plan. It hosts the **same** trusted order engine used by
the callable transport — `functions/lib/orderServiceCore.js` — behind an Express
transport, so there is exactly one implementation of pricing, validation,
idempotency and guest-token handling.

```text
POST /api/orders/create       → orderService.createOrder   (auth required)
POST /api/orders/guest-lookup → orderService.getGuestOrder (capability token)
GET  /health                  → liveness probe (no secrets)
GET  /api/diagnostics         → non-secret build/feature info
```

There are intentionally **no** order-mutation endpoints: owner/admin status
changes stay on Firestore under `firestore.rules`.

## Environment variables

Set these in the Render dashboard (or a local, git-ignored `server/.env`):

| Variable | Required | Notes |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | yes | Full service-account JSON on one line. **Secret — never commit.** |
| `CORS_ALLOWED_ORIGINS` | recommended | Comma-separated browser origins (e.g. `http://localhost:3000,https://your-app.vercel.app`). `localhost:3000` is always allowed. |
| `FIREBASE_PROJECT_ID` | optional | Overrides the project id from the service account. |
| `DEMO_MODE` | optional | `demo` (default) or `live`; surfaced on `/api/diagnostics`. |
| `PORT` | optional | Render sets this automatically; default `8080`. |

Get the service account from **Firebase Console → Project settings → Service
accounts → Generate new private key**, then minify the JSON onto a single line.

## Run locally

```powershell
# from the repository root
npm --prefix server install
node --env-file=server/.env server/index.js
# → http://localhost:8080/health
```

## Deploy on Render (free tier)

Use the checked-in Blueprint (`render.yaml`) or configure manually:

1. **New → Web Service**, connect this repository.
2. **Root Directory:** repository root (`.`).
3. **Build Command:** `npm --prefix server install`
4. **Start Command:** `node server/index.js`
5. **Health Check Path:** `/health`
6. **Instance Type:** Free.
7. Add the environment variables above (`FIREBASE_SERVICE_ACCOUNT_JSON`,
   `CORS_ALLOWED_ORIGINS`) in the Environment tab.

> The root directory must stay at the repository root so the service can
> `require('../functions/lib/orderServiceCore')`. Do not set it to `server/`.

Then point the frontend at it:

```bash
# .env.local (or the Vercel environment)
REACT_APP_API_BASE_URL=https://<your-service>.onrender.com
```

Unset `REACT_APP_API_BASE_URL` to go back to the Firebase callable transport.

## Tests

```powershell
# from the repository root
npm run test:server
```

The suite runs the Express app with injected doubles (no Firebase, no network)
and pins: token-derived identity, CORS allowlisting, secret-free health/
diagnostics, generic error responses, and the absence of a mutation surface.

## Security notes

* Identity always comes from the verified Firebase ID token
  (`verifyIdToken(token, true)` — revocation checked); the request body's
  `customerId`/`customerType`/`role` are ignored.
* CORS uses a fixed allowlist — no wildcard with credentials.
* Guest lookup requires the high-entropy tracking token delivered once at
  checkout; only its SHA-256 hash is stored.
* Credentials live only in the environment; a leaked request can never retrieve
  them, and errors are logged server-side while clients receive generic messages.
