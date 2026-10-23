import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { importKey, normalizePhone } from './phone.ts';

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
