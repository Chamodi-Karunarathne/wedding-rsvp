import { DEFAULT_TIMEZONE } from '@/lib/domain/config';
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
 * It borrows notice.css from outside the route group rather than guest.css,
 * so that it and the 404 - which cannot depend on a disposable stylesheet -
 * stay identical to each other by construction.
 */

export const metadata = {
  title: 'Save the date',
};

export default function HoldingPage() {
  return (
    <main className="notice-ground">
      <div className="notice-corner" data-corner="top-left" aria-hidden="true">
        <img src={cardAsset('floral-corner.svg')} alt="" width={200} height={200} />
      </div>
      <div className="notice-corner" data-corner="bottom-right" aria-hidden="true">
        <img src={cardAsset('floral-corner.svg')} alt="" width={200} height={200} />
      </div>

      <div className="notice">
        <div className="notice-garland" aria-hidden="true">
          <img src={cardAsset('floral-garland.svg')} alt="" width={600} height={120} />
        </div>

        <h1 className="notice-title">Save the date</h1>
        <p className="notice-body">
          If you have received an invitation, please open it with the personal link printed
          on it or sent to you.
        </p>

        <hr className="notice-rule" />
        <p className="notice-fine">All times are {DEFAULT_TIMEZONE}</p>
      </div>
    </main>
  );
}
