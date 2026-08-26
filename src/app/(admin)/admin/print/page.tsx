import { qrUrl, shortCodeUrl } from '@/lib/domain/urls';
import { listGuests } from '@/lib/services/guests';

export const dynamic = 'force-dynamic';

export default async function AdminPrintPage() {
  const guests = await listGuests();
  const printing = guests.filter((row) => row.channels.some((c) => c.channel === 'print'));
  const missingAddress = printing.filter((row) => !row.guest.postalAddress);

  return (
    <main>
      <h1 className="text-xl font-semibold">Print export</h1>
      <p className="text-sm text-gray-600">
        Everyone with a <code>print</code> delivery channel. This CSV feeds the card designer&apos;s
        mail merge.
      </p>

      <div className="mt-3 border p-3 text-sm">
        <p className="font-medium">Before sending this to the printer</p>
        <p className="mt-1">
          The QR URLs below are built from <code>NEXT_PUBLIC_SITE_URL</code>, which is currently{' '}
          <code>{process.env.NEXT_PUBLIC_SITE_URL ?? '(not set)'}</code>. Once cards are printed
          this cannot be changed. Confirm it is the final production domain.
        </p>
      </div>

      <p className="mt-3">
        <a href="/api/admin/export/print" className="underline">
          Download print CSV
        </a>{' '}
        <span className="text-sm text-gray-600">
          ({printing.length} guests, UTF-8 with BOM so Excel reads Sinhala names correctly)
        </span>
      </p>

      {missingAddress.length > 0 && (
        <p className="mt-3 text-sm text-red-700">
          {missingAddress.length} guest(s) on the print list have no postal address:{' '}
          {missingAddress.map((row) => row.guest.displayName).join(', ')}
        </p>
      )}

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            {['Name', 'Postal address', 'Code', 'QR URL'].map((h) => (
              <th key={h} className="border px-2 py-1 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {printing.map((row) => (
            <tr key={row.guest.id}>
              <td className="border px-2 py-1 wrap-break-word">{row.guest.displayName}</td>
              <td className="border px-2 py-1 wrap-break-word">
                {row.guest.postalAddress ?? <span className="text-red-700">missing</span>}
              </td>
              <td className="border px-2 py-1 font-mono">{row.guest.shortCode}</td>
              <td className="border px-2 py-1 break-all text-xs">
                <a href={qrUrl(row.guest.shortCode)} target="_blank" rel="noreferrer noopener">
                  {qrUrl(row.guest.shortCode)}
                </a>
                <br />
                <span className="text-gray-600">scans to {shortCodeUrl(row.guest.shortCode)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
