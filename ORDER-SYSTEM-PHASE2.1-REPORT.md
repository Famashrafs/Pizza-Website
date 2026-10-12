# Pizza-Website — Ordering Hardening Report (Phase 2.1)

Date: 2026-10-12 · Branch: `master` (Phase 2.1 changes uncommitted)
Scope: close the correctness/security gaps found after Phase 2 — a checkout
render crash under missing settings, guest order recovery after a lost response,
review ownership rules, and server pricing read inside the order transaction. No
redesign, no new product features, no production deploy. Builds directly on
`ORDER-SYSTEM-PHASE2-REPORT.md`.

---

## A. Executive summary

Phase 2 completed the journey; a follow-up audit found four defects that could
either crash checkout or trust stale/ambiguous data:

1. **Checkout crashed when pricing settings were unavailable.** `settings`
   starts as `null` while the live `restaurants/{id}` document loads, and a
   destructuring default only replaces `undefined` — not `null` — so the first
   render dereferenced `null.delivery` and threw
   `Cannot read properties of null (reading 'delivery')`.
2. **A guest could be locked out of their order after a lost response.** The
   tracking token was issued once; a retry returned the original order but the
   shopper never received the (already-revealed) plaintext token again.
3. **Review rules conflated create/update/delete**, allowing a review to be
   created/updated with arbitrary/foreign fields or the author key to be moved.
4. **Server pricing was read outside the order transaction**, so an owner price
   edit racing a checkout could commit an order built from pre-transaction
   values. A replayed idempotency key carrying a completely different cart also
   silently resolved to the original order.

Result: checkout renders safely with estimated totals and blocks submission
until authoritative pricing is loaded; guest retries rotate and re-reveal the
token exactly once; reviews are schema- and ownership-pinned per operation; and
the order — and every price — is computed from data read inside the Firestore
transaction, with a request fingerprint guarding idempotent reuse.

All gates pass: `npm run build`, `npm test -- --watchAll=false` (**95 passed,
1 skipped**), `npm run test:functions` (**21/21**), `npm run rules:check`, and
the new emulator rules suite `npm run test:rules:emulator` (**10/10**).

---

## B. Root causes / findings

| # | Finding | Impact |
|---|---------|--------|
| F1 | `calculateTotals` used `settings = RESTAURANT_SETTINGS` as a default, but `settings: null` is passed while loading; defaults don't apply to `null` | Checkout page threw on first render when settings were not yet loaded |
| F2 | Guest token returned only on the original create; a retry after a lost response did not re-reveal it | Guest could not recover tracking for an order that was actually created |
| F3 | `reviews` `allow create, update, delete` shared one condition and did not validate fields | Arbitrary fields accepted; author key mutable; `request.resource` mis-used |
| F4 | `createOrder` read `restaurants`/`products` **before** `runTransaction`, and reused a receipt without checking the payload | Orders could be priced from stale reads on a race; a reused key with a different cart could resolve to the wrong order |

---

## C. What was fixed and how

### C1. Null-safe pricing (crash fix)

- `src/utils/cartPricing.js`: added `numOr()` and `resolvePricingConfig()`. A
  `null`/`undefined`/partial settings document is treated as "not loaded yet"
  and every absent field falls back to the documented static config
  (`RESTAURANT_SETTINGS`), mirroring the server's `normalizeSettings()`, so the
  on-screen estimate can never crash or silently read as free. Explicit per-call
  `deliveryFee` / `freeDeliveryThreshold` / `taxRate` overrides still win.
