import { writeFileSync } from 'node:fs';
import { toCsv } from '../src/lib/domain/csv.ts';

/**
 * Generates the 50-row CSV for acceptance criterion 10, including the cases
 * that actually break importers: a comma inside a quoted address, Sinhala
 * script, an apostrophe, a very long name, and a household with no phone.
 */

const SIDES = ['bride', 'groom', 'both'] as const;

const rows: (string | number)[][] = [
  [
    'display_name',
    'sort_name',
    'side',
    'max_party_size',
    'phone',
    'postal_address',
    'personal_note',
    'events',
    'channels',
  ],
];

for (let i = 1; i <= 50; i += 1) {
  const side = SIDES[i % 3]!;
  const isPrint = i % 5 === 0;

  rows.push([
    i === 7
      ? 'නිමල් සහ සුනේත්‍රා විජේසිංහ'
      : i === 13
        ? "Mr. & Mrs. O'Sullivan-Wickramaratne of Nuwara Eliya and Colombo"
        : `Mr. & Mrs. Test Household ${i}`,
    `Household ${String(i).padStart(2, '0')}`,
    side,
    (i % 4) + 1,
    // Every fifth row is print-only with no phone, which is exactly the case
    // that breaks a naive (sort_name, phone) dedupe key.
    isPrint ? '' : `07${String(10000000 + i).slice(0, 8)}`,
    isPrint ? `No. ${i}, Temple Road, Kandy 20000` : '',
    i === 3 ? 'We are so glad you can make it.' : '',
    i % 7 === 0 ? 'reception' : 'ceremony|reception',
    isPrint ? 'print' : 'whatsapp',
  ]);
}

const path = process.argv[2] ?? 'test-import-50.csv';
writeFileSync(path, toCsv(rows), 'utf8');
console.log(`Wrote ${rows.length - 1} data rows to ${path}`);
console.log('Import it at /admin/guests, then run it a second time: the counts');
console.log('should read "0 created, 50 updated" - that is the idempotency check.');
