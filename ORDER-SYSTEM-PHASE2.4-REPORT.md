# Pizza-Website — Free Demo Backend Migration Report (Phase 2.4)

Date: 2026-10-15 · Branch: `master` (base commit `6c94d5d`, changes uncommitted)
Scope: make the demo order flow fully functional **without the Firebase Blaze
plan**. Cloud Functions deploy is blocked (`cloudbuild.googleapis.com` cannot be
enabled on Spark), so this phase adds a free-tier Node/Express HTTP API on Render
that reuses the *same* server-side order engine, and switches the frontend
gateway to a configurable transport. No billing upgrade, no production deploy, no
UI redesign, no rules/collection-schema changes. Builds on
`ORDER-SYSTEM-PHASE2.2-REPORT.md`.

---

## A. Executive summary

Phase 2.3 tried to deploy the `createOrder` / `getGuestOrder` callables and hit a
hard billing wall: Firebase Functions require the **Blaze** plan and the API
enablement fails on Spark. Rather than pay, this phase **moves the transport, not
the logic**:

- The trusted order engine was extracted into a single, transport-agnostic module,
  **`functions/lib/orderServiceCore.js`** (no Firebase imports; `db` and
  `serverTimestamp()` are injected).
- `functions/index.js` is now a **thin `onCall` wrapper** over that core (exports
  and behaviour preserved; the callable path still works once Blaze is enabled).
- A new **`server/`** Express app exposes the *same* core over HTTP
  (`POST /api/orders/create`, `POST /api/orders/guest-lookup`, `GET /health`,
  `GET /api/diagnostics`) with CORS allowlisting and Firebase ID-token
  verification.
- The client gateway chooses the transport from **`REACT_APP_API_BASE_URL`**:
  unset → callable (production path); set → the demo HTTP API. No other code
  changes are needed to migrate back.

Security is unchanged: `firestore.rules` still denies client order writes,
identity is taken **only** from the verified token, the raw guest token is stored
as a hash and rotated on retry, and the service-account credential lives only in
environment variables. The API exposes **no** order-mutation endpoints.

---

## B. Architecture — one engine, two transports

```text
                       functions/lib/orderCore.js        (pure pricing/validation)
                                   ▲
                                   │ require
                functions/lib/orderServiceCore.js        (idempotency, guest tokens,
                         ▲                  ▲             identity, persisted schema)
             require     │                  │   require
        functions/index.js            server/index.js
        (v2 onCall wrappers:          (Express on Render;
         createOrder/getGuestOrder)    createOrder/getGuestOrder)
                         ▲                  ▲
                         │                  │
                 firebase callable     fetch + Bearer ID token
                         └──── src/services/orderGateway.js ────┘
                             transport chosen by REACT_APP_API_BASE_URL
```

- **`createOrderService({ db, serverTimestamp })`** returns `{ createOrder,
  getGuestOrder }`. It reads the authoritative `restaurants/{id}` settings and the
  restaurant's catalog **inside the transaction** (so an in-flight price edit
  retries and rebuilds from new values), keeps the
  `checkoutReceipts/{sha1(uid:restaurantId:checkoutId)}` idempotency guard with a
  request fingerprint, and rotates the guest token on legitimate replay.
- The callable host injects `getFirestore()` and `FieldValue.serverTimestamp()`;
  the Express host injects the same via `server/firebaseAdmin.js`.
- **One correction to the extraction:** the core now returns `orderId` and an
  `id`-stamped `order`. The client hydrates with `stored.id || result.orderId`
  (`src/services/orderService.js`), which the previous wrapper dropped.

