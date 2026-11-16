# Cloudflare Worker deployment

The Worker is the backend-only HTTP transport for the shared order engine. The
React storefront remains on Vercel. This file is the canonical Worker
configuration reference; `wrangler.toml`,
`deployment.config.json`, and `.dev.vars.example` must agree with it.

## Current production endpoints

| Purpose | Value |
| --- | --- |
| Worker | `https://pizza-demo-api.famashraf9.workers.dev` |
| Vercel project | `restro` |
| Stable production frontend origin | `https://pizza-website-sv2j.vercel.app` |
| Worker API version in this repository | `2.6.0` |

The Vercel project and the Worker are separate deployments. Do not deploy the
React build to the Worker and do not infer the frontend origin from a
Vercel deployment-specific hostname.

## Exact CORS allowlist

The required `CORS_ALLOWED_ORIGINS` value is:

```text
http://localhost:3000,http://127.0.0.1:3000,https://pizza-website-sv2j.vercel.app
```

- `http://localhost:3000` and `http://127.0.0.1:3000` are the local React
  development origins.
- `https://pizza-website-sv2j.vercel.app` is the stable production alias for
  the Vercel `restro` project.
- No preview origin is currently supported. Vercel preview/deployment hosts
  must be added one at a time only when that exact host is explicitly
  approved. Never use `*`, a suffix match, or a Vercel deployment URL as a
  substitute for the stable production alias.

The tests in `test/configuration.test.js` fail if the production alias is
missing or replaced, if local origins are removed, if a wildcard is added, or
if an old/deployment-specific hostname is allowlisted.

## Required configuration

Every runtime binding is listed here and in `.dev.vars.example`.

| Variable | Classification | Production purpose |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | non-secret | Firebase project used for token audience/issuer checks |
| `FIREBASE_WEB_API_KEY` | public Firebase config | Identity Toolkit revocation/user-existence lookup |
| `DEMO_MODE` | non-secret | deployment-mode label reported by diagnostics |
| `CORS_ALLOWED_ORIGINS` | non-secret | exact browser-origin allowlist |
| `SUPABASE_URL` | external service URL | Supabase project used by server-side image storage |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | secret | Firestore service-account credential, one-line JSON |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | server-only Supabase Storage credential |

`FIRESTORE_EMULATOR_HOST` is optional and local-only. It points the Firestore
adapter at the local emulator for `npm run test:worker:emulator` and must not
be set on the production Worker.

### Local development

```bash
cp worker/.dev.vars.example worker/.dev.vars
# Replace every placeholder in worker/.dev.vars.
npm --prefix worker run dev
```

`worker/.dev.vars` is git-ignored. Never put a real credential in
`.dev.vars.example`, in `wrangler.toml`, in frontend `REACT_APP_*` variables,
or in source control.

### Production bindings

The four non-secret values that belong in `wrangler.toml [vars]` are already
present. Set the external URL and both credentials in Cloudflare without
putting their values in this repository:

```bash
cd worker
npx wrangler secret put SUPABASE_URL
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_URL` is not a credential, but it is stored as a Worker binding so
that local, preview, and production configuration have the same variable name.
Paste only the project URL for that command. Paste the full Firebase
service-account JSON on one line for `FIREBASE_SERVICE_ACCOUNT_JSON`.

## Deployment and verification

Do not run `wrangler deploy` from the repository root. The supported command
pins the Worker config and disables Wrangler autoconfiguration:

```bash
# Safe preflight; does not upload.
npm run deploy:worker:dry-run

# Actual deployment (run only after the configuration review is approved).
npm run deploy:worker
```

After an approved deployment, compare the live version with the repository:

```bash
curl https://pizza-demo-api.famashraf9.workers.dev/health
curl https://pizza-demo-api.famashraf9.workers.dev/api/diagnostics
```

Both endpoints must report `apiVersion: "2.6.0"`. The diagnostics response
must also include the Supabase dependency state. A live deployment that
reports an older version is stale and must not be treated as the repository
build.

Verify CORS without creating an order or modifying data:

```bash
curl -i -X OPTIONS https://pizza-demo-api.famashraf9.workers.dev/api/orders/create \
  -H "Origin: https://pizza-website-sv2j.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

The response must be `204` with
`Access-Control-Allow-Origin: https://pizza-website-sv2j.vercel.app`. Do not
use a wildcard or broaden the allowlist to compensate for a stale deployment.
