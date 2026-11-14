// Server-side Supabase Storage adapter for the Cloudflare Worker.
//
// Only the Worker uses this module. The Supabase service-role credential is
// read from a Worker secret and is never placed in a URL, response, diagnostic
// payload, or browser-visible variable.
//
// The adapter deliberately calls Supabase's Storage REST API directly instead
// of adding a browser-oriented SDK to the Worker bundle. Every request is
// bounded by a timeout and upstream error bodies are never returned or logged.

'use strict';

import {
  ConfigurationError,
  StorageConflictError,
  UpstreamUnavailableError,
} from './errors.js';
import { STORAGE_BUCKETS } from './imageValidation.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const CLEANUP_TIMEOUT_MS = 2_000;

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new ConfigurationError(
      'supabase_url_missing',
      'SUPABASE_URL is required for image storage.'
    );
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigurationError(
      'supabase_url_invalid',
      'SUPABASE_URL must be a valid URL.'
    );
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new ConfigurationError(
      'supabase_url_invalid',
      'SUPABASE_URL must use http or https.'
    );
  }
  // The service-role credential is sent in an Authorization header. Never
  // send it over plaintext to a remote host; plain HTTP is reserved for a
  // local Supabase emulator/stack.
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (parsed.protocol === 'http:' && !loopbackHosts.has(parsed.hostname)) {
    throw new ConfigurationError(
      'supabase_url_insecure',
      'SUPABASE_URL must use https for a remote host.'
    );
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ConfigurationError(
      'supabase_url_invalid',
      'SUPABASE_URL must not contain credentials, a query string, or a fragment.'
    );
  }

  return parsed.toString().replace(/\/+$/, '');
}

function requireServiceRoleKey(value) {
  const key = String(value || '').trim();
  if (!key) {
    throw new ConfigurationError(
      'supabase_service_role_key_missing',
      'SUPABASE_SERVICE_ROLE_KEY is required for image storage.'
    );
  }
  return key;
}

