import type { ReactNode } from 'react';
import Form from 'next/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { FilterSubmit } from './filter-submit';

export function AdminPageHeader({
  title,
  description,
  eyebrow,
  children,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <div className="admin-page-header">
      <div>
        {eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="admin-description">{description}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
export function SummaryCard({
  label,
  value,
  hint,
  highlight = false,
}: {
  label: string;
  value: number;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`admin-stat ${highlight ? 'admin-stat-highlight' : ''}`}>
      <CardContent>
        <dl>
          <dt className="text-sm font-medium">{label}</dt>
          <dd>
            <strong>{value.toLocaleString('en-GB')}</strong>
          </dd>
        </dl>
        <p>{hint}</p>
      </CardContent>
    </Card>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="admin-empty">
      <strong>{title}</strong>
      <p>{description}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'positive' | 'warm' | 'quiet' | 'neutral';
}) {
  return (
    <span className="admin-status" data-tone={tone}>
      {children}
    </span>
  );
}
export type Filter = {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
};
export function SearchFilters({
  action,
  query,
  filters = [],
  children,
}: {
  action: string;
  query: string;
  filters?: Filter[];
  children?: ReactNode;
}) {
  return (
    <Form action={action} className="admin-filters">
      <div className="admin-search">
        <label htmlFor={`${action}-search`}>Find a guest</label>
        <Input
          key={query}
          id={`${action}-search`}
          name="q"
          defaultValue={query}
          placeholder="Search by name or phone number"
          type="search"
        />
      </div>
      {filters.map((filter) => (
        <div className="admin-filter" key={filter.name}>
          <label htmlFor={`${action}-${filter.name}`}>{filter.label}</label>
          <select
            key={filter.value}
            className="admin-select"
            id={`${action}-${filter.name}`}
            name={filter.name}
            defaultValue={filter.value}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {children}
      <FilterSubmit />
    </Form>
  );
}
export function Feedback({ error, success }: { error?: string | null; success?: string | null }) {
  return (
    <>
      {error && (
        <p role="alert" className="admin-error">
          {error}
          {error.startsWith('Your session has ended') && (
            <>
              {' '}
              <a
                href="/admin/login"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Sign in again in another tab
              </a>
              , then return here to save your details.
            </>
          )}
        </p>
      )}
      {success && (
        <p role="status" className="admin-success">
          {success}
        </p>
      )}
    </>
  );
}
