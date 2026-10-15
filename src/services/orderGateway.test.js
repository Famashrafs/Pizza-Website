// Transport-level tests for the REAL `orderGateway` module (only `firebase`
// and the `firebase/functions` SDK are mocked).
//
// Every other suite mocks the gateway itself, so nothing covered what happens
// when the callable is missing, misconfigured or rejects: the Firebase SDK
// surfaces that as `functions/*` errors (a 404 endpoint reaches the browser as
// a CORS failure with no readable code). These tests pin the mapping back to
// the { success, error } contract so checkout never throws and always keeps a
// friendly, non-leaky message.

jest.mock('firebase/functions', () => ({
  __esModule: true,
  getFunctions: jest.fn(),
  httpsCallable: jest.fn(),
}));

jest.mock('../firebase', () => ({
  __esModule: true,
  default: { name: 'test-app' },
  auth: {},
}));

const { getFunctions, httpsCallable } = require('firebase/functions');
const app = require('../firebase').default;
const { placeOrderViaGateway, getGuestOrderViaGateway } = require('./orderGateway');

let currentImpl;
const callableNames = [];

beforeEach(() => {
  callableNames.length = 0;
  currentImpl = async () => ({ data: { success: true } });
  getFunctions.mockReset().mockReturnValue('functions-instance');
  httpsCallable.mockReset().mockImplementation((_fns, name) => {
    callableNames.push(name);
    return (...args) => currentImpl(...args);
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // eslint-disable-next-line no-console
  console.error.mockRestore();
});

describe('placeOrderViaGateway', () => {
  it('uses getFunctions(app) and the createOrder callable name', async () => {
    currentImpl = async () => ({ data: { success: true, orderId: 'ORD-1' } });

    const result = await placeOrderViaGateway({ items: [] });

    expect(getFunctions).toHaveBeenCalledWith(app);
    expect(callableNames).toContain('createOrder');
    expect(result).toEqual({ success: true, orderId: 'ORD-1' });
  });

  it('passes the checkout payload through to the callable', async () => {
    const payload = { restaurantId: 'restaurant-pizza-demo', items: [{ id: 'p1', qty: 1 }] };
    currentImpl = async (received) => ({ data: { success: true, received } });

    const result = await placeOrderViaGateway(payload);

    expect(result.received).toEqual(payload);
  });

  it('reports an unexpected (non-envelope) response instead of throwing', async () => {
    currentImpl = async () => ({ data: null });

    const result = await placeOrderViaGateway({});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unexpected response/i);
  });

  it('maps functions/unavailable (undeployed or misrouted endpoint) to a retryable error', async () => {
    currentImpl = async () => {
      const err = new Error('Backend did not respond.');
      err.code = 'functions/unavailable';
      throw err;
    };

    const result = await placeOrderViaGateway({});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/temporarily unavailable/i);
    expect(result.error).toMatch(/Backend did not respond/);
  });

  it('maps functions/unauthenticated to a sign-in prompt', async () => {
    currentImpl = async () => {
      const err = new Error('Unauthenticated');
      err.code = 'functions/unauthenticated';
      throw err;
    };

    const result = await placeOrderViaGateway({});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/session expired/i);
  });

  it('never leaks raw error details beyond the first line', async () => {
    currentImpl = async () => {
      const err = new Error('boom\nstack frame one\nstack frame two');
      err.code = 'functions/internal';
      err.details = { secret: 'internal-detail' };
      throw err;
    };

    const result = await placeOrderViaGateway({});

    expect(result.success).toBe(false);
    expect(result.error).not.toMatch(/stack frame two/);
    expect(result.error).not.toMatch(/internal-detail/);
    expect(JSON.stringify(result)).not.toMatch(/stack frame two/);
  });
});

describe('getGuestOrderViaGateway', () => {
  it('uses the getGuestOrder callable name', async () => {
    currentImpl = async () => ({ data: { success: true, order: { id: 'ORD-9' } } });

    const result = await getGuestOrderViaGateway({ orderId: 'ORD-9', token: 'tok' });

    expect(callableNames).toContain('getGuestOrder');
    expect(result.success).toBe(true);
    expect(result.order.id).toBe('ORD-9');
  });

  it('turns any failure into a generic not-found result', async () => {
    currentImpl = async () => {
      const err = new Error('Not found');
      err.code = 'functions/not-found';
      throw err;
    };

    const result = await getGuestOrderViaGateway({ orderId: 'ORD-9', token: 'bad' });

    expect(result).toEqual({ success: false, error: 'Order not found.' });
  });
});
