import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { HTTP_STATUS_BY_CODE, type Result, type ServiceError } from '@/lib/domain/result';

/**
 * PERMANENT. The single place a service Result becomes an HTTP response, so
 * every endpoint maps errors to statuses identically.
 */

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status: 200, ...init });
}

export function jsonError(error: ServiceError): NextResponse {
  return NextResponse.json(
    { ok: false, error },
    { status: HTTP_STATUS_BY_CODE[error.code] },
  );
}

/** Turns a Zod failure into a 400 that names the field and says why. */
export function zodError(error: z.ZodError): NextResponse {
  const issue = error.issues[0];
  const field = issue?.path.join('.') ?? '';
  return jsonError({
    code: 'validation',
    message: issue ? `${field || 'body'}: ${issue.message}` : 'Invalid request body.',
    ...(field ? { field } : {}),
  });
}

export function fromResult<T>(
  result: Result<T, ServiceError>,
  toBody: (data: T) => Record<string, unknown>,
): NextResponse {
  return result.ok ? jsonOk(toBody(result.data)) : jsonError(result.error);
}

export async function readJson(request: Request): Promise<Result<unknown, ServiceError>> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return {
      ok: false,
      error: { code: 'validation', message: 'Request body must be valid JSON.' },
    };
  }
}
