/**
 * PERMANENT. Services return these instead of throwing for expected failures.
 * Thrown exceptions are reserved for genuine bugs and infrastructure faults.
 */

export type Ok<T> = { ok: true; data: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = ServiceError> = Ok<T> | Err<E>;

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Maps 1:1 onto an HTTP status in the route handlers. */
export type ServiceErrorCode =
  | 'not_found' // 404
  | 'forbidden' // 403
  | 'validation' // 400
  | 'conflict' // 409
  | 'internal'; // 500

export type ServiceError = {
  code: ServiceErrorCode;
  /** Safe to show a guest. Never contains internals. */
  message: string;
  /** Which input field was at fault, for `validation`. */
  field?: string;
};

export function serviceError(
  code: ServiceErrorCode,
  message: string,
  field?: string,
): Err<ServiceError> {
  return err(field === undefined ? { code, message } : { code, message, field });
}

export const HTTP_STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  validation: 400,
  conflict: 409,
  internal: 500,
};
