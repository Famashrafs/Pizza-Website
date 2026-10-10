# Pizza-Website — Ordering Journey Report (Phase 2)

Date: 2026-10-11 · Branch: `master` (base `ca26845`; Phase 1 changes uncommitted)
Scope: complete and stabilise the whole customer ordering journey
(Menu → Cart → Checkout → Submit → Confirmation → Tracking) on top of the
Phase-1 trusted backend. No redesign, no new product features, no production
deploy. Builds directly on `ORDER-SYSTEM-SECURITY-REPORT.md` (Phase 1).

---

## A. Executive summary

Phase 1 made *order creation* safe but left the *journey around it* fragile. The
Phase-2 audit found five gaps and closed all of them:

1. **Confirmation was not refresh-safe.** The page read the order from router
   state only; a reload (or opening the link later) showed nothing, and it
   falsely claimed a confirmation email had been sent — there is no email
   service.
2. **Guests had no way to track an order.** Tracking was behind `RequireAuth`,
   which deliberately treats anonymous guests as signed-out, so guest orders
   were unreachable after checkout.
3. **There was no secure guest lookup.** Assuming "order id = access" would have
   leaked any order to anyone who guessed an id.
4. **Stale prices / newly unavailable items** were silently submitted; the
   customer saw one total and the server charged another with no notice.
5. **The cart/drawer totals** were computed from a static settings constant,
   disagreeing with the settings-authoritative checkout totals.

Result: guests and registered customers both get a complete, honest journey.
Order creation stays 100% server-authoritative. Guests track via a high-entropy
token (hashed at rest, verified server-side); registered customers track via
ownership + a live subscription. Confirmation survives refreshes and clearly
reports when nothing can be recovered.

All gates pass: `npm run build`, `npm test -- --watchAll=false` (80 passed,
1 skipped), `npm run test:functions` (18/18), `npm run rules:check` (§F).

---

## B. Audit findings (gaps)

| # | Gap | Impact |
|---|-----|--------|
| G1 | `OrderConfirmation` was state-only and printed a fake “confirmation email sent” line | Reload/late visit lost the order; dishonest copy |
| G2 | Guest tracking lived behind `RequireAuth` (guests = signed-out) | Guest orders could never be viewed after checkout |
| G3 | No server-verified guest lookup existed | Naïve “id = access” would leak orders |
| G4 | No revalidation of availability / price before submit | Customer could be charged a different amount than shown |
| G5 | Cart + drawer totals used static `RESTAURANT_SETTINGS` | Cart total ≠ checkout total when an admin edited fees/tax |

---

## C. What was fixed and how

### C1. Secure guest tracking (backend)

- `functions/lib/orderCore.js`: on an **anonymous** order, `buildOrder` now
  generates a 24-byte random `trackingToken`
  (`crypto.randomBytes(24).toString('base64url')`) and persists **only**
  `guestTokenHash = sha256(token)`. The raw token is returned once, never stored.
  Register orders carry no hash. Added timing-safe `verifyGuestToken()`.
- `functions/index.js`: createOrder returns the token at top level; new
  `getGuestOrder` callable takes `{ orderId, token }`, verifies the hash with a
  timing-safe compare, and returns a sanitized order (hash stripped). A wrong or
  missing token — or an order id alone — returns a generic `Order not found`.

### C2. Gateway / service / storage

- `src/services/orderGateway.js`: added `getGuestOrderViaGateway({ orderId, token })`.
- `src/services/__mocks__/orderGateway.js`: mirrors production using the real
  order core; strips the hash on every client shape.
- `src/services/orderService.js`: `createOrder` now forwards `customerType` to
  the callable payload (the function still derives identity from auth and
  ignores it) and surfaces `trackingToken` when present; added
  `getGuestOrder(id, token)`.
- `src/services/storage.js`: added `getLastOrder` / `saveLastOrder` /
  `clearLastOrder` (`last-order` key) for refresh recovery.

### C3. Checkout revalidation

- `src/utils/checkoutLogic.js`: added `diffCartPrices(cartItems, liveItems)`
  (cent-rounded comparison, ignores sub-cent noise) — pure and unit-tested.
- `src/pages/CheckoutPage.js`: recalculates the cart against the live catalog,
  computes `displayItems` / `displayTotals` / `priceChanges`, shows availability
  issues, and saves the last-order reference on success. Removed the now-unused
  static-total memo.

### C4. Confirmation page

- `src/pages/OrderConfirmation.js`: rewritten to be refresh-safe. It recovers the
  order from router state **or** the saved reference:
  - **registered** → `getOrderForUser` + live `subscribeCustomerOrders`;
  - **guest** → `getGuestOrder` (token) with a 15s poll while active.
  Embeds `OrderStatusTracker`, shows cash-due-on-delivery, and shows an honest
  **“No order found”** state when nothing can be authorized. The fake email line
  is gone.

### C5. Cart totals alignment

- `src/context/CartContext.js`: loads the authoritative `restaurants/{id}`
  settings once (`getRestaurantSettings`) and computes drawer/cart totals with
  them (static config only as a loading/failure fallback).
- `src/components/checkout/OrderSummaryPanel.js`: uses the configured currency
  instead of a hard-coded `$`; `ReviewStep.js` renders the price-change banner.

---

## D. The ordering journey now

```text
Menu ──▶ Cart ──▶ Checkout ──▶ createOrder (Cloud Function) ──▶ Confirmation ──▶ Tracking
                                      │
                       server recomputes ALL money from live
                       catalog + restaurants/{id} settings
```

