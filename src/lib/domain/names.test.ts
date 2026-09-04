import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DISPLAY_NAME_SOFT_LIMIT,
  ENVELOPE_COMFORTABLE_LENGTH,
  ENVELOPE_MIN_SCALE,
  displayNameLength,
  envelopeNameScale,
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

describe('envelopeNameScale', () => {
  it('leaves a short name at full size', () => {
    assert.equal(envelopeNameScale('Ms. Anushka'), 1);
    assert.equal(envelopeNameScale('x'.repeat(ENVELOPE_COMFORTABLE_LENGTH)), 1);
  });

  it('shrinks a long name rather than letting it overflow', () => {
    const scale = envelopeNameScale('Mr. & Mrs. Sunil Jayawardena & Family');
    assert.ok(scale < 1, 'a 37-character name must shrink');
    assert.ok(scale >= ENVELOPE_MIN_SCALE);
  });

  it('shrinks a 40-character name to something that still fits', () => {
    // The acceptance criterion, as a number.
    const scale = envelopeNameScale('x'.repeat(40));
    assert.ok(scale <= 0.5 || scale === ENVELOPE_MIN_SCALE, `got ${scale}`);
  });

  it('never shrinks past legibility, however long the name', () => {
    assert.equal(envelopeNameScale('x'.repeat(500)), ENVELOPE_MIN_SCALE);
  });

  it('counts code points, so a Sinhala name is not shrunk twice over', () => {
    const sinhala = 'නිමල් සහ කුමාරි පෙරේරා';
    assert.equal(envelopeNameScale(sinhala), envelopeNameScale('x'.repeat([...sinhala].length)));
  });
});
