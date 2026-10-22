// Error types shared by the Cloudflare Worker transport.
//
// The Worker must never let an exception escape the `fetch` handler: an
// uncaught exception is answered by Cloudflare with the generic "Error 1101"
// page, which carries no CORS headers — the browser then reports a CORS
// failure instead of a readable API error, and /health cannot be used to tell
// "Worker is up" from "Worker is broken".
//
// A ConfigurationError marks a *deployment* problem (missing/invalid secret,
// unusable credentials). It is reported to the client as a generic 503 with
// CORS headers, while the machine-readable `code` stays in the server log and
// in /api/diagnostics. No secret material is ever part of the message.

export class ConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = code;
  }
}

export function isConfigurationError(err) {
  return Boolean(err) && err.name === 'ConfigurationError';
}

// A DEPENDENCY (not the client, not the token) failed: Identity Toolkit was
// unreachable, quota-limited or rejected the API key. The caller's session may
// be perfectly valid, so this must NOT be reported as "your session expired"
// (that would tell a customer to sign in again for a backend outage) — it is a
// 503 with CORS headers instead.
export class UpstreamUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}

export function isUpstreamUnavailable(err) {
  return Boolean(err) && err.name === 'UpstreamUnavailableError';
}

// Log-safe error message. Redacts OAuth/Firestore access tokens that can show
// up inside upstream error messages (query strings) and truncates the rest, so
// a server log can never leak a credential.
export function safeErrorMessage(err) {
  if (!err) return 'unknown error';
  const raw = typeof err === 'string' ? err : String(err.message || err.name || 'unknown error');
  return raw.replace(/access_token=[^&\s"']+/gi, 'access_token=REDACTED').slice(0, 300);
}
