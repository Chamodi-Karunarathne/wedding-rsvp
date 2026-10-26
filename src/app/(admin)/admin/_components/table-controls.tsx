import Form from 'next/form';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { TableHead } from '@/components/ui/table';
import { DELIVERY_CHANNELS, RSVP_SOURCES, SIDES } from '@/db/schema';
import {
  TABLE_SORT_OPTIONS, tableHref,
  type TableFilters, type TableSort, type TableView,
} from '@/lib/domain/admin-tables';
import type { EventView } from '@/lib/services/types';
import { FilterSubmit } from './filter-submit';
import { CHANNEL_LABELS, INVITATION_LABELS, SIDE_LABELS, SOURCE_LABELS } from './presentation';

type FilterName = 'side' | 'channel' | 'status' | 'state' | 'source' | 'event' | 'phone' | 'opened';
type SelectOption = { value: string; label: string };

/** One GET form keeps every table filter and sort together during navigation. */
export function TableControls({ action, view, filters, events }: {
  action: string;
  view: TableView;
  filters: TableFilters;
  events: EventView[];
}) {
  const definitions: Record<FilterName, { label: string; options: SelectOption[] }> = {
    side: { label: 'Which side', options: [
      { value: 'all', label: 'All sides' },
      ...SIDES.map(value => ({ value, label: SIDE_LABELS[value] })),
    ] },
    channel: { label: 'Channel', options: [
      { value: 'all', label: 'Any channel' },
      ...DELIVERY_CHANNELS.map(value => ({ value, label: CHANNEL_LABELS[value] })),
      { value: 'none', label: 'No channel selected' },
    ] },
    status: { label: 'Response', options: [
      { value: 'all', label: 'Any response status' },
      { value: 'waiting', label: 'Waiting for reply' },
      { value: 'coming', label: 'Coming' },
      { value: 'declined', label: 'Unable to attend' },
      // Preserve existing bookmarked guest-list filters.
      ...(filters.status === 'not_sent' ? [{ value: 'not_sent', label: 'Invitation not sent' }] : []),
      ...(filters.status === 'needs_phone' ? [{ value: 'needs_phone', label: 'WhatsApp phone missing' }] : []),
    ] },
    state: { label: 'Invitation progress', options: [
      { value: 'all', label: 'Any invitation progress' },
      ...Object.entries(INVITATION_LABELS).map(([value, label]) => ({ value, label })),
      ...(filters.state === 'needs_phone' ? [{ value: 'needs_phone', label: 'WhatsApp phone missing' }] : []),
    ] },
    source: { label: 'Reply received', options: [
      { value: 'all', label: 'Any reply method' },
      ...RSVP_SOURCES.map(value => ({ value, label: SOURCE_LABELS[value] })),
      { value: 'none', label: 'No reply recorded' },
    ] },
    event: { label: 'Invited event', options: [
      { value: 'all', label: 'All events' },
      ...events.map(event => ({ value: event.slug, label: event.name })),
    ] },
    phone: { label: 'Phone availability', options: [
      { value: 'all', label: 'Any phone availability' },
      { value: 'present', label: 'Has a phone number' },
      { value: 'missing', label: 'No phone number' },
      { value: 'needs_phone', label: 'WhatsApp phone missing' },
    ] },
    opened: { label: 'Invitation link', options: [
      { value: 'all', label: 'Opened or unopened' },
      { value: 'yes', label: 'Has opened the link' },
      { value: 'no', label: 'Has not opened the link' },
    ] },
  };
  const primary: FilterName[] = ['side', 'channel', view === 'send' ? 'state' : 'status'];
  const advanced = (Object.keys(definitions) as FilterName[]).filter(name => !primary.includes(name));
  const activeCount = (Object.keys(definitions) as FilterName[]).filter(name => filters[name] !== 'all').length + (filters.q ? 1 : 0);
  const advancedCount = advanced.filter(name => filters[name] !== 'all').length;
  const select = (name: FilterName) => (
    <div className="admin-filter" key={name}>
      <label htmlFor={`${view}-${name}`}>{definitions[name].label}</label>
      <select key={filters[name]} id={`${view}-${name}`} name={name} className="admin-select" defaultValue={filters[name]}>
        {definitions[name].options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
  return (
    <Form action={action} scroll={false} prefetch={false} className="admin-table-controls">
      <div className="admin-filters">
        <div className="admin-search">
          <label htmlFor={`${view}-search`}>Find a guest</label>
          <Input key={filters.q} id={`${view}-search`} name="q" type="search" maxLength={300} defaultValue={filters.q} placeholder="Name, phone, attendee or notes" />
        </div>
        {primary.map(select)}
      </div>
      <details key={advancedCount > 0 ? 'active' : 'default'} className="admin-table-more" open={advancedCount > 0 || undefined}>
        <summary>More filters{advancedCount > 0 ? ` (${advancedCount} active)` : ''}</summary>
        <div className="admin-filters">{advanced.map(select)}</div>
      </details>
      <div className="admin-table-control-footer">
        <div className="admin-filters">
          <div className="admin-filter">
            <label htmlFor={`${view}-sort`}>Sort by</label>
            <select key={filters.sort} id={`${view}-sort`} name="sort" className="admin-select" defaultValue={filters.sort}>
              {TABLE_SORT_OPTIONS[view].map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="admin-filter">
            <label htmlFor={`${view}-direction`}>Order</label>
            <select key={filters.direction} id={`${view}-direction`} name="direction" className="admin-select" defaultValue={filters.direction}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
          <FilterSubmit label="Apply filters" />
          <Link href={action} scroll={false} className="admin-filter-reset">Reset all</Link>
        </div>
        <p className="admin-filter-count">{activeCount ? `${activeCount} active ${activeCount === 1 ? 'filter' : 'filters'}` : 'Showing all records'}</p>
      </div>
    </Form>
  );
}

export function SortableHead({ label, column, action, filters }: {
  label: string;
  column: TableSort;
  action: string;
  filters: TableFilters;
}) {
  const active = filters.sort === column;
  const direction = active && filters.direction === 'asc' ? 'desc' : 'asc';
  return (
    <TableHead aria-sort={active ? (filters.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link href={tableHref(action, filters, { sort: column, direction })} scroll={false} prefetch={false} className="admin-sort-link" aria-label={`Sort by ${label}, ${direction === 'asc' ? 'ascending' : 'descending'}`}>
        {label}<span aria-hidden="true">{active ? filters.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
      </Link>
    </TableHead>
  );
}
