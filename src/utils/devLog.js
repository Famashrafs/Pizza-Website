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

export default devLog;