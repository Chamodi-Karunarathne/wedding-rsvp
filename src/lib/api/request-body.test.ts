import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CSV_IMPORT_BODY_LIMIT_BYTES,
  JSON_BODY_LIMIT_BYTES,
  LOGIN_BODY_LIMIT_BYTES,
  readJsonBody,
  requestBodyLimit,
  requestErrorStatus,
} from './request-body.ts';

const encoder = new TextEncoder();
function request(body: string | ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new Request('https://wedding.example/api/rsvp', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('bounded JSON requests', () => {
  it('accepts exact byte limits and decodes UTF-8 split between chunks', async () => {
    const bytes = encoder.encode('"අ"');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2));
        controller.enqueue(bytes.slice(2));
        controller.close();
      },
    });
    assert.deepEqual(await readJsonBody(request(body), { maxBytes: bytes.length }), { ok: true, data: 'අ' });
  });

  it('counts bytes rather than characters, without relying on Content-Length', async () => {
    const result = await readJsonBody(request('"අ"', { 'content-length': '1' }), { maxBytes: 4 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'payload_too_large');
      assert.equal(requestErrorStatus(result.error), 413);
    }
  });

  it('stops and cancels a chunked body once it exceeds the byte limit', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"name":'));
        controller.enqueue(encoder.encode('"' + 'x'.repeat(50)));
      },
      cancel() { cancelled = true; },
    });
    const result = await readJsonBody(request(body), { maxBytes: 16 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'payload_too_large');
    assert.equal(cancelled, true);
  });

  it('rejects excessive declared length before attempting JSON parsing', async () => {
    const result = await readJsonBody(request('not JSON', { 'content-length': '1000000' }), { maxBytes: 16 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'payload_too_large');
  });

  it('returns validation errors for malformed JSON and invalid UTF-8', async () => {
    for (const body of ['{', '', '[1,', 'undefined']) {
      const result = await readJsonBody(request(body));
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, 'validation');
        assert.equal(requestErrorStatus(result.error), 400);
      }
    }
    const invalid = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([34, 255, 34])); controller.close(); },
    });
    const result = await readJsonBody(request(invalid));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'validation');
  });

  it('requires JSON media type, while accepting its normal charset parameter', async () => {
    const rejected = await readJsonBody(request('{}', { 'content-type': 'text/plain' }));
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.error.code, 'unsupported_media_type');
      assert.equal(requestErrorStatus(rejected.error), 415);
    }
    assert.deepEqual(await readJsonBody(request('{}', { 'content-type': 'application/json; charset=utf-8' })), {
      ok: true, data: {},
    });
  });

  it('rejects cross-origin and null origins, but permits the site and Origin-less CLI clients', async () => {
    for (const origin of ['https://evil.example', 'https://sibling.wedding.example', 'null']) {
      const result = await readJsonBody(request('{}', { origin }));
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, 'forbidden');
    }
    assert.equal((await readJsonBody(request('{}', { origin: 'https://wedding.example' }))).ok, true);
    assert.equal((await readJsonBody(request('{}'))).ok, true);
    assert.equal((await readJsonBody(request('{}', { 'sec-fetch-site': 'cross-site' }))).ok, false);
  });

  it('uses the configured canonical origin behind a reverse proxy', async () => {
    assert.equal((await readJsonBody(request('{}', { origin: 'https://canonical.example' }), {
      trustedOrigin: 'https://canonical.example',
    })).ok, true);
    assert.equal((await readJsonBody(request('{}', { origin: 'https://wedding.example' }), {
      trustedOrigin: 'https://canonical.example',
    })).ok, false);
  });

  it('assigns distinct byte budgets to login, import, and ordinary JSON requests', () => {
    assert.equal(requestBodyLimit(new Request('https://wedding.example/api/admin/login')), LOGIN_BODY_LIMIT_BYTES);
    assert.equal(requestBodyLimit(new Request('https://wedding.example/api/open')), LOGIN_BODY_LIMIT_BYTES);
    assert.equal(requestBodyLimit(new Request('https://wedding.example/api/admin/import/')), CSV_IMPORT_BODY_LIMIT_BYTES);
    assert.equal(requestBodyLimit(new Request('https://wedding.example/api/rsvp')), JSON_BODY_LIMIT_BYTES);
  });
});
