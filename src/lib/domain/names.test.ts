import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DISPLAY_NAME_SOFT_LIMIT,
  displayNameLength,
  isDisplayNameLong,
  resolveCardName,
} from './names.ts';

describe('display name length', () => {
  it('does not warn at exactly the limit', () => {
    const name = 'x'.repeat(DISPLAY_NAME_SOFT_LIMIT);
    assert.equal(isDisplayNameLong(name), false);
  });

  it('warns one character past it', () => {
    assert.equal(isDisplayNameLong('x'.repeat(DISPLAY_NAME_SOFT_LIMIT + 1)), true);
  });

  it('flags a real household that would break the card', () => {
    assert.equal(isDisplayNameLong('Mr. & Mrs. Sunil Jayawardena & Family'), true);
    assert.equal(isDisplayNameLong('Ms. Anushka Fernando'), false);
  });

  it('counts code points, so a Sinhala name is not penalised twice', () => {
    const sinhala = 'නිමල් සහ කුමාරි පෙරේරා';
    assert.equal(displayNameLength(sinhala), [...sinhala].length);
    assert.ok(displayNameLength(sinhala) <= sinhala.length);
  });
});

describe('resolveCardName', () => {
  it('uses the display name when there is no fallback', () => {
    assert.equal(resolveCardName('Ms. Anushka Fernando', null), 'Ms. Anushka Fernando');
  });

  it('prefers the fallback when one is set', () => {
    assert.equal(
      resolveCardName('Mr. & Mrs. Lakshman Dias and Family', 'The Dias Family'),
      'The Dias Family',
    );
  });

  it('ignores a fallback that is only whitespace', () => {
    // An admin who cleared the field left '' behind, not a name.
    assert.equal(resolveCardName('Ms. Anushka Fernando', '   '), 'Ms. Anushka Fernando');
  });
});
