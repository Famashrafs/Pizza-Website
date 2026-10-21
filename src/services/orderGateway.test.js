// Transport-level tests for the REAL `orderGateway` module (only `firebase`,
// the `firebase/functions` SDK and `fetch` are stubbed).
//
// Every other suite mocks the gateway itself, so nothing else covered what
// happens when the endpoint is missing/misconfigured or the server rejects:
// the Firebase SDK surfaces that as `functions/*` errors (a 404 endpoint reaches
// the browser as a CORS failure with no readable code) and the demo HTTP API as
// a non-2xx response. These tests pin BOTH transports to the same
// { success, error } contract so checkout never throws and always keeps a
// friendly, non-leaky message.
//
// The active transport is chosen at module load from REACT_APP_API_BASE_URL, so
// each test re-loads the module under the env it needs. Because re-loading also
// re-instantiates the mocked SDK, configure the stubs AFTER loading.

jest.mock('firebase/functions', () => ({
  __esModule: true,
  getFunctions: jest.fn(),
  httpsCallable: jest.fn(),
}));

jest.mock('../firebase', () => ({
  __esModule: true,
  default: { name: 'test-app' },
  auth: { currentUser: { getIdToken: jest.fn(async () => 'id-token-123') } },
}));

// Fresh gateway bound to the given REACT_APP_API_BASE_URL (undefined => callable).
function loadGateway(apiBaseUrl) {
  jest.resetModules();
  if (apiBaseUrl === undefined) {
    delete process.env.REACT_APP_API_BASE_URL;
  } else {
    process.env.REACT_APP_API_BASE_URL = apiBaseUrl;
  }
  // eslint-disable-next-line global-require
  return require('./orderGateway');
}

// Loads the callable-transport gateway and wires the SDK stubs afterwards.
function loadCallableGateway() {
  const gateway = loadGateway(undefined);
  const functionsLib = require('firebase/functions');
  const names = [];
  let impl = async () => ({ data: { success: true } });

  functionsLib.getFunctions.mockReset().mockReturnValue('functions-instance');
  functionsLib.httpsCallable.mockReset().mockImplementation((_fns, name) => {
    names.push(name);
    return (...args) => impl(...args);
  });

  return { gateway, functionsLib, names, setImpl: (fn) => { impl = fn; } };
}

function fetchReturning(response) {
  return jest.fn(async () => response);
}

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });
const errorResponse = (status, body) => ({ ok: false, status, json: async () => body });

beforeEach(() => {
  delete process.env.REACT_APP_API_BASE_URL;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // eslint-disable-next-line no-console
  console.error.mockRestore();
  delete global.fetch;
});

// --- Transport selection ----------------------------------------------------

describe('transport selection', () => {
  it('uses the callable SDK when REACT_APP_API_BASE_URL is unset', () => {
    const { transport } = loadGateway(undefined);
    expect(transport).toBe('callable');
  });

  it('uses the demo HTTP API (trailing slash trimmed) when configured', () => {
    const { transport, API_BASE_URL } = loadGateway('https://api.example/');
    expect(transport).toBe('http');
    expect(API_BASE_URL).toBe('https://api.example');
  });

  it('uses the demo HTTP API when the URL has no trailing slash', () => {
    const { transport, API_BASE_URL } = loadGateway('https://api.example');
    expect(transport).toBe('http');
    expect(API_BASE_URL).toBe('https://api.example');
  });

  it('treats an empty value as "intentionally unset" and keeps the callable transport', () => {
    const { transport, API_BASE_URL } = loadGateway('   ');
    expect(transport).toBe('callable');
    expect(API_BASE_URL).toBe('');
  });

  it('rejects a malformed URL instead of falling back to the callable transport', () => {
    const { transport, API_BASE_URL, API_BASE_URL_ERROR } = loadGateway('not-a-url');
    expect(transport).toBe('invalid');
    expect(API_BASE_URL).toBe('');
    expect(API_BASE_URL_ERROR).toBe('not-a-valid-url');
  });

  it('rejects a URL without an http(s) scheme', () => {
    const { transport, API_BASE_URL_ERROR } = loadGateway('ftp://api.example');
    expect(transport).toBe('invalid');
    expect(API_BASE_URL_ERROR).toBe('unsupported-protocol');
  });

  it('never calls the Firebase callable SDK when the configured URL is invalid', async () => {
    global.fetch = fetchReturning(okResponse({ success: true }));

    const { placeOrderViaGateway, getGuestOrderViaGateway } = loadGateway('not-a-url');

    // Load the mock AFTER the gateway so it is the very instance the gateway
    // would call (loadGateway resets the module registry).
    const functionsLib = require('firebase/functions');
    functionsLib.getFunctions.mockReset();
    functionsLib.httpsCallable.mockReset();

    const created = await placeOrderViaGateway({ items: [] });
    const looked = await getGuestOrderViaGateway({ orderId: 'ORD-1', token: 'tok' });

    expect(functionsLib.httpsCallable).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(created.success).toBe(false);
    expect(created.error).toMatch(/REACT_APP_API_BASE_URL/i);
    expect(looked.success).toBe(false);
    expect(looked.error).toMatch(/REACT_APP_API_BASE_URL/i);
  });

  it('reports the selected transport and the API hostname only (no secrets)', () => {
    const { getTransportDiagnostic } = loadGateway('https://api.example/api');

    expect(getTransportDiagnostic()).toEqual({ transport: 'http', apiHost: 'api.example' });
  });

  it('reports no hostname when the API URL is unset', () => {
    const { getTransportDiagnostic } = loadGateway(undefined);

    expect(getTransportDiagnostic()).toEqual({ transport: 'callable', apiHost: null });
  });

  it('logs only the transport and the hostname', () => {
    const { logTransportDiagnostic } = loadGateway('https://api.example');
    const info = jest.fn();

    logTransportDiagnostic({ info });

    expect(info).toHaveBeenCalledTimes(1);
    const [message] = info.mock.calls[0];
    expect(message).toContain('transport=http');
    expect(message).toContain('apiHost=api.example');
    expect(message).not.toMatch(/token/i);
    expect(message).not.toMatch(/secret/i);
    expect(message).not.toMatch(/id-token/i);
  });
});

