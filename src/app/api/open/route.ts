import { z } from 'zod';
import { hasAdminSession } from '@/lib/api/guard';
import { limitOpenToken, limitPublicRequest } from '@/lib/api/public-limits';
import { jsonError, readJson, zodError } from '@/lib/api/respond';
import { isCrawler } from '@/lib/domain/crawler';
import { recordOpenByToken } from '@/lib/services/opens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const openRequestSchema = z.object({ token: z.string().min(1).max(64) });
const ignored = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

/** The mounted invitation reports a visible visit; previews never count. */
export async function POST(request: Request): Promise<Response> {
  const userAgent = request.headers.get('user-agent');
  if (isCrawler(userAgent) || await hasAdminSession()) return ignored();

  const limited = await limitPublicRequest(request, 'open');
  if (limited) return limited;

  const body = await readJson(request);
  if (!body.ok) return jsonError(body.error);
  const parsed = openRequestSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const tokenLimited = await limitOpenToken(parsed.data.token);
  if (tokenLimited) return tokenLimited;

  try {
    await recordOpenByToken(parsed.data.token, { userAgent });
  } catch {
    // Avoid logging token/connection details from driver errors. Analytics is
    // optional, and neither the invitation nor the guest needs an error dialog.
    console.error('Invitation open tracking unavailable.');
    return new Response(null, {
      status: 503,
      headers: { 'cache-control': 'no-store', 'retry-after': '30' },
    });
  }
  return ignored();
}
