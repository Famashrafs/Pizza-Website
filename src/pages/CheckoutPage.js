import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import CheckoutStepper from '../components/checkout/CheckoutStepper';
import CustomerInfoStep from '../components/checkout/CustomerInfoStep';
import FulfillmentStep from '../components/checkout/FulfillmentStep';
import PaymentStep from '../components/checkout/PaymentStep';
import ReviewStep from '../components/checkout/ReviewStep';
import OrderSummaryPanel from '../components/checkout/OrderSummaryPanel';
import { fetchProducts } from '../services/menuService';
import { getRestaurantSettings } from '../services/restaurantService';
import { createOrder, recalculateItems } from '../services/orderService';
import {
  getSavedAddresses,
  saveSavedAddresses,
  saveLastOrder,
} from '../services/storage';
import {
  CHECKOUT_STEPS,
  createEmptyAddress,
  createEmptyCustomer,
  describeLoadFailure,
  diffCartPrices,
  formatAddress,
  getCheckoutTotals,
  getPricingReadiness,
  validateAddress,
  validateCustomerInfo,
} from '../utils/checkoutLogic';
import { devLog, runtimeWarn } from '../utils/devLog';

// One structured place to report a pricing-load failure. The detailed reason
// (operation + code + message) is logged only in development; production gets a
// de-duplicated, code-only breadcrumb so an unreachable/denied Firestore is
// never silent again. No cart contents, contact details or tokens are logged.
function reportLoadFailure(scope, error) {
  const { code, message } = describeLoadFailure(scope, error);
  devLog(`[checkout] ${scope} load failed`, {
    operation: scope,
    code,
    message,
  });
  runtimeWarn(
    `checkout.${scope}-load-failed`,
    `Could not load checkout ${scope}:`,
    code || 'unknown error'
  );
}

