# Pizza-Website — Checkout Pricing Readiness Report (Phase 2.2)

Date: 2026-10-12 · Branch: `master` (commit `9a55314`)
Scope: diagnose and fix the production symptom *"We couldn't load live menu
pricing. Checkout is paused so you're never charged from stale totals"* shown on
`/checkout` with **no visible console or network error**. Minimal fix, structured
diagnostics, a corrected state model, regression tests, and verification. No UI
redesign, no production deploy, no destructive operations. Builds on
`ORDER-SYSTEM-PHASE2.1-REPORT.md`.

---

## A. Executive summary

The banner was **not** a Firebase outage. It was a deterministic **authorization
ordering bug** masked by a catch-all `catch`:

- `/checkout` is a **public** route (`src/App.js:174`, not wrapped in
  `RequireAuth`).
- The guest session (`AuthContext.ensureGuestSession`) was created **only inside
  `handlePlaceOrder`**, i.e. after the shopper clicks Place Order.
- On mount, checkout fired `Promise.all([fetchProducts(), getRestaurantSettings()])`.
  `fetchProducts()` reads `products`, which is `allow read: if true` (public) →
  resolves. `getRestaurantSettings()` reads `restaurants/{id}`, which is
  `allow read: if isSignedIn()` → **`permission-denied`** for a signed-out guest.
- Because `Promise.all` rejects on the **first** rejection, the whole load was
  marked failed; the silent `.catch(() => setProductsFailed(true))` then showed
  the misleading "live menu pricing" banner — and the rejected promise meant
  **nothing was logged**, which is exactly why it looked like "no error".

Two independent defects were fixed:

1. **Root cause** — the authenticated settings read ran before any session
   existed for a signed-out guest. Checkout now **obtains the guest session
   before** reading settings.
2. **A masked crash on the fix path** — `orderService.recalculateItems` was
   declared `async` but consumed **synchronously** during render
   (`CheckoutPage` `useMemo`). While pricing was never ready this dead code hid
   the bug; the moment pricing became ready, `recalc.items` would have been a
   `Promise` and checkout would have thrown. Made synchronous.

Alongside the fix, the single `productsFailed` flag was replaced with **separate
`catalogStatus` / `settingsStatus` states**, `Promise.allSettled` + structured
logging, and a strict `hasUsablePricing`/`getPricingReadiness` gate, so a
failure in one load can never be mislabelled as the other and checkout is never
priced from a fallback.

**The Place Order safety guard was not weakened** — it is now driven by an exact,
testable reason instead of one boolean.

---

## B. Root cause — traced end to end

| Step | Where | Behaviour |
|------|-------|-----------|
| Route is public | `src/App.js:174` | `/checkout` renders for signed-out users |
| Catalog read | `menuService.fetchProducts` → `db.getDocs('products')` | `products` rule `allow read: if true` → **succeeds** |
| Settings read | `restaurantService.getRestaurantSettings` → `db.getDoc('restaurants/{id}')` | `restaurants` rule `allow read: if isSignedIn()` → **`permission-denied`** when signed out |
| Combined | `CheckoutPage` `Promise.all([...])` | first rejection fails **both**; the public catalog success is discarded |
| Error swallowed | `.catch(() => setProductsFailed(true))` | no code/message logged, no distinguished cause → misleading banner |
| Session timing | `ensureGuestSession` only in `handlePlaceOrder` | the authenticated read had no session when it ran |

The rules boundary is intentional and correct (Phase 2 hardening: `restaurants`
is authenticated-only so `ownerId`/staff/payment fields never leak). The bug is
**client ordering**, not the rules. Fixing it by opening up `restaurants` reads
would have re-introduced an information leak — so it was **not** done.

### B2. Secondary defect (proven, previously unreachable)

`src/services/orderService.js` exported `recalculateItems` as `async` while
`CheckoutPage` calls it inside a synchronous `useMemo` and reads
`recalc.items` / `recalc.issues` immediately. Both branches of the old
`catalogReady` gate made this benign (the function was never actually awaited),
but the corrected readiness model makes the loaded path reachable — so the
`async` marker had to be removed for the fix to be safe. Confirmed pure (no
`await`/I/O) and only called from `CheckoutPage`, so making it synchronous is a
no-op for every other caller.

