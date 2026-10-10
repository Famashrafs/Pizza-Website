# Pizza-Website — Order-System Security & Response Report (Phase 1)

Date: 2026-10-11 · Branch: `master` (base `ca26845`, guest checkout, already pushed)
Scope: harden Firestore rules/tenant isolation, add a trusted server-side order path,
make restaurant settings authoritative, preserve guest + registered checkout, repair
config and the test suite. No production deploy performed.

---

## A. Executive summary

Three systemic problems were found and fixed:

1. **Any signed-in client (including anonymous) could write `orders` directly** with
   arbitrary totals, `customerId`, `restaurantId`, and status history. Anonymous users
   could also self-provision `users/{uid}` with `role: 'restaurant_owner'` and create
   restaurants/categories/coupons.
2. **`products` updates checked only `request.resource.data.restaurantId`**, so an
   owner (or any attacker with the right claim) could overwrite a record by setting a
   new `restaurantId` — cross-tenant transfer/steal. Same pattern on coupons.
3. **Pricing was not authoritative**: the storefront computed totals from a static
   `RESTAURANT_SETTINGS` constant, decoupled from the `restaurants/{id}` document the
   admin dashboard edits. A tampered browser could (and still could, before this
   change) place an order at whatever totals it wanted.

Result: order creation is now a **trusted server-side operation**, prices are
recomputed in a Cloud Function from the live catalog + authoritative restaurant doc,
tenant isolation is enforced in rules *and* resolved against the *existing* document,
anonymous identity is explicitly denied privileged roles, and the idempotency check is
now concurrency-safe inside a Firestore transaction.

All verification passes (`npm run build`, `npm test -- --watchAll=false`,
`npm run test:functions`, `npm run rules:check` — details in §F).

---

## B. Vulnerabilities found during audit

| # | Finding | Impact |
|---|---------|--------|
| B1 | `/orders allow create` was open to any signed-in client | Forged orders: any total, any ownership, any restaurantId; order status/payment fields client-set |
| B2 | `products` update checked only the *new* `restaurantId` | Cross-tenant overwrite/steal of menu items (existing `restaurantId` not compared) |
| B3 | Anonymous could create `users/{uid}` with role restore + create restaurants/categories/coupons | Anonymous self-elevation to `restaurant_owner`, admin dashboard access |
| B4 | `reviews` update/delete did not pin the original author | Editing/removing other customers’ reviews |
| B5 | Idempotency was read-then-create (not atomic) | Double-submit could create duplicate orders under rapid retry |
| B6 | Pricing from static `RESTAURANT_SETTINGS`, ignoring the edited `restaurants/{id}` doc | Admin tax/fee edits did not affect orders; client-controlled totals in flight |
| B7 | `firestore.indexes.json` had invalid top-level keys (`rules`/`indexes` at root) | Rules/index deployment would fail or misbehave |
| B8 | `adminRouting.test.js` mock lacked `signInAnonymously`; tests asserted stale routes and text that no longer match the app | Test suite failing at baseline |

---

## C. What was fixed and how

### C1. Firestore rules (`firestore.rules`)
- `isAnonymous()` implemented via `sign_in_provider == 'anonymous'` and required to be
  **false** for every privileged path: `users` read/create/update/delete,
  `restaurants` create/claim, categories/coupons writes, and staff order-status writes.
- `orders`:
  - `allow create: if false` → the only creator is the `createOrder` Cloud Function
    (Admin SDK, bypasses rules). Client, including the logged-in owner, can never
    fabricate an order.
  - reads: customer reads only own orders (`request.auth.uid == resource.data.customerId`);
    owners read only own restaurant's orders (`resource.data.restaurantId == <owned id>`).
  - customer cancellation unchanged: `orderStatus` restricted to `placed|confirmed`,
    author must be `request.auth.uid == resource.data.customerId` (guests may cancel).
  - staff transitions require `canManageRestaurant()` and `!isAnonymous()`.
- `products` / `categories` / `coupons`: create/update/delete require
  `canManageRestaurant()` and the **existing-document** ownership check
  (`request.resource.data.restaurantId == resource.data.restaurantId` on update), so
  records cannot be re-homed to another restaurant (B2 fixed). Deleted documents are
  not allowed to introduce a new `restaurantId` afterwards.
