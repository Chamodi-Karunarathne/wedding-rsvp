const MIN_VISIT_INTERVAL_MS = 5_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

type OpenResult = { status: number; retryAfter: string | null };
type TrackingEnvironment = {
  now(): number;
  isVisible(): boolean;
  isOnline(): boolean;
  send(): Promise<OpenResult>;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(timer: unknown): void;
};

function retryDelay(value: string | null, now: number, attempt: number): number {
  const seconds = value !== null && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  const deadline = value === null ? NaN : Date.parse(value);
  const delay = Number.isFinite(seconds) ? seconds * 1_000
    : Number.isFinite(deadline) ? deadline - now : attempt === 1 ? 1_000 : 5_000;
  return Math.max(0, Math.min(MAX_RETRY_DELAY_MS, delay));
}

/** A visible visit is an event, not a heartbeat. Restores and failed requests
 * can be reported without recording hidden tabs or repeatedly polling storage. */
export function createOpenTracking(environment: TrackingEnvironment) {
  let active = false;
  let visible = false;
  let pending = false;
  let inFlight = false;
  let queuedVisit = false;
  let requestStartedAt = -Infinity;
  let attempts = 0;
  let lastSuccess = -Infinity;
  let retryAt = 0;
  let timer: unknown;

  function clearTimer() {
    if (timer !== undefined) environment.clearTimeout(timer);
    timer = undefined;
  }

  function tryRecord() {
    if (!active || !pending || inFlight || attempts >= MAX_ATTEMPTS ||
        !environment.isVisible() || !environment.isOnline()) return;
    clearTimer();
    const delay = retryAt - environment.now();
    if (delay > 0) {
      timer = environment.setTimeout(() => { timer = undefined; tryRecord(); }, delay);
      return;
    }
    inFlight = true;
    requestStartedAt = environment.now();
    attempts += 1;
    // Promise.resolve also contains a synchronous error from the transport.
    void Promise.resolve().then(() => environment.send()).then(result => {
      if (result.status >= 200 && result.status < 300) {
        pending = queuedVisit && environment.isVisible();
        if (pending) attempts = 0;
        // A slow response acknowledges the earlier visit, not the time its
        // response arrived. A later visible return must not be swallowed.
        lastSuccess = requestStartedAt;
        retryAt = 0;
      } else if (result.status === 429 || result.status >= 500) {
        retryAt = environment.now() + retryDelay(result.retryAfter, environment.now(), attempts);
        if (queuedVisit) attempts = 0;
      } else {
        pending = false; // Invalid/forbidden requests will not improve on retry.
      }
    }, () => {
      retryAt = environment.now() + retryDelay(null, environment.now(), attempts);
      if (queuedVisit) attempts = 0;
    }).finally(() => {
      inFlight = false;
      queuedVisit = false;
      // stop() cancels all future work; a StrictMode restart uses this same
      // controller, so the existing request still completes only once.
      if (active) tryRecord();
    });
  }

  function beginVisit() {
    if (inFlight) {
      if (environment.now() - requestStartedAt >= MIN_VISIT_INTERVAL_MS) queuedVisit = true;
      return;
    }
    if (environment.now() - lastSuccess < MIN_VISIT_INTERVAL_MS) return;
    pending = true;
    attempts = 0;
    // Retain Retry-After across a rapid hide/show or offline/online change.
    tryRecord();
  }

  function visibilityChanged() {
    if (!active) return;
    const wasVisible = visible;
    visible = environment.isVisible();
    if (!visible) { clearTimer(); return; }
    if (!wasVisible) beginVisit();
    else tryRecord();
  }

  return {
    start() { active = true; visibilityChanged(); },
    stop() { active = false; clearTimer(); },
    visibilityChanged,
    pageShown(persisted: boolean) {
      if (!active) return;
      if (!environment.isVisible()) { visible = false; clearTimer(); return; }
      visible = true;
      if (persisted) beginVisit();
    },
    online() { tryRecord(); },
  };
}
