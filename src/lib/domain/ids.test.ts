import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateShortCode,
  generateToken,
  isValidShortCode,
  isValidToken,
  normalizeShortCode,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  TOKEN_LENGTH,
} from './ids.ts';

describe('short code alphabet', () => {
  it('contains no vowels, so a code cannot spell a word', () => {
    for (const vowel of 'AEIOU') {
      assert.ok(!SHORT_CODE_ALPHABET.includes(vowel), `alphabet contains ${vowel}`);
    }
  });

  it('contains no confusable characters', () => {
    for (const ch of '01258 6ILO'.replace(/\s/g, '')) {
      assert.ok(!SHORT_CODE_ALPHABET.includes(ch), `alphabet contains confusable ${ch}`);
    }
  });

  it('has no duplicate characters', () => {
    assert.equal(new Set(SHORT_CODE_ALPHABET).size, SHORT_CODE_ALPHABET.length);
  });

  it('is large enough that 500 guests will not collide', () => {
    const space = SHORT_CODE_ALPHABET.length ** SHORT_CODE_LENGTH;
    assert.ok(space > 100_000_000, `space is only ${space}`);
  });
});

describe('generateShortCode', () => {
  it('produces valid codes of the right length', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateShortCode();
      assert.equal(code.length, SHORT_CODE_LENGTH);
      assert.ok(isValidShortCode(code), `${code} failed validation`);
    }
  });

  it('does not repeat across a realistic guest count', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(generateShortCode());
    assert.equal(seen.size, 500);
  });
});

describe('normalizeShortCode', () => {
  it('uppercases', () => {
    assert.equal(normalizeShortCode('bcdfgh'), 'BCDFGH');
  });

  it('strips spaces, dashes and punctuation from a hand-typed code', () => {
    assert.equal(normalizeShortCode(' BCD-FGH '), 'BCDFGH');
    assert.equal(normalizeShortCode('BCD FGH'), 'BCDFGH');
  });

  it('maps unambiguous lookalikes to the character that must have been meant', () => {
    assert.equal(normalizeShortCode('5BCDFG'), 'SBCDFG'); // 5 -> S
    assert.equal(normalizeShortCode('2BCDFG'), 'ZBCDFG'); // 2 -> Z
    assert.equal(normalizeShortCode('8BCDFG'), 'BBCDFG'); // 8 -> B
    assert.equal(normalizeShortCode('6BCDFG'), 'GBCDFG'); // 6 -> G
    assert.equal(normalizeShortCode('UBCDFG'), 'VBCDFG'); // U -> V
  });

  it('leaves genuinely ambiguous characters alone so lookup fails cleanly', () => {
    // 'O' could be Q, D or a misread 0. Guessing would send a guest to the
    // wrong invitation, which is worse than a not-found page.
    assert.equal(normalizeShortCode('OBCDFG'), 'OBCDFG');
    assert.ok(!isValidShortCode(normalizeShortCode('OBCDFG')));
  });

  it('round-trips a generated code unchanged', () => {
    for (let i = 0; i < 100; i += 1) {
      const code = generateShortCode();
      assert.equal(normalizeShortCode(code), code);
    }
  });
});

describe('isValidShortCode', () => {
  it('rejects wrong lengths and out-of-alphabet characters', () => {
    assert.ok(!isValidShortCode('BCDFG'));
    assert.ok(!isValidShortCode('BCDFGHJ'));
    assert.ok(!isValidShortCode('BCDFGA')); // vowel
    assert.ok(!isValidShortCode(''));
  });
});

describe('token', () => {
  it('generates valid tokens of the right length', () => {
    for (let i = 0; i < 200; i += 1) {
      const token = generateToken();
      assert.equal(token.length, TOKEN_LENGTH);
      assert.ok(isValidToken(token));
    }
  });

  it('does not repeat across a realistic guest count', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(generateToken());
    assert.equal(seen.size, 1000);
  });

  it('rejects malformed tokens', () => {
    assert.ok(!isValidToken('short'));
    assert.ok(!isValidToken('has-a-dash'));
  });
});
