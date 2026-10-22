import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getTableColumns, getTableName, type SQL, type Table } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { DbLike } from '@/db/client';

// Node's native TypeScript runner does not resolve tsconfig aliases. Register
// only source-file resolution; this does not replace any application modules.
const sourceRoot = path.resolve(import.meta.dirname, '../..');
registerHooks({ resolve(specifier, context, nextResolve) {
  const candidate = specifier.startsWith('@/')
    ? path.join(sourceRoot, specifier.slice(2))
    : specifier.startsWith('.') && context.parentURL?.startsWith(pathToFileURL(sourceRoot).href)
      ? path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
      : null;
  if (candidate) {
    for (const suffix of ['', '.ts', '.tsx']) {
      if (fs.existsSync(candidate + suffix) && fs.statSync(candidate + suffix).isFile()) {
        return nextResolve(pathToFileURL(candidate + suffix).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
} });

type Row = Record<string, unknown>;
type State = Record<string, Row[]>;
type Conflict = { set?: Row };
const dialect = new PgDialect();

/** Small transactional adapter for failure injection, not a SQL database. */
export class ServiceMemoryDb {
  state: State;
  trace: string[] = [];
  failInsertInto: string | null = null;
  private nextId = 100;

  constructor(state: State) {
    this.state = structuredClone(state);
  }

  asDb(): DbLike {
    return this.handle(false, new Set()) as unknown as DbLike;
  }

  private handle(inTransaction: boolean, locks: Set<string>) {
    const owner = this;
    const handle = {
      async transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
        const before = structuredClone(owner.state);
        const existingLocks = new Set(locks);
        owner.trace.push(inTransaction ? 'savepoint' : 'begin');
        try {
          const result = await callback(owner.handle(true, locks));
          owner.trace.push(inTransaction ? 'release' : 'commit');
          return result;
        } catch (error) {
          owner.state = before;
          locks.clear();
          for (const id of existingLocks) locks.add(id);
          owner.trace.push(inTransaction ? 'rollback-savepoint' : 'rollback');
          throw error;
        }
      },
      select(fields?: Row) {
        return { from(table: Table) {
          let condition: SQL | undefined;
          let limit: number | undefined;
          let join = false;
          let locking = false;
          const operation = {
            where(value: SQL) { condition = value; return operation; },
            limit(value: number) { limit = value; return operation; },
            orderBy() { return operation; },
            innerJoin() { join = true; return operation; },
            for(strength: string) { assert.equal(strength, 'update'); locking = true; return operation; },
            then(resolve: (value: Row[]) => unknown, reject: (error: unknown) => unknown) {
              return Promise.resolve().then(() => {
                const name = getTableName(table);
                owner.trace.push(`select:${name}`);
                let rows = (owner.state[name] ?? []).filter((row) => owner.matches(table, row, condition));
                if (locking) {
                  assert.equal(inTransaction, true, 'FOR UPDATE must run inside a transaction');
                  for (const row of rows) locks.add(String(row.id));
                  owner.trace.push('lock:guests');
                }
                if (inTransaction && (name === 'rsvps' || name === 'invitations' || name === 'guest_messages')) {
                  assert.ok(locks.size > 0, 'Mutable validation/history reads must follow the guest lock');
                }
                if (join && name === 'invitations' && fields?.event) {
                  rows = rows.map((row) => ({ event: owner.state.events?.find((event) => event.id === row.eventId) }));
                }
                return structuredClone(limit === undefined ? rows : rows.slice(0, limit));
              }).then(resolve, reject);
            },
          };
          return operation;
        } };
      },
      update(table: Table) {
        return { set(values: Row) { return { where(condition: SQL) {
          const execute = async () => {
            assert.equal(inTransaction, true, 'Guest writes must be transactional');
            const name = getTableName(table);
            owner.trace.push(`update:${name}`);
            const matches = (owner.state[name] ?? []).filter((row) => owner.matches(table, row, condition));
            for (const row of matches) Object.assign(row, values);
            return structuredClone(matches);
          };
          return { returning: execute };
        } }; } };
      },
      delete(table: Table) {
        return { where(condition: SQL) {
          const execute = async () => {
            const name = getTableName(table);
            owner.trace.push(`delete:${name}`);
            const matches = (owner.state[name] ?? []).filter((row) => owner.matches(table, row, condition));
            owner.state[name] = (owner.state[name] ?? []).filter((row) => !matches.includes(row));
            return structuredClone(matches);
          };
          return { returning: execute, then: (resolve: (value: Row[]) => unknown, reject: (error: unknown) => unknown) => execute().then(resolve, reject) };
        } };
      },
      insert(table: Table) {
        return { values(values: Row | Row[]) {
          let conflict: Conflict | undefined;
          let doNothing = false;
          let promise: Promise<Row[]> | undefined;
          const execute = () => promise ??= Promise.resolve().then(() => {
            const name = getTableName(table);
            assert.equal(inTransaction, true, 'Command inserts must be transactional');
            owner.trace.push(`insert:${name}`);
            if (owner.failInsertInto === name) {
              owner.failInsertInto = null;
              throw new Error('Injected database failure, without any connection');
            }
            const rows = owner.state[name] ??= [];
            const results: Row[] = [];
            for (const value of Array.isArray(values) ? values : [values]) {
              const keys = name === 'delivery_channels' ? ['guestId', 'channel']
                : name === 'rsvps' ? ['guestId', 'eventId']
                  : name === 'guest_messages' ? ['guestId'] : [];
              const existing = keys.length && rows.find((row) => keys.every((key) => row[key] === value[key]));
              if (existing && (doNothing || conflict)) {
                if (conflict?.set) Object.assign(existing, conflict.set);
                if (!doNothing) results.push(existing);
              } else {
                const now = new Date();
                const row: Row = {
                  id: `test-id-${owner.nextId++}`,
                  createdAt: now, submittedAt: now, updatedAt: now,
                  ...(name === 'delivery_channels' ? { status: 'pending', sentAt: null, sentBy: null, notes: null } : {}),
                  ...value,
                };
                rows.push(row);
                if (name === 'guests') locks.add(String(row.id));
                results.push(row);
              }
            }
            return structuredClone(results);
          });
          const operation = {
            onConflictDoUpdate(options: Conflict) { conflict = options; return operation; },
            onConflictDoNothing() { doNothing = true; return operation; },
            returning: execute,
            then: (resolve: (value: Row[]) => unknown, reject: (error: unknown) => unknown) => execute().then(resolve, reject),
          };
          return operation;
        } };
      },
    };
    return handle;
  }

  private matches(table: Table, row: Row, condition?: SQL): boolean {
    if (!condition) return true;
    const query = dialect.sqlToQuery(condition);
    const columns = getTableColumns(table);
    const property = (name: string) => Object.entries(columns).find(([, column]) => column.name === name)?.[0] ?? name;
    for (const match of query.sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)) {
      if (row[property(match[1]!)] !== query.params[Number(match[2]) - 1]) return false;
    }
    for (const match of query.sql.matchAll(/"[^"]+"\."([^"]+)" in \(([^)]+)\)/g)) {
      const values = [...match[2]!.matchAll(/\$(\d+)/g)].map((entry) => query.params[Number(entry[1]) - 1]);
      if (!values.includes(row[property(match[1]!)])) return false;
    }
    return true;
  }
}

export const guestFixture = {
  id: '00000000-0000-4000-8000-000000000001', token: 'existing-token',
  displayName: 'Existing household', displayNameFallback: null,
  sortName: 'Existing household', side: 'bride', language: 'en',
  maxPartySize: 4, phone: null, notes: 'Existing note',
  createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z'),
};
export const eventFixture = {
  id: '00000000-0000-4000-8000-000000000002', slug: 'ceremony',
  name: 'Ceremony', startsAt: new Date('2026-12-03T03:45:00Z'), sortOrder: 1,
};
export function databaseFixture({ responding = false } = {}) {
  return new ServiceMemoryDb({
    guests: [guestFixture], events: [eventFixture],
    invitations: [{ guestId: guestFixture.id, eventId: eventFixture.id }],
    rsvps: responding ? [{
      id: '00000000-0000-4000-8000-000000000003', guestId: guestFixture.id,
      eventId: eventFixture.id, attending: true, partyCount: 4,
      attendeeNames: 'Original names', source: 'phone', recordedBy: 'Family',
      submittedAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-01T00:00:00Z'),
    }] : [],
    rsvp_history: [], guest_messages: [], delivery_channels: [],
  });
}
