import { NextResponse, type NextRequest } from 'next/server';
import {
  buildPrintExportCsv,
  buildRsvpExportCsv,
  buildSendListCsv,
} from '@/lib/services/exports';
import type { DashboardFilters, } from '@/lib/services/dashboard';
import type { DeliveryChannelName, Side } from '@/lib/services/types';

/**
 * PERMANENT. CSV downloads.
 *
 *   /api/admin/export/print  - mail merge for the card designer
 *   /api/admin/export/rsvps  - full RSVP state, honours ?side= and ?channel=
 *   /api/admin/export/send   - the send list
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = ['print', 'rsvps', 'send'] as const;
type Kind = (typeof KINDS)[number];

function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string }> },
): Promise<NextResponse> {
  const { kind } = await context.params;
  if (!isKind(kind)) {
    return NextResponse.json(
      { ok: false, error: { code: 'not_found', message: `Unknown export '${kind}'.` } },
      { status: 404 },
    );
  }

  const params = request.nextUrl.searchParams;
  const filters: DashboardFilters = {
    side: (params.get('side') as Side | 'all' | null) ?? 'all',
    channel: (params.get('channel') as DeliveryChannelName | 'all' | null) ?? 'all',
  };

  const csv =
    kind === 'print'
      ? await buildPrintExportCsv()
      : kind === 'send'
        ? await buildSendListCsv()
        : await buildRsvpExportCsv(filters);

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
