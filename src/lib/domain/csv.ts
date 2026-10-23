/**
 * PERMANENT. RFC 4180 CSV reader and writer, hand-rolled to avoid a dependency.
 *
 * Two encoding details that will otherwise bite in October:
 *   - Excel writes a UTF-8 BOM on export, so the importer must strip one.
 *   - Excel will not read UTF-8 without a BOM, so the exporter must write one,
 *     or the Sinhala display names arrive at the card designer as mojibake.
 */

export const UTF8_BOM = '\uFEFF';

/* -------------------------------------------------------------------------- */
/* reading                                                                    */
/* -------------------------------------------------------------------------- */

/** A structural error makes the whole file unsafe to import. */
export class CsvParseError extends Error {
  row: number;
  column?: number;

  constructor(message: string, row: number, column?: number) {
    super(`CSV row ${row}${column === undefined ? '' : `, column ${column}`}: ${message}`);
    this.name = 'CsvParseError';
    this.row = row;
    this.column = column;
  }
}

type CsvRecord = { fields: string[]; row: number };

function parseCsvRecords(input: string): CsvRecord[] {
  const text = input.startsWith(UTF8_BOM) ? input.slice(1) : input;

  const rows: CsvRecord[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let closedQuote = false;
  let started = false;
  let line = 1;
  let column = 1;
  let recordLine = 1;
  let quoteLine = 1;
  let quoteColumn = 1;
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;

    if (ch === '\0') {
      throw new CsvParseError('This file contains a null character. Save it as CSV UTF-8 and try again.', line, column);
    }

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          column += 2;
          continue;
        }
        inQuotes = false;
        closedQuote = true;
        i += 1;
        column += 1;
        continue;
      }
      if (ch === '\r' || ch === '\n') {
        const newline = ch === '\r' && text[i + 1] === '\n' ? '\r\n' : ch;
        field += newline;
        i += newline.length;
        line += 1;
        column = 1;
        continue;
      }
      field += ch;
      i += 1;
      column += 1;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      closedQuote = false;
      started = true;
      i += 1;
      column += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push({ fields: row, row: recordLine });
      row = [];
      field = '';
      closedQuote = false;
      started = false;
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      line += 1;
      column = 1;
      recordLine = line;
      continue;
    }
    if (closedQuote) {
      throw new CsvParseError('Expected a comma or line break after the closing quote.', line, column);
    }
    if (ch === '"') {
      if (field !== '') {
        throw new CsvParseError('A quoted field must start with a quote. Escape quotes inside a quoted field by doubling them.', line, column);
      }
      inQuotes = true;
      started = true;
      quoteLine = line;
      quoteColumn = column;
      i += 1;
      column += 1;
      continue;
    }

    field += ch;
    started = true;
    i += 1;
    column += 1;
  }

  if (inQuotes) {
    throw new CsvParseError('This quoted field has no closing quote.', quoteLine, quoteColumn);
  }

  // Flush the final field unless the file simply ended with a newline.
  if (started || row.length > 0) {
    row.push(field);
    rows.push({ fields: row, row: recordLine });
  }

  return rows;
}

/** Parses CSV text into rows. Handles quoted fields, embedded commas,
 *  embedded newlines, escaped quotes, CR/CRLF/LF, and a leading BOM.
 *  Malformed quoting throws CsvParseError instead of silently changing data. */
export function parseCsv(input: string): string[][] {
  return parseCsvRecords(input).map((record) => record.fields);
}

/**
 * Parses CSV with a header row into objects keyed by lower-cased header name.
 * Short rows yield '' for missing columns rather than undefined, so callers
 * never have to distinguish "absent" from "empty". Duplicate/empty headers and
 * surplus cells are rejected rather than silently losing data. rowNumbers
 * contains each data record's physical starting line, including blank lines
 * and newlines inside quoted cells.
 */
export function parseCsvWithHeader(
  input: string,
): { headers: string[]; rows: Record<string, string>[]; rowNumbers: number[] } {
  const raw = parseCsvRecords(input).filter((record) =>
    record.fields.some((field) => field.trim() !== ''),
  );
  const headerRow = raw[0];
  if (!headerRow) return { headers: [], rows: [], rowNumbers: [] };

  const headers = headerRow.fields.map((h) => h.trim().toLowerCase());
  const seen = new Set<string>();
  for (const [index, header] of headers.entries()) {
    if (header === '') {
      throw new CsvParseError(`Column ${index + 1} has no header. Give every column a name or remove the empty column.`, headerRow.row);
    }
    if (seen.has(header)) {
      throw new CsvParseError(`Duplicate header '${header}'. Give every column a unique name.`, headerRow.row);
    }
    seen.add(header);
  }
  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];

  for (const record of raw.slice(1)) {
    if (record.fields.length > headers.length) {
      throw new CsvParseError(`Found ${record.fields.length} values but only ${headers.length} headers. Check for an unquoted comma or an extra column.`, record.row);
    }
    rows.push(Object.fromEntries(headers.map((header, index) => [
      header, (record.fields[index] ?? '').trim(),
    ])));
    rowNumbers.push(record.row);
  }

  return { headers, rows, rowNumbers };
}

/* -------------------------------------------------------------------------- */
/* writing                                                                    */
/* -------------------------------------------------------------------------- */

function escapeField(value: string): string {
  const needsQuotes = /[",\r\n]/.test(value) || value !== value.trim();
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCsvRow(values: readonly (string | number | null | undefined)[]): string {
  return values.map((v) => escapeField(v === null || v === undefined ? '' : String(v))).join(',');
}

/** Serializes rows to CSV. `bom` defaults to true because these files are
 *  opened in Excel. */
export function toCsv(
  rows: readonly (readonly (string | number | null | undefined)[])[],
  options: { bom?: boolean } = {},
): string {
  const body = rows.map(toCsvRow).join('\r\n');
  return (options.bom ?? true) ? UTF8_BOM + body : body;
}
