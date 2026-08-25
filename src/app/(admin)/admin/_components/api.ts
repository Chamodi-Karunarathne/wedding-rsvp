'use client';

/** Shared client helper: POST JSON to an admin endpoint and surface the error
 *  message the API returned rather than a generic one. */
export async function postJson(
  url: string,
  body: unknown,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; message: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const parsed: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        parsed &&
        typeof parsed === 'object' &&
        'error' in parsed &&
        typeof (parsed as { error?: { message?: unknown } }).error?.message === 'string'
          ? (parsed as { error: { message: string } }).error.message
          : `Request failed (${response.status}).`;
      return { ok: false, message };
    }

    return { ok: true, data: (parsed as Record<string, unknown>) ?? {} };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error.' };
  }
}