- **Registered customers**: account-backed history (`/orders`, `/orders/:id`),
  live status subscription.
- **Guests**: anonymous auth, guest cart, token-verified confirmation + polled
  tracking. Never granted account pages.
- **Payment**: cash only; always `paymentStatus: 'pending'`.
- **Idempotency**: repeated submits return the original order via the
  `checkoutReceipts` transaction.

---

## E. Files changed / added (Phase 2)

**Added**
- `src/services/orderGateway.js` (guest lookup callable)
- `src/services/__mocks__/orderGateway.js` (real core behind the mock)
- `src/utils/checkoutLogic.test.js`
- `src/services/guestTracking.test.js`
- `src/orderJourney.test.js`

**Changed**
- `functions/lib/orderCore.js`, `functions/index.js` (token + `getGuestOrder`)
- `functions/lib/orderCore.test.js` (guest-token cases)
- `src/services/orderService.js`, `src/services/storage.js`
- `src/pages/CheckoutPage.js`, `src/pages/OrderConfirmation.js`
- `src/context/CartContext.js`
- `src/utils/checkoutLogic.js`
- `src/components/checkout/ReviewStep.js`, `src/components/checkout/OrderSummaryPanel.js`
- `README.md`

---

## F. Verification actually run

| Gate | Command | Result |
|------|---------|--------|
| Production build | `npm run build` | ✅ compiled (main bundle 434 kB gzip, +1.3 kB) |
| Jest (unit + service + app) | `npm test -- --watchAll=false` | ✅ **9 suites, 80 tests passed**; 1 suite skipped (`__e2e`, needs a live backend) |
| Cloud Function order core | `npm run test:functions` | ✅ **18/18 passed** (incl. guest-token issuance/verification) |
| Rules/index config | `npm run rules:check` | ✅ indexes schema OK + rules invariants OK |

Coverage of the 18 required journey checks:

| Area | Where proven |
|------|--------------|
| Menu / categories load, empty, error | `menuFlow`, `App.test` |
| Unavailable product handling | `orderCore` line-item rejection, `checkoutLogic` |
| Cart qty / removal | `menuFlow`, `cartReducer` via `App.test` |
| Pricing / rounding | `checkoutLogic` (settings totals), `orderCore` (recompute) |
| Price change before checkout | `checkoutLogic` (`diffCartPrices`) + `CheckoutPage` |
| Invalid checkout data | `checkoutLogic` (`validateCustomerInfo` / `validateAddress`) |
| Guest order success | `guestTracking`, `orderJourney` |
| Registered order success | `orderJourney`, `orderFlow` |
| Backend rejects tampered prices | `orderCore` (client price ignored) |
| Idempotent retries | `orderFlow`, mock gateway receipt |
| Cart cleared only on success | `CheckoutPage` flow + `App.test` |
| Failed submit preserves cart | `CheckoutPage` catch path |
| Confirmation refresh (guest + registered) | `orderJourney` |
| History authorization | `orderJourney` (guest blocked), `orderFlow` |
| Unauthorized access | `orderJourney`, `adminRouting` |
| Status updates | `orderFlow`, `OrderStatusTracker` |
| Restaurant-specific fees / tax | `orderCore` settings authority, `checkoutLogic` |
| Loading / empty / error states | `menuFlow`, `orderJourney` |

> The Firestore-backed e2e suite remains **skipped by default** and is **not**
> reported as passing.

---

## G. Manual deployment / Console checklist

Order matters — deploy **rules + functions together**.

1. **Firebase Console** → Cloud Functions (Blaze) on **Node 20**, region synced
   with `getFunctions()` (`us-central1`).
2. **Authentication** → enable **Email/Password** **and Anonymous** (guests).
3. **Firestore** → `firebase deploy --only firestore:rules,firestore:indexes`.
4. **Functions** → `firebase deploy --only functions` (deploys `createOrder` +
   `getGuestOrder`). Smoke-test: place an order, confirm the `orders/` doc has
   `guestTokenHash` (guest) and a `checkoutReceipts/` doc.
5. **Settings** → populate `restaurants/{id}` (`taxRate`, `deliveryFee`,
   `freeDeliveryThreshold`, `minOrder`, `deliveryEnabled`, `currency`, …). These
   are the pricing inputs for both checkout and the cart.
6. **Client config** → `.env.local` with real project values; `npm run build`.
7. **Optional e2e** → emulators are not yet wired into `firebase.json`; add a
   `functions` emulator entry to run `REACT_APP_E2E=1 npm test` offline.

---

## H. Remaining issues & next phase

- **Emulator wiring**: `firebase.json` still has no `functions`/`emulators`
  section, so the callables can't be integration-tested offline; the e2e suite
  stays skipped.
- **App Check / abuse control**: the callables require auth but have no rate
  limiting; add App Check + abuse mitigation.
- **Online payment**: still cash-only. A server-side mark-paid path and
  Stripe/PayPal are the natural next milestone (keep payment writes server-side).
- **Confirmation email**: intentionally not claimed; there is no email service
  yet — wire one (or a shareable receipt link) if desired.
- **Guest token lifecycle**: tokens never expire and are not rotated; consider a
  TTL or “resend link” flow for guests who clear storage.
- **Legacy orders** from the pre-Phase-1 client still lack `customerId` and do
  not surface in history; a one-time backfill is advisable.
- **Coupons/reviews**: admin sections and server-side coupon redemption remain
  future work (unchanged from Phase 1).
