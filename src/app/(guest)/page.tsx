import { cardAsset } from '@/lib/domain/card-assets';
import '../notice.css';

/*
 * DISPOSABLE. Holding page.
 *
 * Dressed like the invitation, but it still says nothing it should not: this
 * page is reachable by anybody who types the bare domain, so it carries no
 * names, no date and no venue. Only that an invitation exists and that a guest
 * needs their own link to open it.
 *
 * It borrows notice.css from outside the route group, with holding-only
 * refinements so the permanent 404 keeps its own standalone styling.
 */

export const metadata = {
  title: 'Save the date',
};

export default function HoldingPage() {
  return (
    <main className="notice-ground notice-ground--holding">
      <div className="notice-corner" data-corner="top-left" aria-hidden="true">
        <img src="/card/rose-corner-upper.1e4c20dbac.webp" alt="" width={512} height={512} />
      </div>
      <div className="notice-corner" data-corner="bottom-right" aria-hidden="true">
        <img src="/card/rose-corner-lower.6277f50c09.webp" alt="" width={512} height={512} />
      </div>

      <div className="notice notice--holding">
        <div className="notice-garland" aria-hidden="true">
          <img src="/card/rose-corner-upper.1e4c20dbac.webp" alt="" width={512} height={512} />
        </div>

        <img
          className="notice-monogram"
          src={cardAsset('monogram.svg')}
          alt=""
          aria-hidden="true"
          width={110}
          height={73}
        />
        <p className="notice-eyebrow">A celebration of love</p>
        <h1 className="notice-title">Save the date</h1>
        <hr className="notice-rule" aria-hidden="true" />
        <p className="notice-body">
          Please open the personal invitation link sent to you to view the details and reply.
        </p>
      </div>
    </main>
  );
}
