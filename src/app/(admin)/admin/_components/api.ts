'use client';

/** Existing endpoints remain the source of validation; this helper presents their results. */
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
      if (response.status === 401 && !url.endsWith('/login'))
        return { ok: false, message: 'Your session has ended. Sign in again, then try saving.' };
      if (response.status >= 500) {
        console.error('Admin request failed', { url, status: response.status });
        return {
          ok: false,
          message:
            'We couldn’t save that right now. Please try again. If it keeps happening, contact the person who set up the website.',
        };
      }
      const message =
        parsed &&
        typeof parsed === 'object' &&
        'error' in parsed &&
        typeof (parsed as { error?: { message?: unknown } }).error?.message === 'string'
          ? (parsed as { error: { message: string } }).error.message
          : 'That could not be saved. Check the details and try again.';
      return { ok: false, message };
    }
    if (!parsed || typeof parsed !== 'object' || !('ok' in parsed) || parsed.ok !== true) {
      console.error('Admin response was not understood', { url, status: response.status });
      return {
        ok: false,
        message:
          'The website did not confirm this action. Please check the page before trying again.',
      };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch (error) {
    console.error('Admin connection failed', error);
    return {
      ok: false,
      message: 'We couldn’t reach the website. Check your connection and try again.',
    };
  }
}
