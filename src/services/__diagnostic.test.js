// TEMPORARY diagnostic - deleted after use.
//
// Order creation no longer writes Firestore from the browser: the client sends
// a request payload to the trusted `createOrder` Cloud Function (via
// `orderGateway`) and the function computes and stores the order. This
// diagnostic therefore validates the EXACT request payload that crosses the
// callable boundary — it must be plain serializable data (no undefined,
// functions, or symbols, which the SDK or the wire format would reject) and it
// must be the ONLY thing `createOrder` sends (no Firestore writes on the
// client side).
import { createOrder } from './orderService';
import { RESTAURANT_ID } from '../config/restaurant';

jest.mock('./db');
jest.mock('./orderGateway');
const db = require('./db');
const orderGateway = require('./orderGateway');

// Walks the payload and reports everything the callable/serialization rejects.
function findInvalid(value, path = '', out = []) {
  if (value === undefined) {
    out.push(`${path || '<root>'} = undefined`);
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    out.push(`${path} = ${value}`);
    return out;
  }
  if (typeof value === 'function') {
    out.push(`${path} = function`);
    return out;
  }
  if (typeof value === 'symbol') {
    out.push(`${path} = symbol`);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, i) => findInvalid(entry, `${path}[${i}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => findInvalid(v, `${path}.${k}`, out));
    return out;
  }
  return out;
}

it('diagnoses the exact request payload sent to the createOrder callable', async () => {
  const gateway = jest.spyOn(orderGateway, 'placeOrderViaGateway');
  const setDoc = jest.spyOn(db.default, 'setDoc');

  gateway.mockResolvedValue({
    success: true,
    orderId: 'ORD-DIAG',
    order: {
      id: 'ORD-DIAG',
      restaurantId: RESTAURANT_ID,
      customerId: 'cust-1',
      customerType: 'registered',
      orderStatus: 'placed',
      fulfillmentType: 'delivery',
      paymentMethod: 'cash',
      paymentStatus: 'pending',
      items: [{ id: 'p1__line', productId: 'p1', name: 'Margherita', qty: 2 }],
      totals: { items: 20, subtotal: 20, deliveryFee: 3.99, tax: 1.6, total: 25.59 },
      customer: { fullName: 'Ada', email: 'ada@example.com', phone: '+15551234567' },
      address: { street: '1 Analytical Ave', city: 'London', phone: '+15551234567' },
      statusHistory: [
        { status: 'placed', at: '2025-01-01T00:00:00.000Z', changedBy: 'customer' },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  });

  const result = await createOrder({
    customerId: 'cust-1',
    items: [{ id: 'p1__line', productId: 'p1', name: 'Margherita', qty: 2 }],
    customer: { fullName: 'Ada', email: 'ada@example.com', phone: '+15551234567' },
    fulfillmentType: 'delivery',
    address: { street: '1 Analytical Ave', city: 'London', phone: '+15551234567' },
    paymentMethod: 'cash',
    restaurantId: RESTAURANT_ID,
  });

  const request = gateway.mock.calls[0] && gateway.mock.calls[0][0];
  const firestoreWrites = setDoc.mock.calls.filter(([p]) =>
    String(p).startsWith('orders/')
  );
  // eslint-disable-next-line no-console
  console.log('SUCCESS:', result.success, '| reuse:', result.reuse);
  // eslint-disable-next-line no-console
  console.log('REQUEST:', JSON.stringify(request, null, 2));
  // eslint-disable-next-line no-console
  console.log('INVALID VALUES:', JSON.stringify(findInvalid(request), null, 2));
  // eslint-disable-next-line no-console
  console.log('CLIENT FIRESTORE ORDER WRITES:', firestoreWrites.length);

  expect(request).toBeTruthy();
  expect(request.restaurantId).toBe(RESTAURANT_ID);
  expect(gateway).toHaveBeenCalledTimes(1);
  // Order docs are only ever written by the server function, never the browser.
  expect(firestoreWrites).toHaveLength(0);
  expect(findInvalid(request)).toEqual([]);
  expect(result.success).toBe(true);
});