function encodeObjectPath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function safeTimeout(timeoutMs) {
  const parsed = Number(timeoutMs);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/**
 * Build a small Supabase Storage REST client.
 *
 * @param {object} deps
 * @param {string} deps.url Supabase project URL.
 * @param {string} deps.serviceRoleKey Supabase service-role secret.
 * @param {typeof fetch} [deps.fetchImpl] Injectable fetch for tests.
 * @param {number} [deps.timeoutMs] Per-request timeout.
 */
export function createSupabaseStorage({
  url,
  serviceRoleKey,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const baseUrl = normalizeBaseUrl(url);
  const key = requireServiceRoleKey(serviceRoleKey);
  const requestTimeoutMs = safeTimeout(timeoutMs);

  async function request(path, {
    method = 'GET',
    body = null,
    contentType = null,
    timeout = requestTimeoutMs,
    extraHeaders = null,
  } = {}) {
    const controller = new AbortController();
    let timer = null;
    let timedOut = false;

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(
          new UpstreamUnavailableError('Supabase Storage request timed out.', {
            code: 'supabase_timeout',
            status: 504,
            cleanupMayHaveSucceeded: true,
          })
        );
      }, safeTimeout(timeout));
    });

    let response;
    try {
      response = await Promise.race([
        fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            ...(contentType ? { 'Content-Type': contentType } : {}),
            ...(extraHeaders || {}),
          },
          ...(body ? { body } : {}),
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);
    } catch (error) {
      if (error && error.name === 'UpstreamUnavailableError') throw error;
      throw new UpstreamUnavailableError(
        timedOut ? 'Supabase Storage request timed out.' : 'Supabase Storage could not be reached.',
        {
          code: timedOut ? 'supabase_timeout' : 'supabase_unreachable',
          status: 504,
          cleanupMayHaveSucceeded: true,
        }
      );
    } finally {
      if (timer) clearTimeout(timer);
    }

    return response;
  }

  async function jsonBody(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  return {
    get baseUrl() {
      return baseUrl;
    },

    publicUrl(bucket, path) {
      // Profile images live in a private bucket and must only be exposed via
      // an expiring signed URL. Refuse to manufacture a public URL even if a
      // future caller accidentally passes the private bucket.
      if (bucket === STORAGE_BUCKETS.PROFILE_IMAGES) {
        throw new ConfigurationError(
          'private_bucket_public_url_forbidden',
          'Private profile images cannot be exposed through a public URL.'
        );
      }
      return `${baseUrl}/storage/v1/object/public/${encodeObjectPath(bucket)}/${encodeObjectPath(path)}`;
    },

    async upload(bucket, path, bytes, contentType) {
      const response = await request(
        `/storage/v1/object/${encodeObjectPath(bucket)}/${encodeObjectPath(path)}`,
        {
          method: 'POST',
          body: bytes,
          contentType,
          // Never overwrite an existing object. A retry uses a new generated
          // object name, while a stale client can never replace another asset.
          extraHeaders: { 'x-upsert': 'false' },
        }
      );

      if (!response.ok) {
        // The response body may contain internal details and must not be
        // propagated to the client or written to logs.
        if (response.status === 409) {
          throw new StorageConflictError(
            'The generated image object already exists.'
          );
        }
        throw new UpstreamUnavailableError(
          `Supabase Storage upload failed (${response.status}).`,
          {
            code: 'supabase_upload_failed',
            status: 503,
            // A 5xx response can still be ambiguous. A definitive 4xx did not
            // create the object and must never trigger deletion of an
            // existing object at the same path.
            cleanupMayHaveSucceeded: response.status >= 500,
          }
        );
      }

      const body = await jsonBody(response);
      return {
        bucket,
        path,
        id: body && body.Id ? body.Id : null,
      };
    },

    async remove(bucket, path, { timeout = CLEANUP_TIMEOUT_MS } = {}) {
      const response = await request(
        `/storage/v1/object/${encodeObjectPath(bucket)}/${encodeObjectPath(path)}`,
        { method: 'DELETE', timeout }
      );

      if (response.status === 404) return false;
      if (!response.ok) {
        throw new UpstreamUnavailableError(
          `Supabase Storage delete failed (${response.status}).`,
          {
            code: 'supabase_delete_failed',
            status: 503,
          }
        );
      }
      return true;
    },

    async createSignedUrl(bucket, path, expiresIn) {
      const response = await request(
        `/storage/v1/object/sign/${encodeObjectPath(bucket)}/${encodeObjectPath(path)}`,
        {
          method: 'POST',
          body: JSON.stringify({ expiresIn }),
          contentType: 'application/json',
        }
      );

      if (!response.ok) {
        throw new UpstreamUnavailableError(
          `Supabase Storage signing failed (${response.status}).`,
          {
            code: 'supabase_signing_failed',
            status: 503,
          }
        );
      }

      const body = await jsonBody(response);
      const signed = body && typeof body.signedURL === 'string' ? body.signedURL : '';
      if (!signed) {
        throw new UpstreamUnavailableError('Supabase Storage returned no signed URL.');
      }

      let resolved;
      if (signed.startsWith('http://') || signed.startsWith('https://')) {
        resolved = signed;
      } else if (signed.startsWith('/')) {
        // Supabase returns `/object/sign/...`; the Storage service base is
        // `{SUPABASE_URL}/storage/v1`.
        resolved = `${baseUrl}/storage/v1${signed}`;
      } else {
        throw new UpstreamUnavailableError('Supabase Storage returned an invalid signed URL.');
      }

      let parsed;
      try {
        parsed = new URL(resolved);
      } catch {
        throw new UpstreamUnavailableError('Supabase Storage returned an invalid signed URL.');
      }
      if (parsed.origin !== new URL(baseUrl).origin) {
        throw new UpstreamUnavailableError('Supabase Storage returned an invalid signed URL.');
      }
      return resolved;
    },
  };
}

export { DEFAULT_TIMEOUT_MS, CLEANUP_TIMEOUT_MS };
