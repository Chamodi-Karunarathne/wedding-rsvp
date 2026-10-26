/** Bound optional analytics requests so a stalled connection cannot block
 * all later visible visits. The caller contains failures and handles retries. */
export async function sendOpenRequest(token: string, {
  fetchTransport = fetch,
  timeoutMs = 10_000,
}: { fetchTransport?: typeof fetch; timeoutMs?: number } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchTransport('/api/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'same-origin',
      keepalive: true,
      signal: controller.signal,
    });
    return { status: response.status, retryAfter: response.headers.get('retry-after') };
  } finally {
    clearTimeout(timeout);
  }
}
