const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'access_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'password',
  'auth',
  'signature',
]);

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
]);

export function sanitizeUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl, 'http://127.0.0.1');
    for (const [key] of url.searchParams) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        url.searchParams.set(key, '[REDACTED]');
      }
    }
    if (rawUrl.startsWith('/')) {
      return url.pathname + url.search;
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function sanitizeAttributes(
  attributes: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(attributes)) {
    const lowerKey = key.toLowerCase();

    if (
      Array.from(SENSITIVE_HEADERS).some((h) => lowerKey.includes(h)) ||
      Array.from(SENSITIVE_QUERY_PARAMS).some((p) => lowerKey.includes(p))
    ) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'string' && (lowerKey.includes('url') || lowerKey.includes('target'))) {
      sanitized[key] = sanitizeUrl(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

