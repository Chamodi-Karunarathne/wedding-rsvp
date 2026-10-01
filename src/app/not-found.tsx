import { copyFor } from '@/lib/copy';
import './notice.css';

/*
 * Root not-found. Lives outside the (guest) route group so that deleting the
 * guest UI does not take it with it. Reached by an unknown invitation token -
 * which, for a link sent personally over WhatsApp, usually means a household
 * whose message was forwarded or truncated. It is the last thing they see, so
 * it is dressed like the rest of the invitation rather than left as a bare
 * heading on white.
 */

export default function NotFound() {
  const copy = copyFor('en');

  return (
    <main className="notice-ground">
      <div className="notice-corner" data-corner="top-left" aria-hidden="true">
        <img src="/card/rose-corner-upper.1e4c20dbac.webp" alt="" width={512} height={512} />
      </div>
      <div className="notice-corner" data-corner="bottom-right" aria-hidden="true">
        <img src="/card/rose-corner-lower.6277f50c09.webp" alt="" width={512} height={512} />
      </div>

      <div className="notice">
        <div className="notice-garland" aria-hidden="true">
          <img src="/card/rose-corner-upper.1e4c20dbac.webp" alt="" width={512} height={512} />
        </div>

        <h1 className="notice-title">{copy.notFound.heading}</h1>
        <p className="notice-body">{copy.notFound.body}</p>
      </div>
    </main>
  );
}