function CheckoutPage() {
  const { t } = useTranslation();
  const { currentUser, userProfile, isGuest, ensureGuestSession } = useAuth();
  const { items, promoCode, count, clearCart } = useCart();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState('details');
  const [maxStepIndex, setMaxStepIndex] = useState(0);
  const [customer, setCustomer] = useState(() =>
    createEmptyCustomer(currentUser, userProfile)
  );
  const [fulfillmentType, setFulfillmentType] = useState('delivery');
  const [address, setAddress] = useState(() => createEmptyAddress());
  const [saveAddress, setSaveAddress] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [products, setProducts] = useState([]);
  // Catalog and settings are tracked SEPARATELY ('loading' | 'ready' | 'error')
  // so a failure in one is never mislabelled as the other, and neither is ever
  // considered ready from a fallback.
  const [catalogStatus, setCatalogStatus] = useState('loading');
  const [settingsStatus, setSettingsStatus] = useState('loading');
  const [settings, setSettings] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const submitLock = useRef(false);
  const checkoutKeyRef = useRef(null);

  // Kept in refs so the load effect can read the current auth helpers/identity
  // without re-running (and re-fetching) on every render, and without tripping
  // the exhaustive-deps lint (a stable context function identity is not
  // guaranteed).
  const currentUserRef = useRef(currentUser);
  const ensureGuestRef = useRef(ensureGuestSession);
  useEffect(() => {
    currentUserRef.current = currentUser;
    ensureGuestRef.current = ensureGuestSession;
  });

  // Per-user, per-checkout idempotency key. Kept in localStorage so a refresh
  // mid-submit reuses the same key: repeated/duplicate submissions (double
  // click, refresh, retry after an error) resolve to the original order on the
  // service side instead of creating multiple orders.
  //
  // Guests get a stable key of their own (`co-guest-…` under `checkout.id.guest`)
  // so a guest double-click/retry is idempotent too, and a guest's key can never
  // collide with a signed-in customer's key.
  const getCheckoutKey = () => {
    if (checkoutKeyRef.current) return checkoutKeyRef.current;
    const accountUid =
      currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
    const stKey = accountUid ? `checkout.id.${accountUid}` : 'checkout.id.guest';
    let key = localStorage.getItem(stKey);
    if (!key) {
      key = accountUid
        ? `co-${accountUid}-${Date.now().toString(36)}`
        : `co-guest-${Date.now().toString(36)}`;
      localStorage.setItem(stKey, key);
    }
    checkoutKeyRef.current = key;
    return key;
  };

  const clearCheckoutKey = () => {
    const accountUid =
      currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
    localStorage.removeItem(
      accountUid ? `checkout.id.${accountUid}` : 'checkout.id.guest'
    );
    checkoutKeyRef.current = null;
  };

  // Prefill customer + address for the signed-in user (and after a late login).
  // Guests are left blank so they simply type their contact details below.
  useEffect(() => {
    if (!currentUser || isGuest) return;
    setCustomer((prev) => ({
      fullName: prev.fullName || currentUser.displayName || '',
      email: prev.email || currentUser.email || '',
      phone: prev.phone || userProfile?.phone || '',
    }));
    setAddress((prev) => {
      const next = { ...prev, phone: prev.phone || userProfile?.phone || '' };
      if (prev.street || prev.city) return next;
      const saved = getSavedAddresses(currentUser.uid);
      const preferred = saved.find((entry) => entry.isDefault) || saved[0];
      if (preferred?.fields) {
        return { ...next, ...preferred.fields };
      }
      if (preferred?.address) {
        return { ...next, street: preferred.address };
      }
      if (userProfile?.address) {
        return { ...next, street: userProfile.address };
      }
      return next;
    });
  }, [currentUser, userProfile, isGuest]);

  // Load the catalog and the AUTHORITATIVE restaurant settings (tax, delivery
  // fee, free-delivery threshold) so the review totals match what the trusted
  // order function will actually charge. Products are used to flag items that
  // are no longer orderable.
  //
  // The two loads are INDEPENDENT: the public catalog read never depends on the
  // settings read, and each tracks its own loading/ready/error state. The
  // settings document is an authenticated read (`restaurants` requires
  // `isSignedIn()`), so a signed-out guest must first obtain the anonymous
  // session the rest of checkout already relies on — otherwise that read is
  // denied and pricing can never become ready.
  useEffect(() => {
    let active = true;
    setCatalogStatus('loading');
    setSettingsStatus('loading');

    const settingsPromise = (async () => {
      if (!currentUserRef.current) {
        const guest = await ensureGuestRef.current();
        if (!guest?.success) {
          const err = new Error(
            'Could not start a guest session to load pricing settings.'
          );
          err.code = 'checkout/guest-session-failed';
          throw err;
        }
      }
      return getRestaurantSettings();
    })();

    Promise.allSettled([fetchProducts(), settingsPromise]).then(
      ([catalog, settingsResult]) => {
        if (!active) return;

        if (
          catalog.status === 'fulfilled' &&
          Array.isArray(catalog.value)
        ) {
          setProducts(catalog.value);
          setCatalogStatus('ready');
        } else {
          reportLoadFailure('catalog', catalog.reason);
          setProducts([]);
          setCatalogStatus('error');
        }

        if (settingsResult.status === 'fulfilled') {
          setSettings(settingsResult.value);
          setSettingsStatus('ready');
        } else {
          reportLoadFailure('settings', settingsResult.reason);
          setSettings(null);
          setSettingsStatus('error');
        }
      }
    );

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const currentIndex = CHECKOUT_STEPS.findIndex((entry) => entry.id === step);

  // Revalidate the cart against the LIVE catalog (the same rebuild the trusted
  // order function performs server-side). `catalogLoaded` gates the rebuild:
  // only a successfully loaded catalog is used to flag vanished/unavailable
  // lines, never a failed or partial one.
  const catalogLoaded = catalogStatus === 'ready';

  // The review totals are only trustworthy once the live restaurant settings
  // (tax, delivery fee, free-delivery threshold) have loaded AND both loads
  // succeeded. Until then — and if either load failed — the displayed amount is
  // an estimate and Place Order stays disabled, so an order is never submitted
  // against stale or missing pricing data. `readiness.reason` names the exact
  // blocker for accurate messaging.
  const readiness = getPricingReadiness({
    catalogStatus,
    products,
    settingsStatus,
    settings,
    cartCount: items.length,
  });
  const pricingReady = readiness.pricingReady;

  const recalc = useMemo(
    () => (catalogLoaded ? recalculateItems(items, products) : null),
    [catalogLoaded, items, products]
  );

  const availabilityIssues = recalc ? recalc.issues : [];

  // Detects unit-price differences between what the shopper added to the cart
  // and what the menu charges today, so a stale price is never presented as
  // final without a clear notice.
  const priceChanges = useMemo(
    () => (recalc ? diffCartPrices(items, recalc.items) : []),
    [items, recalc]
  );

  // Review (and the sticky summary once the catalog is in) shows live prices:
  // totals recompute from the revalidated lines so the displayed amount matches
  // what the server will charge. The cart itself keeps the shopper's prices
  // until an order is actually placed.
  const displayItems = recalc && recalc.items.length ? recalc.items : items;
  const displayTotals = useMemo(
    () => getCheckoutTotals(displayItems, { promoCode, fulfillmentType, settings }),
    [displayItems, promoCode, fulfillmentType, settings]
  );

  const stepErrors = {
    details: Boolean(errors.customer),
    delivery: Boolean(errors.address),
    payment: Boolean(errors.payment),
    review: Boolean(errors.items || errors.cart),
  };

  const clearFieldError = (group, field) =>
    setErrors((prev) => {
      if (!prev[group]) return prev;
      const { [field]: _removed, ...rest } = prev[group];
      return { ...prev, [group]: rest };
    });

  const handleCustomerChange = (field, value) => {
    setCustomer((prev) => ({ ...prev, [field]: value }));
    clearFieldError('customer', field);
  };

  const handleAddressChange = (field, value) => {
    setAddress((prev) => ({ ...prev, [field]: value }));
    clearFieldError('address', field);
  };

  const translateErrors = (errorMap = {}) => {
    const translated = {};
    Object.keys(errorMap).forEach((key) => {
      const value = errorMap[key];
      if (typeof value === 'string' && value.startsWith('checkout.')) {
        translated[key] = t(value);
      } else {
        translated[key] = value;
      }
    });
    return translated;
  };

  const handleFulfillmentChange = (type) => {
    setFulfillmentType(type);
    setErrors((prev) => ({ ...prev, address: undefined }));
  };

  const advance = () => {
    const next = CHECKOUT_STEPS[currentIndex + 1];
    if (!next) return;
    setStep(next.id);
    setMaxStepIndex((prev) => Math.max(prev, currentIndex + 1));
  };

  const handleContinue = () => {
    if (step === 'details') {
      const customerErrors = validateCustomerInfo(customer);
      if (Object.keys(customerErrors).length) {
        setErrors({ customer: customerErrors });
        return;
      }
      setErrors({});
      advance();
      return;
    }
    if (step === 'delivery') {
      const addressErrors = validateAddress(address, fulfillmentType);
      if (Object.keys(addressErrors).length) {
        setErrors({ address: addressErrors });
        return;
      }
      setErrors({});
      advance();
      return;
    }
    setErrors({});
    advance();
  };

  const handleBack = () => {
    if (currentIndex <= 0) {
      navigate('/cart');
      return;
    }
    setStep(CHECKOUT_STEPS[currentIndex - 1].id);
  };

  const handleStepSelect = (id) => {
    const index = CHECKOUT_STEPS.findIndex((entry) => entry.id === id);
    if (index <= maxStepIndex) setStep(id);
  };

  const persistAddress = () => {
    if (isGuest || !currentUser?.uid) return;
    if (!formatAddress(address)) return;
    const list = getSavedAddresses(currentUser.uid);
    const formatted = formatAddress(address);
    if (list.some((entry) => entry.address === formatted)) return;
    const entry = {
      id: `addr-${Date.now()}`,
      label: 'Checkout',
      address: formatted,
      fields: { ...address },
      isDefault: list.length === 0,
    };
    saveSavedAddresses(currentUser.uid, [...list, entry]);
  };

  const handlePlaceOrder = async () => {
    if (submitLock.current || submitting) return;
    if (!pricingReady) {
      const { reason } = readiness;
      setOrderError(
        reason === 'catalog-error' ||
          reason === 'settings-error' ||
          reason === 'settings-invalid'
          ? t('checkout.pricingErrorCatalog')
          : reason === 'catalog-empty'
          ? t('checkout.pricingErrorItems')
          : t('checkout.pricingErrorLoading')
      );
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setOrderError('');

    try {
      const idempotencyKey = getCheckoutKey();

      // Signed-in customers order under their own Firebase UID. Everyone else
      // gets a silent Firebase anonymous session — that UID becomes the order's
      // customerId so the existing Firestore create rule keeps holding. No
      // profile document is created and no role is assigned (see AuthContext).
      let orderCustomerId;
      let customerType = 'customer';
      if (currentUser && !currentUser.isAnonymous) {
        orderCustomerId = currentUser.uid;
      } else {
        const guestResult = await ensureGuestSession();
        if (!guestResult?.success || !guestResult?.value) {
          console.error(
            '[checkout] Could not create an anonymous guest session:',
            guestResult?.error
          );
          setOrderError(t('checkout.guestSessionError'));
          return;
        }
        orderCustomerId = guestResult.value.uid;
        customerType = 'guest';
      }

      const result = await createOrder({
        customerId: orderCustomerId,
        customerType,
        items,
        customer,
        fulfillmentType,
        address,
        paymentMethod,
        customerNotes: notes,
        promoCode,
        idempotencyKey,
      });

      if (!result.success) {
        setErrors(result.errors || {});
        setOrderError(result.error || t('checkout.placeOrderFailed'));
        if (result.errors?.customer) setStep('details');
        else if (result.errors?.address) setStep('delivery');
        else if (result.errors?.payment) setStep('payment');
        else setStep('review');
        fetchProducts().then(setProducts).catch(() => {});
        return;
      }

      // The idempotency key has done its job — clear it so the NEXT checkout
      // session gets a fresh key and can never hit this order again.
      clearCheckoutKey();

      // Persist a local reference to the placed order so the confirmation page
      // survives a refresh (React Router state is volatile). For guests this is
      // also the ONLY copy of the high-entropy tracking token.
      saveLastOrder({
        orderId: result.order.id,
        ...(result.trackingToken ? { token: result.trackingToken } : {}),
        ...(orderCustomerId ? { uid: orderCustomerId } : {}),
      });

      if (saveAddress && fulfillmentType === 'delivery') {
        persistAddress();
      }
      setPlaced(true);
      clearCart();
      showToast(t('checkout.toastOrderConfirmed'));
      navigate('/order-confirmation', { state: { order: result.order } });
    } catch (err) {
      console.error('[checkout] Failed to place order:', {
        code: err?.code,
        message: err?.message,
        error: err,
      });

      // Keep the cart so the customer can retry.
      setOrderError(t('checkout.placeOrderUnexpected'));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  if (items.length === 0 && !placed) {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">{t('checkout.pageTitle')}</h1>
        </div>
        <div className="cart-empty">
          <p className="cart-empty-emoji" aria-hidden="true">
            🛒
          </p>
          <h2>{t('checkout.emptyCartTitle')}</h2>
          <p>{t('checkout.emptyCartText')}</p>
          <Link to="/menu" className="contact-btn cart-empty-btn">
            {t('checkout.exploreMenu')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">{t('checkout.pageTitle')}</h1>
      </div>

      <div className="checkout-page">
        {(!currentUser || isGuest) && (
          <div className="checkout-banner checkout-banner--info">
            <strong>{t('checkout.guestBannerTitle')}</strong>{' '}
            {t('checkout.guestBannerText')}{' '}
            <Link to="/login/customer" state={{ from: '/checkout' }}>
              {t('checkout.guestBannerLogin')}
            </Link>
          </div>
        )}

        {catalogStatus === 'error' && (
          <div className="checkout-banner checkout-banner--error" role="alert">
            <strong>{t('checkout.catalogErrorTitle')}</strong>{' '}
            {t('checkout.catalogErrorText')}{' '}
            <button
              type="button"
              className="checkout-banner-link"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              {t('checkout.retry')}
            </button>
          </div>
        )}

        {settingsStatus === 'error' && (
          <div className="checkout-banner checkout-banner--error" role="alert">
            <strong>{t('checkout.settingsErrorTitle')}</strong>{' '}
            {t('checkout.settingsErrorText')}{' '}
            <button
              type="button"
              className="checkout-banner-link"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              {t('checkout.retry')}
            </button>
          </div>
        )}

        {readiness.reason === 'catalog-empty' && (
          <div className="checkout-banner checkout-banner--error" role="alert">
            <strong>{t('checkout.menuUnavailableTitle')}</strong>{' '}
            {t('checkout.menuUnavailableText')}
          </div>
        )}

        {(catalogStatus === 'loading' || settingsStatus === 'loading') &&
          catalogStatus !== 'error' &&
          settingsStatus !== 'error' && (
            <div className="checkout-banner checkout-banner--info" role="status">
              {t('checkout.loadingPrices')}
            </div>
          )}

        <CheckoutStepper
          currentStep={step}
          maxStepIndex={maxStepIndex}
          onStepSelect={handleStepSelect}
          stepErrors={stepErrors}
          cartCount={count}
        />

        <div className="checkout-layout">
          <div className="checkout-main">
            {step === 'details' && (
              <CustomerInfoStep
                customer={customer}
                onChange={handleCustomerChange}
                errors={translateErrors(errors.customer || {})}
              />
            )}

            {step === 'delivery' && (
              <FulfillmentStep
                fulfillmentType={fulfillmentType}
                onFulfillmentChange={handleFulfillmentChange}
                address={address}
                onAddressChange={handleAddressChange}
                errors={translateErrors(errors.address || {})}
                saveAddress={saveAddress}
                onSaveChange={setSaveAddress}
              />
            )}

            {step === 'payment' && (
              <PaymentStep
                selected={paymentMethod}
                onChange={setPaymentMethod}
                error={errors.payment ? t(errors.payment) : null}
              />
            )}

            {step === 'review' && (
              <ReviewStep
                customer={customer}
                fulfillmentType={fulfillmentType}
                address={address}
                paymentMethod={paymentMethod}
                notes={notes}
                onNotesChange={setNotes}
                items={displayItems}
                totals={displayTotals}
                promoCode={promoCode}
                onEditStep={handleStepSelect}
                availabilityIssues={availabilityIssues}
                priceChanges={priceChanges}
                submitting={submitting}
                onPlaceOrder={handlePlaceOrder}
                orderError={orderError}
                pricingReady={pricingReady}
              />
            )}

            <div className="checkout-nav">
              <button type="button" className="checkout-back" onClick={handleBack}>
                {step === 'details' ? t('checkout.backToCart') : t('common.actions.back')}
              </button>
              {step !== 'review' && (
                <button
                  type="button"
                  className="contact-btn checkout-next"
                  onClick={handleContinue}
                >
                  {t('common.actions.continue')}
                </button>
              )}
            </div>
          </div>

          {step !== 'review' && (
            <aside className="checkout-aside">
              <OrderSummaryPanel
                items={displayItems}
                totals={displayTotals}
                fulfillmentType={fulfillmentType}
                className="order-summary-panel--sticky"
              />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

export default CheckoutPage;
