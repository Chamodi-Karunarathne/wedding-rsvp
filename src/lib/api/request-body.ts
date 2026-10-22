import { HTTP_STATUS_BY_CODE, type Result, type ServiceError } from '../domain/result.ts';

export const JSON_BODY_LIMIT_BYTES = 64 * 1024;
export const LOGIN_BODY_LIMIT_BYTES = 2 * 1024;
export const CSV_IMPORT_BODY_LIMIT_BYTES = 1024 * 1024;

export type RequestBodyError = ServiceError | {
  code: 'payload_too_large' | 'unsupported_media_type';
  message: string;
  field?: string;
};

export function requestErrorStatus(error: RequestBodyError): number {
  return error.code === 'payload_too_large' ? 413
    : error.code === 'unsupported_media_type' ? 415 : HTTP_STATUS_BY_CODE[error.code];
}

/** Origin-less non-browser clients remain supported; any supplied Origin must match. */
export function requestOriginError(request: Request, trustedOrigin?: string): RequestBodyError | null {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return { code: 'forbidden', message: 'This request must come from this site.' };
  }
  const origin = request.headers.get('origin');
  if (origin === null) return null;
  try {
    if (origin !== new URL(trustedOrigin ?? request.url).origin) {
      return { code: 'forbidden', message: 'This request must come from this site.' };
    }
  } catch {
    return { code: 'forbidden', message: 'This request must come from this site.' };
  }
  return null;
}

export function requestBodyLimit(request: Request): number {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  if (path === '/api/admin/login') return LOGIN_BODY_LIMIT_BYTES;
  if (path === '/api/open') return LOGIN_BODY_LIMIT_BYTES;
  if (path === '/api/admin/import') return CSV_IMPORT_BODY_LIMIT_BYTES;
  return JSON_BODY_LIMIT_BYTES;
}

/** Stream and count actual bytes before JSON.parse; Content-Length is only an early check. */
export async function readJsonBody(
  request: Request,
  options: { maxBytes?: number; trustedOrigin?: string } = {},
): Promise<Result<unknown, RequestBodyError>> {
  const originError = requestOriginError(request, options.trustedOrigin);
  if (originError) return { ok: false, error: originError };
  const mediaType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return { ok: false, error: { code: 'unsupported_media_type', message: 'Content-Type must be application/json.' } };
  }

  const maxBytes = options.maxBytes ?? requestBodyLimit(request);
  const tooLarge = (): Result<never, RequestBodyError> => ({
    ok: false, error: { code: 'payload_too_large', message: `Request body exceeds ${maxBytes} bytes.` },
  });
  const length = request.headers.get('content-length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > maxBytes) {
    void request.body?.cancel().catch(() => {});
    return tooLarge();
  }

  const malformed = (): Result<never, RequestBodyError> => ({
    ok: false, error: { code: 'validation', message: 'Request body must be valid JSON.' },
  });
  if (!request.body || request.body.locked) return malformed();

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        return tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    void reader.cancel().catch(() => {});
    return malformed();
  } finally {
    reader.releaseLock();
  }
}
