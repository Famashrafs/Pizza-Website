import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import AuthPrompt from '../components/AuthPrompt';
import CheckoutStepper from '../components/checkout/CheckoutStepper';
import CustomerInfoStep from '../components/checkout/CustomerInfoStep';
import FulfillmentStep from '../components/checkout/FulfillmentStep';
import PaymentStep from '../components/checkout/PaymentStep';
import ReviewStep from '../components/checkout/ReviewStep';
import OrderSummaryPanel from '../components/checkout/OrderSummaryPanel';
import { fetchProducts } from '../services/menuService';
import { createOrder } from '../services/orderService';
import { getSavedAddresses, saveSavedAddresses } from '../services/storage';
import {
  CHECKOUT_STEPS,
  createEmptyAddress,
  createEmptyCustomer,
  findUnavailableItems,
  formatAddress,
  getCheckoutTotals,
  validateAddress,
  validateCustomerInfo,
} from '../utils/checkoutLogic';

function CheckoutPage() {
  const { currentUser, userProfile } = useAuth();
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
  const [productsLoading, setProductsLoading] = useState(true);

  const submitLock = useRef(false);

  // Prefill customer + address for the signed-in user (and after a late login).
  useEffect(() => {
    if (!currentUser) return;
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
  }, [currentUser, userProfile]);

  // Load catalog once so we can flag items that are no longer orderable.
  useEffect(() => {
    let active = true;
    setProductsLoading(true);
    fetchProducts()
      .then((list) => {
        if (!active) return;
        setProducts(list);
        setProductsLoading(false);
      })
      .catch(() => {
        if (active) setProductsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const currentIndex = CHECKOUT_STEPS.findIndex((entry) => entry.id === step);

  const totals = useMemo(
    () => getCheckoutTotals(items, { promoCode, fulfillmentType }),
    [items, promoCode, fulfillmentType]
  );

  const availabilityIssues = useMemo(
    () => (productsLoading ? [] : findUnavailableItems(items, products)),
    [items, products, productsLoading]
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
    submitLock.current = true;
    setSubmitting(true);
    setOrderError('');

    try {
      const result = await createOrder({
        customerId: currentUser.uid,
        items,
        customer,
        fulfillmentType,
        address,
        paymentMethod,
        customerNotes: notes,
        promoCode,
      });

      if (!result.success) {
        setErrors(result.errors || {});
        setOrderError(
          result.error || 'We could not place your order. Please try again.'
        );
        if (result.errors?.customer) setStep('details');
        else if (result.errors?.address) setStep('delivery');
        else if (result.errors?.payment) setStep('payment');
        else setStep('review');
        fetchProducts().then(setProducts).catch(() => {});
        return;
      }

      if (saveAddress && fulfillmentType === 'delivery') {
        persistAddress();
      }
      setPlaced(true);
      clearCart();
      showToast('Order confirmed!');
      navigate('/order-confirmation', { state: { order: result.order } });
    } catch (err) {
      // Keep the cart so the customer can retry.
      setOrderError(
        'Something went wrong while placing your order. Please try again.'
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">CHECKOUT</h1>
        </div>
        <AuthPrompt
          title="Login to place your order"
          message="Your cart is saved. Log in or create an account to finish checkout."
        />
      </div>
    );
  }

  if (items.length === 0 && !placed) {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">CHECKOUT</h1>
        </div>
        <div className="cart-empty">
          <p className="cart-empty-emoji" aria-hidden="true">
            🛒
          </p>
          <h2>Your cart is empty</h2>
          <p>Add a few items before checking out.</p>
          <Link to="/menu" className="contact-btn cart-empty-btn">
            Explore Menu
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">CHECKOUT</h1>
      </div>

      <div className="checkout-page">
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
                errors={errors.customer || {}}
              />
            )}

            {step === 'delivery' && (
              <FulfillmentStep
                fulfillmentType={fulfillmentType}
                onFulfillmentChange={handleFulfillmentChange}
                address={address}
                onAddressChange={handleAddressChange}
                errors={errors.address || {}}
                saveAddress={saveAddress}
                onSaveChange={setSaveAddress}
              />
            )}

            {step === 'payment' && (
              <PaymentStep
                selected={paymentMethod}
                onChange={setPaymentMethod}
                error={errors.payment}
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
                items={items}
                totals={totals}
                promoCode={promoCode}
                onEditStep={handleStepSelect}
                availabilityIssues={availabilityIssues}
                submitting={submitting}
                onPlaceOrder={handlePlaceOrder}
                orderError={orderError}
              />
            )}

            <div className="checkout-nav">
              <button type="button" className="checkout-back" onClick={handleBack}>
                {step === 'details' ? 'Back to Cart' : 'Back'}
              </button>
              {step !== 'review' && (
                <button
                  type="button"
                  className="contact-btn checkout-next"
                  onClick={handleContinue}
                >
                  Continue
                </button>
              )}
            </div>
          </div>

          {step !== 'review' && (
            <aside className="checkout-aside">
              <OrderSummaryPanel
                items={items}
                totals={totals}
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
