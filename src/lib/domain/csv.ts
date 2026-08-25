/**
 * PERMANENT. RFC 4180 CSV reader and writer, hand-rolled to avoid a dependency.
 *
 * Two encoding details that will otherwise bite in October:
 *   - Excel writes a UTF-8 BOM on export, so the importer must strip one.
 *   - Excel will not read UTF-8 without a BOM, so the exporter must write one,
 *     or the Sinhala display names arrive at the card designer as mojibake.
 */

export const UTF8_BOM = '﻿';

/* -------------------------------------------------------------------------- */
/* reading                                                                    */
/* -------------------------------------------------------------------------- */

/** Parses CSV text into rows. Handles quoted fields, embedded commas,
 *  embedded newlines, escaped quotes, CRLF, and a leading BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith(UTF8_BOM) ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1; // CRLF: the \n does the work
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  // Flush the final field unless the file simply ended with a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Parses CSV with a header row into objects keyed by lower-cased header name.
 * Short rows yield '' for missing columns rather than undefined, so callers
 * never have to distinguish "absent" from "empty".
 */
export function parseCsvWithHeader(
  input: string,
): { headers: string[]; rows: Record<string, string>[] } {
  const raw = parseCsv(input);
  const headerRow = raw[0];
  if (!headerRow) return { headers: [], rows: [] };

  const headers = headerRow.map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (const line of raw.slice(1)) {
    // Skip blank trailing lines.
    if (line.length === 1 && line[0]!.trim() === '') continue;
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (line[index] ?? '').trim();
    });
    rows.push(record);
  }

  return { headers, rows };
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
