import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { copyFor } from './copy.ts';

/**
 * The whole bundle is passed to RsvpForm, which is a Client Component. A
 * function anywhere in it throws "Functions cannot be passed directly to
 * Client Components" at render - and only on the routes that reach the form,
 * so a type check and a build both pass and the invitation page 500s.
 */

/** Every leaf, as `rsvp.partyCountHelpMany` style paths. */
function leaves(value: unknown, path = ''): [string, unknown][] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path === '' ? key : `${path}.${key}`),
    );
  }
  return [[path, value]];
}

describe('copy bundle', () => {
  const copy = copyFor('en');

  it('is nothing but strings, so it can cross to a Client Component', () => {
    const offenders = leaves(copy)
      .filter(([, value]) => typeof value !== 'string')
      .map(([path, value]) => `${path} is ${typeof value}`);

    assert.deepEqual(
      offenders,
      [],
      `Use a {{placeholder}} string with renderTemplate instead: ${offenders.join(', ')}`,
    );
  });

  it('survives the structured clone React does at the boundary', () => {
    assert.doesNotThrow(() => structuredClone(copy));
  });

  it('has no empty strings, which would render as a silent gap', () => {
    const empty = leaves(copy).filter(([, value]) => value === '');
    assert.deepEqual(empty, []);
  });
});