- `src/pages/CheckoutPage.js`: `pricingReady = catalogReady && Boolean(settings)`
  gates `handlePlaceOrder` (which also reports a friendly "still confirming
  prices" error), and `displayTotals` is computed from the resolved config.
- `src/components/checkout/OrderSummaryPanel.js`: defensive `totals` defaults
  (`Number(...).toFixed(2)`) so a partial totals object renders as `$0.00`.
- `src/components/checkout/ReviewStep.js`: new `pricingReady` prop disables the
  submit button ("Confirming prices…" until ready) and shows an honest
  "Estimated total" note.
- `src/utils/checkoutLogic.test.js`: regression coverage for
  null/undefined/loading/failed/pickup/delivery/fee/threshold/tax/rounding/empty
  cart.

### C2. Guest order recovery (lost-response retry)

- `functions/index.js`: when a receipt resolves to an existing guest order, a
  legitimate retry (same fingerprint) **rotates** the tracking token inside the
  transaction: a fresh `generateGuestToken()` is returned exactly once and only
  its `sha256` is stored, so the previous token stops working. Because rotation
  happens under the transaction lock, concurrent retries serialize and cannot
  leave two live tokens behind.
- `functions/lib/orderCore.js`: extracted `stableStringify()` (recursively sorted
  keys) and `buildRequestSignature()` — a SHA-256 fingerprint of the logical
  checkout (restaurant, cart lines/config, contact, address, fulfillment,
  payment, notes, promo). Volatile identity/key fields are excluded.
- `functions/index.js`: the fingerprint is stored as `requestHash` on the
  receipt; a replay whose fingerprint differs is rejected
  ("This checkout could not be verified").

### C3. Review rules — split by operation

- `firestore.rules`:
  - new `isValidReview(data)` schema check (rating 1–5 int, optional bounded
    `comment` string, optional non-empty `restaurantId`).
  - `create`: registered non-anonymous caller, `customerId` typed and equal to
    the caller, schema valid.
  - `update`: ownership pinned to the **existing** doc **and** the proposed doc,
    `customerId` may not change (`diff().affectedKeys()`), schema valid.
  - `delete`: ownership read from the existing document only — and because a
    delete has no `request.resource`, it must never reference it (this was the
    latent bug the split fixes).
- `scripts/validate-firestore-config.js`: extended static validation
  (brace-balance + security invariants) so `npm run rules:check` catches
  regressions without the emulator.

### C4. Transactional, tenant-scoped server pricing

- `functions/index.js`: `restaurants/{id}` and the restaurant's `products` are
  now read **inside** `db.runTransaction`, before any write. A concurrent owner
  edit to price/tax/fee/availability makes the transaction retry and rebuild
  from the new values. The receipt read also verifies the stored
  `uid`/`restaurantId` before reuse.
- `functions/lib/orderCore.js`: `buildOrder` filters products to the requested
  `restaurantId` (defense-in-depth tenant scoping) so a line can never be priced
  from another restaurant's product.

### C5. Test doubles and tests

- `src/services/__mocks__/orderGateway.js`: rewritten to run the **real** order
  core through the in-memory Firestore mock, mirroring the production receipt /
  fingerprint / token-rotation flow and rejecting cross-requester reuse.
- `src/services/guestTracking.test.js`: added concurrent-retry (single order),
  cross-requester receipt reuse (rejected), and registered-retry (no guest
  token, no rotation, single order) cases.
- `src/pages/CheckoutPage.test.js` (**new**): React-level regression tests —
  renders without crashing when settings are `null`; Place Order disabled and
  `createOrder` not called while pricing is unavailable; enabled with the
  server-aligned total (`$27.00`) once settings load.
- `rules-tests/firestore.rules.test.js` (**new**): emulator rules suite covering
  review create/update/delete, schema violations, anonymous denial and
  ownership, run via `@firebase/rules-unit-testing`.

---

## D. Files changed / added (Phase 2.1)

**Added**
- `src/pages/CheckoutPage.test.js`
- `rules-tests/firestore.rules.test.js`
- `ORDER-SYSTEM-PHASE2.1-REPORT.md` (this file)

**Changed**
- `functions/index.js` (in-transaction reads, fingerprint, token rotation)
- `functions/lib/orderCore.js` (`stableStringify`, `buildRequestSignature`,
  tenant-scoped repricing), `functions/lib/orderCore.test.js`
- `firestore.rules` (`isValidReview`, split create/update/delete)
- `src/utils/cartPricing.js`, `src/utils/checkoutLogic.test.js`
- `src/pages/CheckoutPage.js`
- `src/components/checkout/OrderSummaryPanel.js`, `ReviewStep.js`
- `src/services/__mocks__/orderGateway.js`, `src/services/guestTracking.test.js`
- `scripts/validate-firestore-config.js`
- `package.json`, `package-lock.json` (`test:rules:emulator` script,
  `@firebase/rules-unit-testing` devDependency)

---

## E. Verification actually run

| Gate | Command | Result |
|------|---------|--------|
| Production build | `npm run build` | ✅ compiled successfully |
| Jest (unit + service + page) | `npm test -- --watchAll=false` | ✅ **10 suites passed, 1 skipped; 95 passed, 1 skipped** |
| Cloud Function order core | `npm run test:functions` | ✅ **21/21 passed** |
| Rules/index config | `npm run rules:check` | ✅ indexes schema OK + rules invariants OK |
| Firestore rules (emulator) | `npm run test:rules:emulator` | ✅ **10/10 passed** |

The Firestore-backed e2e suite remains **skipped by default** and is **not**
reported as passing.

---

## F. Known limitations

- **Query phantom reads (Firestore transactions):** Firestore transactions
  serialize document reads/writes but are not fully serializable for _queries_.
  Each product is read by document id inside the transaction, so a price edit to
  an existing product is conflict-detected; a product **added** to the query
  mid-transaction is not. This matches the prior contract and is acceptable for
  menu edits.
- **Estimate vs. authoritative total:** until `restaurants/{id}` loads, the
  checkout shows an estimate and blocks submission. The final amount is always
  the server's.
- **Guest tokens never expire** (rotation only on legitimate replay); a TTL /
  "resend link" flow is future work.
- No App Check / rate limiting on the callables (unchanged from Phase 2).
- Online payment remains out of scope (cash-only; `paymentStatus: 'pending'`).

---

## G. Manual deployment checklist

Deploy **rules and functions together** so the client contract and the rules
schema land atomically.

1. **Firestore** → `firebase deploy --only firestore:rules,firestore:indexes`.
2. **Functions** → `firebase deploy --only functions` (`createOrder` +
   `getGuestOrder`). Smoke-test: place an order, retry it, and confirm
   `checkoutReceipts/` carries `requestHash` and that the retry returns a fresh
   `trackingToken` (guest) while the previous token stops working.
3. Confirm `restaurants/{id}` is populated (`taxRate`, `deliveryFee` /
   `delivery.baseFee`, `freeDeliveryThreshold`, `deliveryEnabled`, `currency`) —
   the pricing inputs for both checkout and the cart.
4. **Optional CI** → run `npm run test:rules:emulator` (needs Java + the
   Firestore emulator) alongside `rules:check`.

### Windows note

The Firestore emulator jar can linger after `emulators:exec` finishes; the
runner prints `Script exited successfully (code 0)` and the tests pass, but the
terminal may block on shutdown (SIGKILL of the emulator). Ctrl-C to return.
