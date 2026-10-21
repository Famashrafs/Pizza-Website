// CORS helpers for the Cloudflare Worker demo API.
//
// Port of the logic in server/app.js (kept in lockstep with the Render
// transport so both hosts enforce the SAME explicit allowlist). Never a
// wildcard origin, never `*` with credentials: a response only ever echoes the
// ONE request origin that matched the allowlist.

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

export function normalizeOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

// Accepts an array or a comma-separated string. Falls back to the local dev
// origins when nothing (or only blanks) is configured.
export function parseAllowedOrigins(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  const list = raw.map(normalizeOrigin).filter(Boolean);
  return list.length ? list : DEFAULT_ALLOWED_ORIGINS.slice();
}

export function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return false;
  const origin_ = normalizeOrigin(origin);
  return allowedOrigins.some(
    (allowed) => allowed === origin_ || allowed === '*'
  );
}

// Headers for an ALLOWED browser origin. Applied to every response so the
// browser can read JSON bodies on non-2xx responses too.
export function corsHeadersFor(origin) {
  return {
    'Access-Control-Allow-Origin': normalizeOrigin(origin),
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '600',
  };
}

export function bearerToken(header) {
  const match = /^Bearer\s+(.+)$/i.exec(String(header || '').trim());
  return match ? match[1].trim() : null;
}
