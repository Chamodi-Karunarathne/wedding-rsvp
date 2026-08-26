import { DEFAULT_TIMEZONE } from '@/lib/domain/config';

/*
 * DISPOSABLE. Holding page. Deliberately unstyled and uninformative - it is
 * public in the sense that anyone could reach it, so it must not leak names,
 * dates or venues.
 */

export const metadata = {
  title: 'Save the date',
};

export default function HoldingPage() {
  return (
    <main>
      <h1 className="text-xl font-semibold">Save the date</h1>
      <p className="mt-2">
        If you have received an invitation, please use the personal link or short code
        printed on it.
      </p>
      <p className="mt-2 text-sm text-gray-500">All times are {DEFAULT_TIMEZONE}.</p>
    </main>
  );
}