---

## C. What was fixed and how

### C1. Session before the authenticated settings read (`src/pages/CheckoutPage.js`)

- The load effect now resolves the **catalog (public)** and the **settings
  (authenticated)** independently.
- Before the settings read, if there is no `currentUser`, checkout awaits
  `ensureGuestSession()` and fails the settings load with a clear
  `checkout/guest-session-failed` code if the session cannot be created.
- `ensureGuestSession` and `currentUser` are read through refs so the effect
  keeps its `[reloadKey]` dependency (no refetch loop, no
  `react-hooks/exhaustive-deps` warning — CI treats warnings as errors).

### C2. Separated state model + structured diagnostics

- `productsLoading` / `productsFailed` → `catalogStatus` (`'loading' | 'ready' |
  'error'`) and `settingsStatus` (`'loading' | 'ready' | 'error'`).
- `Promise.allSettled` replaces `Promise.all`, so one failing read no longer
  discards the other.
- New `reportLoadFailure(scope, error)`:
  - `devLog('[checkout] …')` in development (operation, `code`, `message`);
  - `runtimeWarn('checkout.<scope>-load-failed', …)` **in production** so a
    hard failure is no longer silent — deduplicated and limited to the error
    code. No cart contents, contact details or tokens are ever logged.

### C3. Accurate readiness + sharper messages

- `src/utils/checkoutLogic.js` — `getPricingReadiness({ catalogStatus, products,
  settingsStatus, settings, cartCount })` returns `{ catalogReady, settingsReady,
  pricingReady, reason }`, where `reason` ∈ `catalog-loading | catalog-error |
  catalog-empty | settings-loading | settings-error | settings-invalid`.
- `src/utils/cartPricing.js` — `hasUsablePricing(settings)` is a **strict** shape
  gate (non-negative numeric `taxRate` + `delivery.baseFee` +
  `delivery.freeDeliveryThreshold`). `resolvePricingConfig` stays deliberately
  forgiving so an *estimate* can render; it is never used to declare pricing
  ready.
- An **empty catalog is only usable when the cart is empty** — if the cart has
  items and the catalog is empty, `reason = 'catalog-empty'` and checkout stays
  paused rather than silently pricing from nothing.
- UI banners are now specific: catalog failure ("couldn't load the live menu"),
  settings failure ("couldn't load live pricing settings"), and catalog-empty
  each get their own honest message (styling unchanged). The "Loading current
  menu prices…" status shows while either load is in flight.
- `handlePlaceOrder` still blocks, but reports the exact reason (retryable vs.
  "some items can no longer be priced").

### C4. The masked crash (`src/services/orderService.js`)

- `export async function recalculateItems` → `export function recalculateItems`
  (pure, synchronous).

### C5. Guest banner

- The "Ordering as a guest?" banner condition was `!currentUser`; after the guest
  session is created the user is anonymous-but-signed-in, so it now honours
  `isGuest` too (`(!currentUser || isGuest)`), preserving the guest UX.

---

## D. Files changed (Phase 2.2)

**Added**
- `ORDER-SYSTEM-PHASE2.2-REPORT.md` (this file)

**Changed**
- `src/pages/CheckoutPage.js` — separated statuses, `allSettled`, guest-session-
  before-settings, structured logging, reason-driven banners + guard, guest
  banner fix.
- `src/utils/checkoutLogic.js` — `getPricingReadiness`, `describeLoadFailure`.
- `src/utils/cartPricing.js` — `hasUsablePricing`.
- `src/services/orderService.js` — `recalculateItems` no longer `async`.
- `src/utils/checkoutLogic.test.js`, `src/pages/CheckoutPage.test.js` —
  regression coverage (below).
- `rules-tests/firestore.rules.test.js` — read-boundary proofs.

---

## E. Regression tests added

