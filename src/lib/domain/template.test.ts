import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderTemplate } from './template.ts';

describe('renderTemplate', () => {
  it('fills a placeholder', () => {
    assert.equal(renderTemplate('Dear {{name}},', { name: 'Anushka' }), 'Dear Anushka,');
  });

  it('fills the same placeholder everywhere it appears', () => {
    assert.equal(renderTemplate('{{a}} and {{a}}', { a: 'x' }), 'x and x');
  });

  it('accepts numbers, so a party count does not need stringifying at every call', () => {
    assert.equal(renderTemplate('Party of {{n}}.', { n: 4 }), 'Party of 4.');
    assert.equal(renderTemplate('{{n}} guests', { n: 0 }), '0 guests');
  });

  it('leaves an unknown placeholder alone rather than blanking it', () => {
    // A typo in an admin-edited template should be visible as {{nmae}}, not
    // silently swallowed into an empty gap in a message already sent.
    assert.equal(renderTemplate('Dear {{nmae}},', { name: 'Anushka' }), 'Dear {{nmae}},');
  });

  it('leaves a template with no placeholders untouched', () => {
    assert.equal(renderTemplate('No placeholders here.', { n: 1 }), 'No placeholders here.');
  });
});
