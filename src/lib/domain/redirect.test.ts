import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adminReturnPath } from './redirect.ts';

describe('admin login return path', () => {
  it('preserves admin destinations, filters and anchors', () => {
    assert.equal(adminReturnPath('/admin'), '/admin');
    assert.equal(adminReturnPath('/admin/guests?q=Family%20Name#guest-list'), '/admin/guests?q=Family%20Name#guest-list');
    assert.equal(adminReturnPath('/admin/rsvps?guest=example#record-reply'), '/admin/rsvps?guest=example#record-reply');
  });

  it('rejects external origins and browser-normalized authority separators', () => {
    for (const value of [
      'https://example.com', '//example.com', '/\\example.com', '/\\/example.com',
      '/\t/example.com', '/\n/example.com', '/\r/example.com', 'javascript:alert(1)',
    ]) {
      assert.equal(adminReturnPath(value), '/admin', JSON.stringify(value));
    }
  });

  it('rejects malformed input and paths outside the console after normalization', () => {
    for (const value of [undefined, null, 1, [], '', 'admin/guests', '/administrator', '/i/example', '/admin/../outside', '/admin/%2e%2e/outside', '/admin/login?next=/admin']) {
      assert.equal(adminReturnPath(value), '/admin');
    }
  });
});