- `reviews`: create/update/delete require `request.auth.uid == request.resource.data.authorId`
  and `!isAnonymous()` (B4 fixed).
- `restaurants`: create/claim require registered auth; staff/payment fields cannot be
  set to circumvent the function.
- Default-deny catch-all retained for every path.

### C2. Indexes (`firestore.indexes.json`)
- Removed invalid top-level entries; file now contains only `indexes` + `fieldOverrides`
  with the valid products composite index (`restaurantId ASC`, `sortOrder ASC`) and the
  rules that tenant-scoped reads depend on. `node scripts/validate-firestore-config.js`
  passes (B7 fixed).

### C3. Trusted order path (Cloud Function)
- New `functions/` project (`firebase-admin`, `firebase-functions` v5, Node 20).
- `createOrder` (Callable): recomputes **every** price server-side from live catalog +
  authoritative `restaurants/{id}` settings; ignores client money; validates items,
  customer, delivery, payment method; sets `customerId`/`customerType` from the
  **verified** Firebase auth (anonymous → `guest`); cash orders are always
  `paymentStatus: 'pending'`, never `paid`.
- Idempotency: `checkoutReceipts/{sha1(uid:restaurantId:checkoutId)}` written inside the
  same Firestore transaction as the order, so a repeated submit under the same key
  returns the original order — atomic, no duplicates (B5 fixed).
- Pure `lib/orderCore.js` + `orderCore.test.js` (16 node:test cases) keep the money
  logic hostable/verifiable without a backend.

### C4. Client
- `src/services/orderGateway.js` wraps the callable; `orderService.createOrder` delegates
  the whole request and no longer computes totals or writes orders (B1/B6 fixed).
- `cartPricing.calculateTotals` now derives delivery fee / free-delivery threshold / tax
  rate from a `settings` override; `restaurantService.getRestaurantSettings()` reads the
  authoritative `restaurants/{id}` doc (falling back to static constants only for
  fields the doc does not carry); `CheckoutPage` fetches those settings so the review
  totals match what the function charges (B6 fixed).
- Guest checkout (`ensureGuestSession`, anonymous cart/idempotency keys, no
  `users/{uid}` profile) is preserved; guests reach the callable exactly like
  registered customers.

---

## D. Order lifecycle now

```
checkout form
  → createOrder(orderService)         (never computes money)
    → orderGateway.placeOrderViaGateway(request)
      → httpsCallable('createOrder')  (verified auth: anonymous or registered)
        → orderCore: recompute catalog prices + settings + promos/validation
        → transaction: write orders/<id> AND checkoutReceipts/<sha1>
      ← { success, orderId, order, reuse }
  → hydrate + normalize (returns UI shape)
firestore.rules: client orders create = false  (function only)
```

---

## E. Files changed / added

Modified
- `firestore.rules` — hardened (C1); `firestore.indexes.json` — repaired (C2)
- `package.json` — `rules:check` / `test:rules` / `test:functions` scripts;
  `jest.testMatch` restricted to `<rootDir>/src/**/*.test.js`
- `src/services/orderService.js` — `createOrder` delegates to the gateway; dead
  client-side total/validation code removed
- `src/services/restaurantService.js` — added `getRestaurantSettings`
- `src/utils/cartPricing.js`, `src/utils/checkoutLogic.js` — settings override for totals
- `src/pages/CheckoutPage.js` — loads authoritative settings for the estimate
- `src/adminRouting.test.js` — added `signInAnonymously` to the auth mock; expectations
  updated to real routing (`/admin` signed-out → `/admin/login`; admin signup heading;
  owner uses `/admin/login` form, customer uses `/login/customer`)
- `src/services/__diagnostic.test.js` — now diagnoses the *request payload* to the
  callable (client writes zero Firestore order docs)
- `src/services/__e2e.test.js` — gated behind `REACT_APP_E2E` (needs emulators)
- `src/services/orderFlow.test.js` — routes creation through the real function core via
  the gateway mock; timestamp contract updated

Added
- `functions/` — `index.js`, `lib/orderCore.js`, `lib/restaurantDefaults.js`,
  `lib/orderCore.test.js`, `package.json`, `.gitignore`
- `src/services/orderGateway.js` — callable wrapper
- `src/services/__mocks__/orderGateway.js` — test double that runs the REAL
  `functions/lib/orderCore.js` + receipt flow against the in-memory db mock
