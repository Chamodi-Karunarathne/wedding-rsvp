import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOKEN_LENGTH, generateToken, isValidToken } from './ids.ts';

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
