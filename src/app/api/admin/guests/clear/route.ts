import { requireAdmin } from '@/lib/api/guard';
import { clearGuestsSchema } from '@/lib/api/schemas';
import { jsonError, jsonOk, readJson, zodError } from '@/lib/api/respond';
import { clearAllGuests } from '@/lib/services/clear-guests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  if (!body.ok) return jsonError(body.error);
  const parsed = clearGuestsSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);
  try {
    const result = await clearAllGuests(parsed.data);
    return result.ok ? jsonOk(result.data, { headers: { 'cache-control': 'no-store' } }) : jsonError(result.error);
  } catch {
    console.error('Clearing the guest list failed.');
    return jsonError({ code: 'internal', message: 'The guest list could not be cleared. Refresh the page and check before trying again.' });
  }
}
