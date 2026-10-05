// Development-only diagnostics. This project builds with Create React App, so
// `process.env.NODE_ENV` is statically replaced at build time (Vite's
// `import.meta.env` is not available here). The real Firebase error is logged in
// non-production builds so permission-denied / failed-precondition / unavailable /
// missing-index issues can be identified during development without ever leaking
// error details to production users.

const isDevelopment = () => process.env.NODE_ENV !== 'production';

export function devLog(...args) {
  if (isDevelopment()) {
    console.error('[dev]', ...args);
  }
}

// Hard failures (profile/database unreachable, permission denied) must stay
// visible in production builds too: `devLog` is stripped by the build, which made
// an unreachable Firestore look exactly like "signed in as a customer" with no
// clue anywhere. Only failures reach this channel, so it stays low-noise, and
// `key` de-duplicates repeats of the same cause within a session.
const warned = new Set();

export function runtimeWarn(key, ...args) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[app]', ...args);
}

// Test helper — lets a suite assert on warnings without leaking state between
// test cases.
export function __resetRuntimeWarnings() {
  warned.clear();
}

export default devLog;