### HTTP contract (mirrors the callable envelope)

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /health` | none | liveness (Render health check) — no secrets |
| `GET /api/diagnostics` | none | transport/mode/project/feature flags — no secrets |
| `POST /api/orders/create` | `Authorization: Bearer <Firebase ID token>` | trusted order creation |
| `POST /api/orders/guest-lookup` | capability token in body | guest order recovery |

A missing/invalid token returns **401**; the body is passed through verbatim and
the engine ignores its `customerId`/`customerType`/`role`. There is deliberately
no endpoint that can mutate an order.

---

## C. What was built / changed

**Added**
- `functions/lib/orderServiceCore.js` — shared engine (single source of truth).
- `functions/lib/orderServiceCore.test.js` — engine tests over an in-memory
  Firestore double.
- `server/app.js` — Express factory: CORS allowlist, Bearer auth, health/diag,
  generic error handler, 404 fallthrough.
- `server/index.js` — entry point wiring the engine + Admin SDK to the transport.
- `server/firebaseAdmin.js` — Admin init from `FIREBASE_SERVICE_ACCOUNT_JSON`
  (`verifyIdToken(token, true)` = revocation-checked).
- `server/package.json`, `server/.env.example`, `server/README.md`,
  `server/test/app.test.js`.
- `render.yaml` — free-tier Render Blueprint.
- `ORDER-SYSTEM-PHASE2.4-REPORT.md` (this file).

**Changed**
- `functions/index.js` — replaced the inline logic body with thin `onCall`
  wrappers (`exports.createOrder` / `exports.getGuestOrder` unchanged; no
  `onRequest`, no `.region(`, no `setGlobalOptions(`).
- `src/services/orderGateway.js` — dual transport; preserves
  `placeOrderViaGateway` / `getGuestOrderViaGateway` and the `functions/*` error
  mapping. HTTP 401 → "session expired"; 5xx/network → "temporarily unavailable".
- `src/services/orderGateway.test.js` — covers **both** transports (HTTP + callable).
- `src/services/functionDeployment.test.js` — asserts the configurable transport,
  thin callable wrapper, demo-API assets, and no committed service-account secret.
- `package.json` — `test:functions` now includes the core suite; added
  `test:server`.
- `.env.example` — documents `REACT_APP_API_BASE_URL`.
- `.gitignore` — un-ignores `.env.example` files while still ignoring real
  `.env` files (including `server/.env`).
- `README.md` — adds section "2b. Free-tier demo backend (Render)" + test/checklist notes.

---

## D. Security properties (unchanged, now enforced in two hosts)

1. **No client order writes** — `firestore.rules` denies them; both hosts create
   orders through the Admin SDK.
2. **Identity from the token only** — the HTTP handler derives `auth.uid` from
   `verifyIdToken`; spoofed body identity is ignored (tested).
3. **Authoritative pricing** — every money field is recomputed in the engine from
   the live catalog + settings; client prices are discarded (tested).
4. **Idempotency** — transactional receipt + payload fingerprint; a replayed key
   with a different cart is rejected; keys are scoped per user (tested).
5. **Guest capability token** — raw token returned once, only its SHA-256 hash
   persisted, rotated on retry (old token dies) (tested).
6. **CORS** — fixed allowlist, never a wildcard with credentials; disallowed
   origins get 403 with no `Access-Control-Allow-Origin` (tested).
7. **No secret leakage** — `/health` + `/api/diagnostics` are secret-free; errors
   are generic to clients and logged internally; the service-account JSON is only
   ever read from the environment (tested).
8. **No admin surface** — status changes stay on Firestore under the rules;
   `PATCH/PUT/DELETE` on order paths return 404 (tested).

---

## E. Tests added

**`functions/lib/orderServiceCore.test.js` (18 cases)** — unauthenticated reject;
guest order totals + hashed/rotated token; registered customer; identity spoof
ignored; money fields recomputed despite tampered client values; foreign/unknown/
sold-out items rejected; empty cart rejected; idempotent replay; guest token
rotation kills the old token; fingerprint mismatch rejected; per-user key scoping;
guest lookup id/token requirements; hash never leaked on lookup; pure-helper
behaviour; `receiptId` determinism.

**`server/test/app.test.js` (12 cases)** — secret-free health/diagnostics; CORS
allow + reject; 401 on missing/invalid token (engine untouched); identity from
token not body; guest lookup needs no account; no mutation surface; malformed
JSON → generic 400; engine failure → generic 500; `parseAllowedOrigins` fallback.

**`src/services/orderGateway.test.js` (28 cases)** — transport selection; full
callable suite (unchanged behaviour); HTTP suite: URL/headers/Bearer/body, missing
user → no Authorization, guest lookup URL, 401/5xx/network mapping, non-envelope
bodies, generic guest failure.

**`src/services/functionDeployment.test.js` (extended)** — thin callable wrapper
over the core; dual transport in the gateway; `REACT_APP_API_BASE_URL` documented;
demo-API assets + Render blueprint wiring; no committed PEM/secret.

---

## F. Verification actually run

| Gate | Command | Result |
|------|---------|--------|
| Jest (frontend + service + page) | `npx cross-env CI=true react-scripts test --watchAll=false` | ✅ **12 suites passed, 1 skipped; 140 passed, 1 skipped** |
| Shared core + functions + deploy config | `npm run test:functions` | ✅ **41 passed, 1 skipped** (live check opt-in) |
| Demo HTTP API | `npm run test:server` | ✅ **12/12 passed** |
| Rules/index config | `npm run rules:check` | ✅ schema OK + rules invariants OK |
| Production build | `npx cross-env CI=true npm run build` | ✅ compiled successfully |

**Not run / not verifiable from here:** a live deploy to Render and an end-to-end
HTTP checkout. Those require user action (creating the service + setting the
secret) and are **not** claimed to work. The Firestore-backed e2e suite remains
skipped by default and is not reported as passing.

---

## G. Deployment steps (user action)

1. **Create the Render service** — New → Web Service → this repo, or apply
   `render.yaml`. Settings:
   - Root Directory: **repository root** (`.`) — so `../functions/lib` resolves.
   - Build: `npm --prefix server install`
   - Start: `node server/index.js`
   - Health Check: `/health`
   - Plan: **Free**
2. **Set secrets/vars** in the Render dashboard:
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (secret — from Firebase Console → Project
     settings → Service accounts).
   - `CORS_ALLOWED_ORIGINS` = local site + deployed frontend origin(s).
3. **Point the frontend at it** — set `REACT_APP_API_BASE_URL` to the service URL
   in `.env.local` (dev) and the hosting provider's env (prod), then rebuild.
4. To **migrate back** to callables once on Blaze: deploy `functions/`, deploy
   rules, and **unset** `REACT_APP_API_BASE_URL`.

### Post-deploy smoke check
1. `GET https://<service>.onrender.com/health` → `{ "status": "ok" }`.
2. `GET /api/diagnostics` → transport `http-api`, no secrets.
3. Place a guest order in the app; expect a confirmation with totals, and a
   200 from `POST /api/orders/create`.
4. Retry the same checkout → same order id (`reuse: true`), no duplicate.
5. Confirm a tampered client price is ignored in the returned totals.

---

## H. Known limitations

- **Live deploy is unverified in-repo** — a real Render boot needs the secret and
  `npm --prefix server install` (pulls `firebase-admin`, not installed at root).
  The app factory itself is covered by tests with injected doubles.
- **Render free tier cold-starts** (service sleeps when idle), so the first
  request after inactivity is slow; the gateway maps slow/failed calls to a
  retryable message.
- Admin order-status changes still run **client → Firestore** under the rules
  (intentionally unchanged); only order *creation* and guest *lookup* were moved.
- No App Check / rate limiting on the demo API; cash-only (`paymentStatus:
  'pending'`) as before.
- The engine's `sanitize` preserves `undefined` inside arrays (only object keys
  are stripped); harmless for the current callers, noted for completeness.