// --- Callable transport -----------------------------------------------------

describe('callable transport', () => {
  it('uses getFunctions(app) and the createOrder callable name', async () => {
    const { gateway, functionsLib, names, setImpl } = loadCallableGateway();
    const app = require('../firebase').default;
    setImpl(async () => ({ data: { success: true, orderId: 'ORD-1' } }));

    const result = await gateway.placeOrderViaGateway({ items: [] });

    expect(functionsLib.getFunctions).toHaveBeenCalledWith(app);
    expect(names).toContain('createOrder');
    expect(result).toEqual({ success: true, orderId: 'ORD-1' });
  });

  it('passes the checkout payload through to the callable', async () => {
    const { gateway, setImpl } = loadCallableGateway();
    const payload = { restaurantId: 'restaurant-pizza-demo', items: [{ id: 'p1', qty: 1 }] };
    setImpl(async (received) => ({ data: { success: true, received } }));

    const result = await gateway.placeOrderViaGateway(payload);

    expect(result.received).toEqual(payload);
  });

  it('uses the getGuestOrder callable name', async () => {
    const { gateway, names, setImpl } = loadCallableGateway();
    setImpl(async () => ({ data: { success: true, order: { id: 'ORD-9' } } }));

    const result = await gateway.getGuestOrderViaGateway({ orderId: 'ORD-9', token: 'tok' });

    expect(names).toContain('getGuestOrder');
    expect(result.success).toBe(true);
    expect(result.order.id).toBe('ORD-9');
  });

  it('reports an unexpected (non-envelope) response instead of throwing', async () => {
    const { gateway, setImpl } = loadCallableGateway();
    setImpl(async () => ({ data: null }));

    const result = await gateway.placeOrderViaGateway({});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unexpected response/i);
  });

  it('maps functions/unavailable (undeployed or misrouted endpoint) to a retryable error', async () => {
    const { gateway, setImpl } = loadCallableGateway();
    setImpl(async () => {
      const err = new Error('Backend did not respond.');
      err.code = 'functions/unavailable';
      throw err;
    });

    const result = await gateway.placeOrderViaGateway({});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/temporarily unavailable/i);
    expect(result.error).toMatch(/Backend did not respond/);
  });

  it('maps functions/unauthenticated to a sign-in prompt', async () => {
    const { gateway, setImpl } = loadCallableGateway();
    setImpl(async () => {
      const err = new Error('Unauthenticated');
      err.code = 'functions/unauthenticated';
      throw err;
    });

    const result = await gateway.placeOrderViaGateway({});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/session expired/i);
  });

  it('never leaks raw error details beyond the first line', async () => {
    const { gateway, setImpl } = loadCallableGateway();
    setImpl(async () => {
      const err = new Error('boom\nstack frame one\nstack frame two');
      err.code = 'functions/internal';
      err.details = { secret: 'internal-detail' };
      throw err;
    });

    const result = await gateway.placeOrderViaGateway({});

    expect(result.success).toBe(false);
    expect(result.error).not.toMatch(/stack frame two/);
    expect(result.error).not.toMatch(/internal-detail/);
    expect(JSON.stringify(result)).not.toMatch(/stack frame two/);
  });

  it('turns a guest-lookup failure into a generic not-found result', async () => {
    const { gateway, setImpl } = loadCallableGateway();
    setImpl(async () => {
      const err = new Error('Not found');
      err.code = 'functions/not-found';
      throw err;
    });

    const result = await gateway.getGuestOrderViaGateway({ orderId: 'ORD-9', token: 'bad' });

    expect(result).toEqual({ success: false, error: 'Order not found.' });
  });
});

