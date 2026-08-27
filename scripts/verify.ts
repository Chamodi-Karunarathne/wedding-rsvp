import { Pool, neonConfig } from '@neondatabase/serverless';
import { loadEnv, requireEnv } from '../src/db/load-env.ts';
import { generateToken } from '../src/lib/domain/ids.ts';

/**
 * Checks the acceptance criteria that need a live database and a running
 * server. Run `pnpm db:seed`, start `pnpm dev`, then `pnpm verify`.
 *
 * Deliberately talks to Postgres directly and to the app over HTTP, rather
 * than importing the services - so it verifies the system as a caller sees it,
 * not as the code hopes it behaves.
 */

loadEnv();

const BASE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

type GuestRecord = {
  id: string;
  token: string;
  display_name: string;
  max_party_size: number;
};

async function main(): Promise<void> {
  const url = requireEnv('DATABASE_URL');
  if (!neonConfig.webSocketConstructor && typeof globalThis.WebSocket !== 'undefined') {
    neonConfig.webSocketConstructor = globalThis.WebSocket as never;
  }
  const pool = new Pool({ connectionString: url, max: 1 });

  try {
    /* --- 1: seed shape ------------------------------------------------- */
    console.log('\n[1] Seed produces exactly one event and ~20 guests with unique ids');

    const events = await pool.query<{ slug: string; id: string; name: string }>(
      'SELECT id, slug, name FROM events ORDER BY sort_order',
    );
    const guests = await pool.query<GuestRecord>(
      'SELECT id, token, display_name, max_party_size FROM guests ORDER BY sort_name',
    );

    check('exactly one event', events.rowCount === 1, `got ${events.rowCount}`);
    check(
      '~20 guests',
      (guests.rowCount ?? 0) >= 18 && (guests.rowCount ?? 0) <= 25,
      `got ${guests.rowCount}`,
    );
    check(
      'all tokens unique',
      new Set(guests.rows.map((g) => g.token)).size === guests.rowCount,
    );

    const sample = guests.rows[0];
    if (!sample) throw new Error('No guests seeded - run pnpm db:seed first.');

    /* --- 2: invitation renders ----------------------------------------- */
    console.log('\n[2] /i/<token> renders the guest and only their events');

    // A guest invited to exactly one event, to prove filtering.
    const partial = await pool.query<GuestRecord & { slug: string }>(
      `SELECT g.id, g.token, g.display_name, g.max_party_size, e.slug
         FROM guests g
         JOIN invitations i ON i.guest_id = g.id
         JOIN events e ON e.id = i.event_id
        WHERE (SELECT COUNT(*) FROM invitations x WHERE x.guest_id = g.id) = 1
        LIMIT 1`,
    );

    const invitePage = await fetch(`${BASE}/i/${sample.token}`);
    const inviteHtml = await invitePage.text();
    check('200 for a seeded token', invitePage.status === 200, `got ${invitePage.status}`);
    check(
      'renders the display name',
      inviteHtml.includes(escapeHtml(sample.display_name)),
      `looking for "${sample.display_name}"`,
    );
    check(
      'sends X-Robots-Tag: noindex',
      (invitePage.headers.get('x-robots-tag') ?? '').includes('noindex'),
    );

    const single = partial.rows[0];
    if (single) {
      const singlePage = await fetch(`${BASE}/i/${single.token}`);
      const singleHtml = await singlePage.text();
      // Only meaningful once a second event exists. With one event there is
      // nothing to leak, so the check waits rather than failing.
      const otherEvent = events.rows.find((e) => e.slug !== single.slug);
      if (otherEvent) {
        check(
          'shows only the events this guest is invited to',
          !singleHtml.includes(otherEvent.name),
          `"${single.display_name}" is invited only to ${single.slug}, but ${otherEvent.name} appeared`,
        );
      } else {
        console.log('  SKIP  only-their-events (there is a single event)');
      }
    }

    /* --- 3 & 4: unknown tokens ---------------------------------------- */
    console.log('\n[3,4] an unknown token 404s');

    let unknownToken = generateToken();
    while (guests.rows.some((g) => g.token === unknownToken)) unknownToken = generateToken();

    const missingToken = await fetch(`${BASE}/i/${unknownToken}`);
    check('unknown token 404s', missingToken.status === 404, `got ${missingToken.status}`);

    /* --- 5, 6, 7, 8: the RSVP endpoint --------------------------------- */
    console.log('\n[5,6,7,8] RSVP persists, upserts, and rejects correctly');

    const target = guests.rows.find((g) => g.max_party_size >= 2) ?? sample;
    const targetEvents = await pool.query<{ slug: string }>(
      `SELECT e.slug FROM invitations i JOIN events e ON e.id = i.event_id
        WHERE i.guest_id = $1 ORDER BY e.sort_order`,
      [target.id],
    );
    const slug = targetEvents.rows[0]?.slug;
    if (!slug) throw new Error('Target guest has no invitations.');

    const post = (body: unknown) =>
      fetch(`${BASE}/api/rsvp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    const first = await post({
      token: target.token,
      responses: [
        { eventSlug: slug, attending: true, partyCount: 2, attendeeNames: 'Verify One, Two' },
      ],
      message: 'verification run',
    });
    check('first submission returns 200', first.status === 200, `got ${first.status}`);

    const storedAfterFirst = await pool.query<{ party_count: number; count: string }>(
      `SELECT party_count, (SELECT COUNT(*) FROM rsvps r2
          WHERE r2.guest_id = $1 AND r2.event_id = (SELECT id FROM events WHERE slug = $2)) AS count
         FROM rsvps r
        WHERE r.guest_id = $1 AND r.event_id = (SELECT id FROM events WHERE slug = $2)`,
      [target.id, slug],
    );
    check(
      'response persisted with the right party count',
      storedAfterFirst.rows[0]?.party_count === 2,
      `got ${storedAfterFirst.rows[0]?.party_count}`,
    );

    const second = await post({
      token: target.token,
      responses: [{ eventSlug: slug, attending: true, partyCount: 1, attendeeNames: 'Just One' }],
    });
    const storedAfterSecond = await pool.query<{
      party_count: number;
      count: string;
      submitted_at: Date;
      updated_at: Date;
    }>(
      `SELECT party_count, submitted_at, updated_at,
              (SELECT COUNT(*) FROM rsvps r2
                WHERE r2.guest_id = $1 AND r2.event_id = (SELECT id FROM events WHERE slug = $2)) AS count
         FROM rsvps r
        WHERE r.guest_id = $1 AND r.event_id = (SELECT id FROM events WHERE slug = $2)`,
      [target.id, slug],
    );

    check('re-submission returns 200', second.status === 200, `got ${second.status}`);
    check(
      'updated in place - still exactly one row',
      storedAfterSecond.rows[0]?.count === '1',
      `found ${storedAfterSecond.rows[0]?.count} rows`,
    );
    check(
      'the value changed',
      storedAfterSecond.rows[0]?.party_count === 1,
      `got ${storedAfterSecond.rows[0]?.party_count}`,
    );
    check(
      'updated_at moved but submitted_at did not',
      !!storedAfterSecond.rows[0] &&
        storedAfterSecond.rows[0].updated_at > storedAfterSecond.rows[0].submitted_at,
    );

    const tooMany = await post({
      token: target.token,
      responses: [{ eventSlug: slug, attending: true, partyCount: target.max_party_size + 5 }],
    });
    const tooManyBody = (await tooMany.json()) as { error?: { message?: string } };
    check('party size over the limit returns 400', tooMany.status === 400, `got ${tooMany.status}`);
    check(
      'and the message is actually useful',
      !!tooManyBody.error?.message?.includes(String(target.max_party_size)),
      `message was: ${tooManyBody.error?.message}`,
    );

    // A guest invited to only one event, asked about the other.
    if (single) {
      const otherEvent = events.rows.find((e) => e.slug !== single.slug);
      if (otherEvent) {
        const forbidden = await post({
          token: single.token,
          responses: [{ eventSlug: otherEvent.slug, attending: true, partyCount: 1 }],
        });
        check(
          'RSVP to an uninvited event returns 403',
          forbidden.status === 403,
          `got ${forbidden.status}`,
        );
      }
    }

    const badToken = await post({
      token: unknownToken,
      responses: [{ eventSlug: slug, attending: true, partyCount: 1 }],
    });
    check('RSVP with an unknown token returns 404', badToken.status === 404, `got ${badToken.status}`);

    /* --- 12: a self-submission over a phone entry keeps the old answer --- */
    console.log('\n[12] Overwriting a phone-recorded RSVP writes rsvp_history');

    const phoneRecorded = await pool.query<{ id: string; token: string; party_count: number }>(
      `SELECT g.id, g.token, r.party_count
         FROM guests g JOIN rsvps r ON r.guest_id = g.id
        WHERE r.source = 'phone' LIMIT 1`,
    );
    const recorded = phoneRecorded.rows[0];

    if (!recorded) {
      check('a phone-recorded RSVP exists to overwrite', false, 'none in the database');
    } else {
      const historyBefore = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM rsvp_history WHERE guest_id = $1',
        [recorded.id],
      );

      const overwrite = await post({
        token: recorded.token,
        responses: [{ eventSlug: slug, attending: true, partyCount: 1, attendeeNames: 'Just me' }],
      });
      check('the guest may overwrite it', overwrite.status === 200, `got ${overwrite.status}`);

      const current = await pool.query<{ source: string; party_count: number }>(
        'SELECT source, party_count FROM rsvps WHERE guest_id = $1',
        [recorded.id],
      );
      check(
        'the current answer is now theirs',
        current.rows[0]?.source === 'self' && current.rows[0]?.party_count === 1,
        `got source ${current.rows[0]?.source}, party ${current.rows[0]?.party_count}`,
      );

      const history = await pool.query<{
        source: string;
        party_count: number;
        recorded_by: string | null;
      }>(
        `SELECT source, party_count, recorded_by FROM rsvp_history
          WHERE guest_id = $1 ORDER BY superseded_at DESC LIMIT 1`,
        [recorded.id],
      );
      const before = Number(historyBefore.rows[0]?.count ?? 0);
      const after = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM rsvp_history WHERE guest_id = $1',
        [recorded.id],
      );

      check(
        'a history row was written',
        Number(after.rows[0]?.count ?? 0) === before + 1,
        `went from ${before} to ${after.rows[0]?.count}`,
      );
      check(
        'and it keeps the phone answer, not the new one',
        history.rows[0]?.source === 'phone' &&
          history.rows[0]?.party_count === recorded.party_count,
        `kept source ${history.rows[0]?.source}, party ${history.rows[0]?.party_count}`,
      );
      check(
        'including who took the call',
        !!history.rows[0]?.recorded_by,
        'recorded_by was empty',
      );
    }

    /* --- 11: send export ----------------------------------------------- */
    console.log('\n[11] Send export contains name, phone and an absolute invitation URL');

    const login = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD ?? '' }),
    });
    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    check('admin login succeeds', login.status === 200, `got ${login.status}`);

    if (cookie) {
      const csvResponse = await fetch(`${BASE}/api/admin/export/send`, {
        headers: { cookie },
      });
      const csv = await csvResponse.text();
      const header = csv.split('\r\n')[0] ?? '';

      check('export returns 200', csvResponse.status === 200, `got ${csvResponse.status}`);
      check('starts with a UTF-8 BOM so Excel reads it correctly', csv.charCodeAt(0) === 0xfeff);
      for (const column of ['display_name', 'phone', 'invitation_url', 'channels']) {
        check(`has a ${column} column`, header.includes(column));
      }
      check(
        'invitation URLs are absolute',
        csv.includes(`${BASE}/i/`),
        `expected URLs starting ${BASE}/i/`,
      );

      const dataRows = csv.trim().split('\r\n').length - 1;
      check(
        'one row per guest',
        dataRows === guests.rowCount,
        `csv had ${dataRows}, database has ${guests.rowCount}`,
      );
    }

    /* --- 13: recording a response on a guest's behalf -------------------- */
    console.log('\n[13] A phone response recorded in admin saves source and recorded_by');

    if (cookie) {
      const subject = guests.rows.find((g) => g.id !== recorded?.id) ?? sample;

      const proxied = await fetch(`${BASE}/api/admin/rsvp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          guestId: subject.id,
          responses: [{ eventSlug: slug, attending: true, partyCount: 1 }],
          recordedBy: 'verify script',
          source: 'phone',
        }),
      });
      check('proxy RSVP returns 200', proxied.status === 200, `got ${proxied.status}`);

      const stored = await pool.query<{ source: string; recorded_by: string | null }>(
        'SELECT source, recorded_by FROM rsvps WHERE guest_id = $1',
        [subject.id],
      );
      check(
        "saved with source 'phone'",
        stored.rows[0]?.source === 'phone',
        `got ${stored.rows[0]?.source}`,
      );
      check(
        'and with recorded_by set',
        stored.rows[0]?.recorded_by === 'verify script',
        `got ${stored.rows[0]?.recorded_by}`,
      );
    }

    /* --- 9: admin gate -------------------------------------------------- */
    console.log('\n[9] /admin without a cookie redirects to /admin/login');
    const noCookie = await fetch(`${BASE}/admin`, { redirect: 'manual' });
    check(
      'redirects',
      noCookie.status >= 300 &&
        noCookie.status < 400 &&
        (noCookie.headers.get('location') ?? '').includes('/admin/login'),
      `status ${noCookie.status}, location ${noCookie.headers.get('location')}`,
    );

    /* --- summary -------------------------------------------------------- */
    console.log(`\n${passed} passed, ${failed} failed.\n`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

main().catch((error: unknown) => {
  console.error('\nVerification could not run:');
  console.error(error instanceof Error ? error.message : error);
  console.error('\nIs the dev server running, and DATABASE_URL set?');
  process.exit(1);
});
