import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { needsUnicodeFallback, scriptOf } from './script.ts';

describe('scriptOf', () => {
  it('reads an ordinary Latin name as latin', () => {
    assert.equal(scriptOf('Mr. & Mrs. Lakshman Dias'), 'latin');
    assert.equal(scriptOf("The O'Brien Family"), 'latin');
  });

  it('accepts accented Latin without sending it to the fallback', () => {
    // Linux Libertine covers these; a fallback here would change the face of
    // the name for no reason.
    assert.equal(scriptOf('José Fernández'), 'latin');
    assert.equal(scriptOf('Zoë Müller-Ahlström'), 'latin');
  });

  it('reads typographic punctuation as latin', () => {
    assert.equal(scriptOf('Mr. \u2014 Mrs. \u2018P\u2019'), 'latin');
  });

  it('detects a Sinhala name', () => {
    assert.equal(scriptOf('නිමල් පෙරේරා'), 'sinhala');
  });

  it('detects Sinhala mixed into an otherwise Latin name', () => {
    // One tofu box ruins the line, so any Sinhala at all moves the whole name.
    assert.equal(scriptOf('Mr. නිමල් Perera'), 'sinhala');
  });

  it('reports a script neither face covers as other, not latin', () => {
    // Tamil. A Sinhala font will not render it either - the stack has to end
    // in a generic serif, and pretending this is latin hides that.
    assert.equal(scriptOf('திருமதி இராமன்'), 'other');
  });

  it('treats an empty name as latin rather than throwing', () => {
    assert.equal(scriptOf(''), 'latin');
  });
});

describe('needsUnicodeFallback', () => {
  it('is false for Latin and true for anything else', () => {
    assert.equal(needsUnicodeFallback('Ms. Anushka Fernando'), false);
    assert.equal(needsUnicodeFallback('නිමල් පෙරේරා'), true);
    assert.equal(needsUnicodeFallback('திருமதி இராமன்'), true);
  });
});
