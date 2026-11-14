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
  constructor(
    message,
    {
      code = 'upstream_unavailable',
      status = 503,
      cleanupMayHaveSucceeded = false,
    } = {}
  ) {
    super(message);
    this.name = 'UpstreamUnavailableError';
    this.code = code;
    this.status = status;
    // True only when the request outcome is ambiguous (for example a timeout
    // after the upstream may already have committed the upload). Callers may
    // then perform a bounded cleanup of that exact generated object.
    this.cleanupMayHaveSucceeded = cleanupMayHaveSucceeded;
  }
}

export function isUpstreamUnavailable(err) {
  return Boolean(err) && err.name === 'UpstreamUnavailableError';
}

// Supabase Storage refused to overwrite an existing object. This is distinct
// from an outage: the generated path collided with an existing object, so a
// caller must NOT clean up/delete that pre-existing object.
export class StorageConflictError extends Error {
  constructor(message = 'The image object already exists.') {
    super(message);
    this.name = 'StorageConflictError';
    this.code = 'image_object_conflict';
    this.status = 409;
  }
}

// Log-safe error message. Redacts OAuth/Firestore access tokens that can show
// up inside upstream error messages (query strings) and truncates the rest, so
// a server log can never leak a credential.
export function safeErrorMessage(err, secrets = []) {
  if (!err) return 'unknown error';
  let raw = typeof err === 'string' ? err : String(err.message || err.name || 'unknown error');
  raw = raw.replace(/access_token=[^&\s"']+/gi, 'access_token=REDACTED');
  for (const secret of secrets || []) {
    const value = String(secret || '');
    if (value.length >= 8) raw = raw.split(value).join('[REDACTED]');
  }
  return raw.slice(0, 300);
}
