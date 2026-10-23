import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CsvParseError, parseCsv, parseCsvWithHeader, toCsv, UTF8_BOM } from './csv.ts';

describe('parseCsv', () => {
  it('rejects null bytes before text reaches PostgreSQL, including quoted cells', () => {
    for (const input of ['a,b\ntext\0,other', 'a,b\n"text\0",other']) {
      assert.throws(() => parseCsv(input), /null character/);
    }
  });

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

  it('handles CR-only line endings without merging households', () => {
    assert.deepEqual(parseCsv('a,b\r1,2\r3,4\r'), [
      ['a', 'b'], ['1', '2'], ['3', '4'],
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
    assert.deepEqual(parseCsv('""'), [['']]);
    assert.deepEqual(parseCsv(',""'), [['', '']]);
  });

  it('does not emit a phantom row for a trailing newline', () => {
    assert.equal(parseCsv('a,b\n1,2\n').length, 2);
  });

  it('round-trips Sinhala script unchanged', () => {
    const name = 'නිමල් පෙරේරා';
    assert.deepEqual(parseCsv(`name\n${name}`), [['name'], [name]]);
  });

  it('rejects an unterminated quote at the field opening position', () => {
    assert.throws(() => parseCsv('a,b\r\n"First\r\nSecond,b'), (error) => {
      assert.ok(error instanceof CsvParseError);
      assert.equal(error.row, 2);
      assert.equal(error.column, 1);
      assert.match(error.message, /no closing quote/);
      return true;
    });
  });

  it('rejects quotes in unquoted fields instead of removing them from names', () => {
    assert.throws(() => parseCsv('name,side\nA "Nickname" Perera,bride'), CsvParseError);
    assert.throws(() => parseCsv('name,side\n"Perera"Family,bride'), /after the closing quote/);
  });

  it('preserves each newline sequence inside a quoted field', () => {
    assert.deepEqual(parseCsv('name,notes\r\nPerera,"line1\rline2\r\nline3\nline4"'), [
      ['name', 'notes'], ['Perera', 'line1\rline2\r\nline3\nline4'],
    ]);
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

  it('keeps physical row numbers across blank rows and quoted multiline cells', () => {
    const result = parseCsvWithHeader('\r\nname,notes\r\n\r\nPerera,"first\r\nsecond"\r\n,,\r\nSilva,note');
    assert.deepEqual(result.rows, [
      { name: 'Perera', notes: 'first\r\nsecond' }, { name: 'Silva', notes: 'note' },
    ]);
    assert.deepEqual(result.rowNumbers, [4, 7]);
  });

  it('rejects duplicate headers after case and whitespace normalization', () => {
    assert.throws(() => parseCsvWithHeader('name, Name \nPerera,Silva'), /Duplicate header 'name'/);
  });

  it('rejects unnamed columns rather than ignoring their data', () => {
    assert.throws(() => parseCsvWithHeader('name,,side\nPerera,important,bride'), /Column 2 has no header/);
  });

  it('rejects extra cells before a shifted field can be imported', () => {
    assert.throws(() => parseCsvWithHeader('name,side\n\nMr.,Mrs. Perera,bride'), (error) => {
      assert.ok(error instanceof CsvParseError);
      assert.equal(error.row, 3);
      assert.match(error.message, /3 values but only 2 headers/);
      return true;
    });
  });

  it('safely represents special object property names as data', () => {
    const { rows } = parseCsvWithHeader('__proto__,name\nnotes,Perera');
    assert.equal(Object.hasOwn(rows[0]!, '__proto__'), true);
    assert.equal(rows[0]!['__proto__'], 'notes');
    assert.equal(Object.getPrototypeOf(rows[0]!), Object.prototype);
  });

  it('returns nothing for empty input', () => {
    assert.deepEqual(parseCsvWithHeader(''), { headers: [], rows: [], rowNumbers: [] });
    assert.deepEqual(parseCsvWithHeader(`${UTF8_BOM}\r\n,,\r\n`), { headers: [], rows: [], rowNumbers: [] });
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
      ['display_name', 'notes'],
      ['Mr. & Mrs. Perera', 'Card posted to 12 Main St, Colombo 07'],
      ['නිමල් පෙරේරා', 'no note'],
    ];
    assert.deepEqual(parseCsv(toCsv(rows)), rows);
  });
});