**Unit — `src/utils/checkoutLogic.test.js`**
1. catalog loading → not ready (`catalog-loading`)
2. catalog failure → not ready (`catalog-error`) — *distinct reason*
3. settings loading → not ready (`settings-loading`)
4. settings failure → not ready (`settings-error`) — *distinct reason*
5. malformed settings → not ready (`settings-invalid`)
6. catalog loaded but **empty with a non-empty cart** → not ready
   (`catalog-empty`)
7. everything ready → `pricingReady` with `reason: null`
8. empty catalog + empty cart → ready (nothing to price)
9. `hasUsablePricing` accepts zero fees and rejects null/partial/bad-typed docs;
   `describeLoadFailure` captures only scope/code/message (no PII)

**React — `src/pages/CheckoutPage.test.js`**
- a signed-out guest **starts the guest session before** the settings read
  (ordering asserted: `['guest', 'settings']`);
- a **settings** failure shows the settings-specific banner and stays paused
  (Place Order disabled);
- a **catalog** failure shows the menu-specific banner (not the settings one)
  and stays paused;
- malformed settings **do not crash** and keep checkout paused;
- an empty live menu with a non-empty cart pauses checkout with the correct
  message.

**Rules — `rules-tests/firestore.rules.test.js`**
- `products` is readable by an **unauthenticated** caller;
- `restaurants/{id}` is **denied** to an unauthenticated caller;
- `restaurants/{id}` is readable by an **anonymous (guest)** session.

These pin the exact boundary the fix depends on, so a future rules change cannot
silently re-break guest checkout.

---

## F. Verification actually run

| Gate | Command | Result |
|------|---------|--------|
| Jest (unit + service + page) | `npm test -- --watchAll=false` | ✅ **10 suites passed, 1 skipped; 112 passed, 1 skipped** |
| Cloud Function order core | `npm run test:functions` | ✅ **21/21 passed** |
| Rules/index config | `npm run rules:check` | ✅ indexes schema OK + rules invariants OK |
| Firestore rules (emulator) | `npm run test:rules:emulator` | ✅ **13/13 passed** |
| Production build | `CI=true; npm run build` | ✅ compiled successfully |

The Firestore-backed e2e suite remains **skipped by default** and is **not**
reported as passing. The reported symptom could not be reproduced against the
live deployed project directly; instead it is demonstrated by the in-repo trace
(section B) and pinned by the emulator rules test (F: unauthenticated
`restaurants` read denied, anonymous allowed).

---

## G. Deployment steps

This fix is **client-only** — no rules, index, or Cloud Function change is
required to resolve the symptom. Deploy the front-end build; rules/function
deploys are listed only for completeness.

1. **Client** → `npm run build`, then `firebase deploy --only hosting`.
2. (No change needed) Rules/functions are unaffected; if you redeploy them for
   any reason, keep `restaurants` read authenticated-only — that boundary is
   what the fix relies on.

### Production verification after deploy
1. Open `/checkout` in a **fresh private window** (no session) with items in the
   cart.
2. The "Loading current menu prices…" status resolves and Place Order becomes
   enabled with an exact total — **no paused banner**.
3. In DevTools → Application → IndexedDB/`firebaseLocalStorage`, confirm an
   anonymous session was created before the `restaurants/{id}` read.
4. Force the settings read to fail (e.g. temporarily block the Firestore
   request) and confirm the **settings-specific** banner appears, Place Order
   stays disabled, and a deduplicated `[app] checkout.settings-load-failed`
   warning is logged.

---

## G2. Known limitations

- **`CartContext` settings read** (`src/context/CartContext.js:56`) also calls
  `getRestaurantSettings()` with a silent static fallback, so it too fails for a
  signed-out guest until a session exists. It is **non-fatal** (the cart falls
  back to `RESTAURANT_SETTINGS`) and its effect has `[]` deps, so it does not
  refetch after the checkout-created guest session. Left unchanged to keep the
  Phase 2.2 fix minimal; flagged as follow-up.
- Checkout waits for the guest session before the settings read, adding one
  anonymous-auth round trip on the first signed-out visit (normally a single
  cached call).
- No App Check / rate limiting on the callables (unchanged from Phase 2).
- Online payment remains out of scope (cash-only; `paymentStatus: 'pending'`).