- `scripts/validate-firestore-config.js` — index schema + rules sanity validator

Not deployed; `.firebaserc` (project `resturent-system`) unchanged.

---

## F. Verification actually run

| Gate | Command | Result |
|------|---------|--------|
| Production build | `npm run build` | ✅ compiled (main bundle 433 kB gzip) |
| Jest (storefront services + routing) | `npm test -- --watchAll=false` | ✅ **6 suites, 62 tests passed**; 1 suite skipped (`__e2e`, needs emulators, §G) |
| Cloud Function money core | `npm run test:functions` | ✅ **16/16 passed** (recompute, settings authority, min-order, delivery disabled, auth-derived customer type, pending-only cash, promo, schema, sync) |
| Rules/index config | `npm run rules:check` | ✅ indexes schema OK + rules invariants OK |

Test suite detail: `App` · `adminService` · `menuFlow` · `orderFlow` (22) ·
`adminRouting` (16) · `__diagnostic` — all pass; `__e2e` intentionally skipped by default.

---

## G. Manual deployment / Firebase Console checklist

Order matters — deploy **rules + function together** (rules deny client order writes, so
orders are unavailable until the function is live).

1. **Firebase Console** → enable **Cloud Functions** (Blaze billing required) with
   **Node 20**. Keep region in sync with `getFunctions()` default (`us-central1`).
2. **Authentication** → enable **Email/Password** and **Anonymous** providers.
3. **Firestore** → deploy `firestore.rules` + `firestore.indexes.json`
   (`firebase deploy --only firestore:rules,firestore:indexes`). Confirm the
   composite products index builds and the tenant-scoped query indexes resolve.
4. **Functions** → `firebase deploy --only functions`. The `createOrder` callable runs
   with Admin SDK (bypasses rules) — verify with a smoke order and then check the
   `orders/` doc + `checkoutReceipts/` doc in the Console.
5. **Settings** → in the Console (or via AdminSettings on next deploy), populate the
   `restaurants/<id>` doc with `taxRate`, `deliveryFee`, `freeDeliveryThreshold`,
   `minOrder`, `deliveryEnabled`, `currency`, `name`, `openingHours`. These are now the
   pricing inputs; the static fallbacks in `lib/restaurantDefaults.js` / client only apply
   while a field is missing.
6. **Client config** → copy `.env.example` → `.env.local` with the real project values
   (do not commit secrets), then `npm run build` / deploy hosting.
7. **E2E diagnostic** (optional) → start emulators and run with Emulators:
   `firebase emulators:start --import` using `firebase.emulator.json` (Firestore 8401,
   Auth 9101) plus the functions emulator; then `REACT_APP_E2E=1 npm test`. Note
   `firebase.json` does **not yet include** an `emulators`/`functions` section — add one
   if you want `--only functions` emulation wired in.

---

## H. Remaining issues & recommended next phase

- **App Check / abuse control**: the callable requires auth but has no rate limiting or
  App Check. Add App Check + abuse mitigation against free-account spam.
- **Coupons & reviews take no enforcement effect yet**: rules are hardened and reviews
  pin authorship, but the admin Coupons/Reviews sections are still "coming soon", the
  promo table is read from static constants server-side, and there is no server-side
  coupon validation. Next phase: coupons collection + function-side redemption.
- **Payment**: cash-only, always `pending`. A mark-paid path for admins and card payment
  (Stripe/PayPal) is the natural next milestone; keep payment-status writes on the
  server (rules already forbid client payment writes).
- **Legacy orders**: orders written by the old client path lack canonical schema /
  `customerId`; they remain readable by the restaurant owner but won't surface under a
  customer's history. Consider a one-time backfill.
- **Emulator wiring**: fold Firestore/Auth/Functions emulators into `firebase.json` so
  the e2e diagnostic can run in CI without a live backend.
- **Settings UX**: AdminSettings currently writes fields the function reads; confirm the
  UI surfaces tax/fee/threshold/min-order as the authoritative inputs and warns when the
  doc is missing them.

Recommended next phase: **payment integration + server-side coupons/App Check**, then a
cleanup pass that deletes the temporary diagnostics (`__diagnostic.test.js`,
`__e2e.test.js`) once the emulator suite is real.