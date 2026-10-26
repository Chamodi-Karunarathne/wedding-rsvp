import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { importKey, normalizePhone, normalizePhones, phoneListError, splitPhoneNumbers } from './phone.ts';

describe('normalizePhone', () => {
  it('returns null for empty input', () => {
    assert.equal(normalizePhone(null), null);
    assert.equal(normalizePhone(undefined), null);
    assert.equal(normalizePhone(''), null);
    assert.equal(normalizePhone('   '), null);
  });

  it('collapses the formats of one Sri Lankan number to a single value', () => {
    const expected = '+94771234567';
    for (const input of [
      '0771234567',
      '077 123 4567',
      '077-123-4567',
      '+94771234567',
      '+94 77 123 4567',
      '0094771234567',
      '94 77 123 4567',
      '94771234567',
      '00 94 (77) 123-4567',
      '771234567',
      '(077) 1234567',
    ]) {
      assert.equal(normalizePhone(input), expected, `failed for ${input}`);
    }
  });

  it('keeps a foreign number that already carries a plus', () => {
    assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
  });

  it('adds the plus to international numbers supplied with a country code', () => {
    for (const phone of ['44 20 7946 0958', '00442079460958']) {
      assert.equal(normalizePhone(phone), '+442079460958');
    }
    assert.equal(normalizePhone('1 (202) 555-0123'), '+12025550123');
  });

  it('is stable when saved international numbers are normalized again', () => {
    for (const phone of ['077-123-4567', '771234567', '94771234567', '44 20 7946 0958']) {
      const normalized = normalizePhone(phone);
      assert.equal(normalizePhone(normalized), normalized);
    }
  });

  it('does not drop unrecognisable input, so equal garbage still compares equal', () => {
    assert.equal(normalizePhone('12345'), normalizePhone('1-2-3-4-5'));
  });
});

describe('importKey', () => {
  it('is independent of phone-list order, formatting and repeats', () => {
    assert.equal(importKey('Family', '0771234567, 0712223333'),
      importKey('family', '+94712223333, 94771234567, 0771234567'));
  });
  it('is stable across phone formatting', () => {
    assert.equal(
      importKey('Perera, Ranjani', '077 123 4567'),
      importKey('Perera, Ranjani', '+94771234567'),
    );
  });

  it('is stable across name casing and whitespace', () => {
    assert.equal(importKey('  Perera,   Ranjani ', '0771234567').trim().length > 0, true);
    assert.equal(
      importKey('perera, ranjani', '0771234567'),
      importKey('  PERERA,   Ranjani  ', '0771234567'),
    );
  });

  it('collapses a missing phone to empty rather than null, so two print-only guests match', () => {
    // NULL != NULL in SQL, which is exactly the bug this guards against.
    assert.equal(importKey('Silva, Kamal', null), importKey('Silva, Kamal', ''));
    assert.equal(importKey('Silva, Kamal', null), importKey('Silva, Kamal', undefined));
  });

  it('separates two different people', () => {
    assert.notEqual(importKey('Silva, Kamal', null), importKey('Silva, Nimal', null));
    assert.notEqual(
      importKey('Silva, Kamal', '0771234567'),
      importKey('Silva, Kamal', '0777654321'),
    );
  });
});

describe('phone lists', () => {
  it('normalizes every number independently, deduplicates and preserves preferred order', () => {
    assert.deepEqual(splitPhoneNumbers('077 123 4567, +94 71 222 3333, 94771234567, 44 7700 900123'),
      ['+94771234567', '+94712223333', '+447700900123']);
    assert.equal(normalizePhones('077 123 4567, 0712223333'), '+94771234567, +94712223333');
    assert.equal(normalizePhones('+94771234567, +94712223333'), '+94771234567, +94712223333');
  });

  it('accepts optional blanks and does not treat malformed entries as usable phones', () => {
    for (const value of [null, undefined, '', ' , , ']) {
      assert.equal(normalizePhones(value), null);
      assert.equal(phoneListError(value), null);
    }
    assert.deepEqual(splitPhoneNumbers('N/A, 123, 0, 7.71E+08'), []);
  });

  it('rejects one bad entry in a list without silently accepting its good companion', () => {
    for (const value of ['0771234567, N/A', '0771234567, 7.71E+08', '123', '+00000000', '1'.repeat(501)]) {
      assert.ok(phoneListError(value), value);
    }
    assert.equal(phoneListError('0771234567, +94712223333'), null);
  });

  it('checks the canonical length too, so a saved list can always be edited again', () => {
    const phones = Array.from({ length: 45 }, (_, index) => `077${String(index).padStart(7, '0')}`).join(',');
    assert.ok(phones.length <= 500);
    const error = phoneListError(phones);
    assert.ok(error);
    assert.match(error, /Normalized phone numbers/);
  });
});
