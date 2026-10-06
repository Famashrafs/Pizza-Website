// TEMPORARY diagnostic - deleted after use.
import { createOrder } from './orderService';
import { RESTAURANT_ID } from '../config/restaurant';

jest.mock('./db');
const db = require('./db');

beforeEach(() => {
  db.__reset();
  db.__setDocs({
    [`restaurants/${RESTAURANT_ID}`]: {
      id: RESTAURANT_ID,
      name: 'Demo Pizza',
      ownerId: 'owner-1',
    },
    'products/p1': {
      id: 'p1',
      name: 'Margherita',
      restaurantId: RESTAURANT_ID,
      available: true,
      archived: false,
      basePrice: 10,
      category: 'Pizza',
      categoryId: 'cat-pizza',
      sortOrder: 0,
    },
  });
});

// Walks the payload and reports everything the real Firestore SDK rejects.
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
    if (value.__serversNow) return out; // serverTimestamp() sentinel is legal
    if (value.__sentinel) return out;
    if (typeof value.toDate === 'function') return out; // Timestamp is legal
    Object.entries(value).forEach(([k, v]) => findInvalid(v, `${path}.${k}`, out));
    return out;
  }
  return out;
}

it('diagnoses the exact order payload sent to Firestore', async () => {
  const spy = jest.spyOn(db.default, 'setDoc');

  const result = await createOrder({
    customerId: 'cust-1',
    items: [{ id: 'p1__line', productId: 'p1', name: 'Margherita', qty: 2 }],
    customer: { fullName: 'Ada', email: 'ada@example.com', phone: '+15551234567' },
    fulfillmentType: 'delivery',
    address: { street: '1 Analytical Ave', city: 'London', phone: '+15551234567' },
    paymentMethod: 'cash',
    restaurantId: RESTAURANT_ID,
  });

  const write = spy.mock.calls.find(([p]) => String(p).startsWith('orders/'));
  // eslint-disable-next-line no-console
  console.log('SUCCESS:', result.success, '| errors:', JSON.stringify(result.errors || {}));
  // eslint-disable-next-line no-console
  console.log('WRITE PATH:', write && write[0]);
  // eslint-disable-next-line no-console
  console.log('PAYLOAD:', JSON.stringify(write && write[1], null, 2));
  // eslint-disable-next-line no-console
  console.log('INVALID VALUES:', JSON.stringify(findInvalid(write && write[1]), null, 2));

  expect(write).toBeTruthy();
});