// --- Demo HTTP transport ----------------------------------------------------

describe('http transport', () => {
  it('routes both endpoints to the configured order API host', async () => {
    global.fetch = fetchReturning(okResponse({ success: true, order: { id: 'ORD-3' } }));

    const { placeOrderViaGateway, getGuestOrderViaGateway } = loadGateway(
      'https://pizza-demo-api.test'
    );

    await placeOrderViaGateway({ items: [] });
    await getGuestOrderViaGateway({ orderId: 'ORD-3', token: 'tok' });

    const urls = global.fetch.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      'https://pizza-demo-api.test/api/orders/create',
      'https://pizza-demo-api.test/api/orders/guest-lookup',
    ]);
  });

  it('POSTs the payload to /api/orders/create with a Bearer ID token', async () => {
    global.fetch = fetchReturning(okResponse({ success: true, orderId: 'ORD-1' }));
    const payload = { restaurantId: 'restaurant-pizza-demo', items: [{ productId: 'p1', qty: 1 }] };

    const { placeOrderViaGateway } = loadGateway('https://api.example');
    const result = await placeOrderViaGateway(payload);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.example/api/orders/create');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer id-token-123');
    expect(options.headers['Content-Type']).toMatch(/application\/json/);
    expect(JSON.parse(options.body)).toEqual(payload);
    expect(result).toEqual({ success: true, orderId: 'ORD-1' });
  });

  it('omits the Authorization header when there is no signed-in user', async () => {
    global.fetch = fetchReturning(okResponse({ success: true }));

    const { placeOrderViaGateway } = loadGateway('https://api.example');
    require('../firebase').auth.currentUser = null;

    await placeOrderViaGateway({ items: [] });

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('POSTs guest lookups to /api/orders/guest-lookup', async () => {
    global.fetch = fetchReturning(okResponse({ success: true, order: { id: 'ORD-9' } }));

    const { getGuestOrderViaGateway } = loadGateway('https://api.example');
    const result = await getGuestOrderViaGateway({ orderId: 'ORD-9', token: 'tok' });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.example/api/orders/guest-lookup');
    expect(JSON.parse(options.body)).toEqual({ orderId: 'ORD-9', token: 'tok' });
    expect(result.order.id).toBe('ORD-9');
  });

  it('maps a 401 to the sign-in prompt', async () => {
    global.fetch = fetchReturning(errorResponse(401, { success: false, error: 'nope' }));

    const { placeOrderViaGateway } = loadGateway('https://api.example');
    const result = await placeOrderViaGateway({});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/session expired/i);
  });

  it('maps a 5xx to a retryable error and never leaks internals', async () => {
    global.fetch = fetchReturning(
      errorResponse(500, { success: false, error: 'db exploded at host:1' })
    );

    const { placeOrderViaGateway } = loadGateway('https://api.example');
    const result = await placeOrderViaGateway({});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/temporarily unavailable/i);
    expect(result.error).toMatch(/db exploded/);
  });

  it('maps a network failure to a retryable error', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('fetch failed');
    });

    const { placeOrderViaGateway } = loadGateway('https://api.example');
    const result = await placeOrderViaGateway({});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/temporarily unavailable/i);
  });

  it('turns a failed guest lookup into a generic not-found result', async () => {
    global.fetch = fetchReturning(errorResponse(500, { success: false, error: 'boom' }));

    const { getGuestOrderViaGateway } = loadGateway('https://api.example');
    const result = await getGuestOrderViaGateway({ orderId: 'ORD-9', token: 'bad' });

    expect(result).toEqual({ success: false, error: 'Order not found.' });
  });

  it('reports an unexpected (non-envelope) success body', async () => {
    global.fetch = fetchReturning(okResponse(null));

    const { placeOrderViaGateway } = loadGateway('https://api.example');
    const result = await placeOrderViaGateway({});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unexpected response/i);
  });
});
