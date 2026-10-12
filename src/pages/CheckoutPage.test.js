// React-level regression tests for the CheckoutPage pricing-safety boundary.
//
// The original crash was:
//   cartPricing.js:70 Cannot read properties of null (reading 'delivery')
// because CheckoutPage initialises `settings` to `null` while the live
// restaurant settings are still loading and passes it straight into
// getCheckoutTotals -> calculateTotals. A destructuring default only applies to
// `undefined`, not `null`, so the very first render threw and crashed the page.
//
// These tests render the real page (with the data/context boundaries mocked) and
// prove:
//   1. it renders — instead of throwing — when settings are null/unavailable,
//   2. Place Order is blocked while required pricing settings are unavailable,
//   3. it is enabled and shows the server-aligned total once settings load.

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CheckoutPage from './CheckoutPage';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/CartContext', () => ({ useCart: jest.fn() }));
jest.mock('../context/ToastContext', () => ({ useToast: jest.fn() }));
jest.mock('../services/menuService', () => ({ fetchProducts: jest.fn() }));
jest.mock('../services/restaurantService', () => ({
  getRestaurantSettings: jest.fn(),
}));
jest.mock('../services/orderService', () => ({
  createOrder: jest.fn(),
  recalculateItems: jest.fn(),
}));
jest.mock('../services/storage', () => ({
  getSavedAddresses: jest.fn(() => []),
  saveSavedAddresses: jest.fn(),
  saveLastOrder: jest.fn(),
}));

import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { fetchProducts } from '../services/menuService';
import { getRestaurantSettings } from '../services/restaurantService';
import { createOrder, recalculateItems } from '../services/orderService';
import { getSavedAddresses } from '../services/storage';

const PRODUCT = {
  id: 'p1',
  name: 'Margherita',
  restaurantId: 'restaurant-pizza-demo',
  available: true,
  basePrice: 20,
};

const CART_ITEM = {
  id: 'p1__line',
  productId: 'p1',
  name: 'Margherita',
  price: 20,
  unitPrice: 20,
  qty: 1,
  lineTotal: 20,
};

// Mirrors a `restaurants/{id}` settings document: $5 delivery under a $50
// free-delivery threshold, 10% tax.
const SETTINGS = {
  taxRate: 0.1,
  delivery: { baseFee: 5, freeDeliveryThreshold: 50 },
  deliveryEnabled: true,
};

function renderCheckout() {
  return render(
    <MemoryRouter initialEntries={['/checkout']}>
      <CheckoutPage />
    </MemoryRouter>
  );
}

function mockCart(items = [CART_ITEM]) {
  useCart.mockReturnValue({
    items,
    promoCode: '',
    count: items.length,
    clearCart: jest.fn(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // react-scripts sets `resetMocks: true`, so re-establish implementations.
  getSavedAddresses.mockReturnValue([]);
  mockCart();
  useAuth.mockReturnValue({
    currentUser: null,
    userProfile: null,
    isGuest: true,
    ensureGuestSession: jest.fn(),
  });
  useToast.mockReturnValue({ showToast: jest.fn() });
  recalculateItems.mockImplementation((items) => ({
    items: items || [],
    issues: [],
  }));
});

async function advanceToReview() {
  // Details step: prefill comes from the signed-in user.
  await waitFor(() => expect(screen.getByLabelText(/^Full name/i).value).toBe('Ada'));
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  // Delivery step: street/phone are prefilled from the profile, city is typed.
  await waitFor(() =>
    expect(screen.getByLabelText(/^Street address/i).value).toBe('1 Analytical Ave')
  );
  userEvent.type(screen.getByLabelText(/^City/i), 'London');
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  // Payment step: the default method is fine.
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
}

describe('CheckoutPage pricing safety', () => {
  it('renders (does not crash) when restaurant settings are null/unavailable', async () => {
    getRestaurantSettings.mockResolvedValue(null);
    fetchProducts.mockResolvedValue([]);

    renderCheckout();

    // The page mounts; the original null-settings destructuring crashed here.
    expect(await screen.findByText('CHECKOUT')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /place order/i })).toBeNull();
  });

  it('blocks Place Order while required pricing settings are unavailable', async () => {
    // Signed-in customer so the checkout steps can be walked to Review.
    useAuth.mockReturnValue({
      currentUser: {
        uid: 'cust-1',
        displayName: 'Ada',
        email: 'ada@example.com',
        isAnonymous: false,
      },
      userProfile: { phone: '+15551234567', address: '1 Analytical Ave' },
      isGuest: false,
      ensureGuestSession: jest.fn(),
    });
    getRestaurantSettings.mockResolvedValue(null);
    fetchProducts.mockResolvedValue([PRODUCT]);

    renderCheckout();
    await advanceToReview();

    const placeOrder = await screen.findByRole('button', {
      name: /confirming prices/i,
    });
    expect(placeOrder).toBeDisabled();

    // A disabled button (and the handler guard) must never submit an order
    // built from missing/estimated pricing.
    fireEvent.click(placeOrder);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('enables Place Order and shows the server-aligned total once settings load', async () => {
    useAuth.mockReturnValue({
      currentUser: {
        uid: 'cust-1',
        displayName: 'Ada',
        email: 'ada@example.com',
        isAnonymous: false,
      },
      userProfile: { phone: '+15551234567', address: '1 Analytical Ave' },
      isGuest: false,
      ensureGuestSession: jest.fn(),
    });
    getRestaurantSettings.mockResolvedValue(SETTINGS);
    fetchProducts.mockResolvedValue([PRODUCT]);

    renderCheckout();
    await advanceToReview();

    const placeOrder = await screen.findByRole('button', { name: /place order/i });
    expect(placeOrder).toBeEnabled();
    // $20 subtotal + $5 delivery + $2 tax (10%) = $27.00, matching the server.
    expect(placeOrder).toHaveTextContent('$27.00');
  });
});
