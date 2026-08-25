import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCsv, parseCsvWithHeader, toCsv, UTF8_BOM } from './csv.ts';

describe('parseCsv', () => {
  it('parses a simple grid', () => {
    assert.deepEqual(parseCsv('a,b\n1,2'), [
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles CRLF line endings', () => {
    assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a leading UTF-8 BOM, as written by Excel', () => {
    assert.deepEqual(parseCsv(`${UTF8_BOM}name,side\nPerera,bride`), [
      ['name', 'side'],
      ['Perera', 'bride'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    assert.deepEqual(parseCsv('name,address\n"Perera","12 Main St, Colombo"'), [
      ['name', 'address'],
      ['Perera', '12 Main St, Colombo'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    assert.deepEqual(parseCsv('a\n"She said ""hello"""'), [['a'], ['She said "hello"']]);
  });

  it('keeps newlines inside quoted fields', () => {
    assert.deepEqual(parseCsv('a,b\n"line1\nline2",x'), [
      ['a', 'b'],
      ['line1\nline2', 'x'],
    ]);
  });

  it('preserves empty fields', () => {
    assert.deepEqual(parseCsv('a,,c'), [['a', '', 'c']]);
  });

  it('does not emit a phantom row for a trailing newline', () => {
    assert.equal(parseCsv('a,b\n1,2\n').length, 2);
  });

  it('round-trips Sinhala script unchanged', () => {
    const name = 'නිමල් පෙරේරා';
    assert.deepEqual(parseCsv(`name\n${name}`), [['name'], [name]]);
  });
});

describe('parseCsvWithHeader', () => {
  it('keys rows by lower-cased header', () => {
    const { rows } = parseCsvWithHeader('Display Name,Side\nR. Perera,bride');
    assert.deepEqual(rows, [{ 'display name': 'R. Perera', side: 'bride' }]);
  });

  it('fills missing trailing columns with empty strings', () => {
    const { rows } = parseCsvWithHeader('a,b,c\n1,2');
    assert.deepEqual(rows, [{ a: '1', b: '2', c: '' }]);
  });

  it('skips blank trailing lines', () => {
    const { rows } = parseCsvWithHeader('a\n1\n\n');
    assert.equal(rows.length, 1);
  });

  it('returns nothing for empty input', () => {
    assert.deepEqual(parseCsvWithHeader(''), { headers: [], rows: [] });
  });
});

describe('toCsv', () => {
  it('writes a BOM by default so Excel reads UTF-8 correctly', () => {
    assert.ok(toCsv([['a']]).startsWith(UTF8_BOM));
  });

  it('omits the BOM when asked', () => {
    assert.equal(toCsv([['a']], { bom: false }), 'a');
  });

  it('quotes fields containing commas, quotes or newlines', () => {
    const out = toCsv([['plain', 'a,b', 'say "hi"', 'one\ntwo']], { bom: false });
    assert.equal(out, 'plain,"a,b","say ""hi""","one\ntwo"');
  });

  it('renders null and undefined as empty fields', () => {
    assert.equal(toCsv([['a', null, undefined, 'b']], { bom: false }), 'a,,,b');
  });

  it('survives a round trip through the parser', () => {
    const rows = [
      ['display_name', 'postal_address'],
      ['Mr. & Mrs. Perera', '12 Main St, Colombo 07'],
      ['නිමල් පෙරේරා', 'no address'],
    ];
    assert.deepEqual(parseCsv(toCsv(rows)), rows);
  });
});
