import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api/guard';
import { buildGuestListCsv, buildRsvpExportCsv, buildSendListCsv } from '@/lib/services/exports';
import type { TableSearchParams } from '@/lib/domain/admin-tables';

/**
 * PERMANENT. CSV downloads.
 *
 *   /api/admin/export/rsvps  - full RSVP state for the selected event scope
 *   /api/admin/export/send   - invitation links and delivery progress
 *   /api/admin/export/guests - editable guest list for CSV re-import
 *
 * Every download honors the corresponding table's filters and sorting.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = ['rsvps', 'send', 'guests'] as const;
type Kind = (typeof KINDS)[number];

function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string }> },
): Promise<NextResponse> {
  // Checked before the kind is even parsed: this endpoint hands back every
  // household in one response, so it is the last place to rely on the proxy
  // alone.
  const denied = await requireAdmin();
  if (denied) return denied;

  const { kind } = await context.params;
  if (!isKind(kind)) {
    return NextResponse.json(
      { ok: false, error: { code: 'not_found', message: `Unknown export '${kind}'.` } },
      { status: 404 },
    );
  }

  const params = request.nextUrl.searchParams;
  // Match page searchParams exactly: repeated keys remain arrays so the shared
  // parser can discard ambiguous values rather than choosing one silently.
  const filters: TableSearchParams = Object.fromEntries(
    Array.from(new Set(params.keys()), (key) => {
      const values = params.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    }),
  );

  const csv = kind === 'guests' ? await buildGuestListCsv(undefined, filters)
    : kind === 'send' ? await buildSendListCsv(undefined, filters) : await buildRsvpExportCsv(filters);

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      // charset=utf-8 plus the BOM that toCsv writes: between them, Excel
      // opens Sinhala names correctly instead of as mojibake.
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="wedding-${kind}-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
