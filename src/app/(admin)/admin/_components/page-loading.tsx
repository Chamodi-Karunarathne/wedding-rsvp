/** Route content streams separately so the family navigation stays usable. */
export function AdminPageLoading({ title = 'Overview' }: { title?: string }) {
  return (
    <section className="admin-page-loading" aria-busy="true" aria-label={`Loading ${title}`}>
      <div className="admin-page-header">
        <div>
          <h1>{title}</h1>
          <p role="status" className="admin-description">Loading the latest details…</p>
        </div>
      </div>
      <div className="admin-loading-card" aria-hidden="true">
        <div className="admin-loading-line admin-loading-line-short" />
        <div className="admin-loading-line" />
        <div className="admin-loading-line" />
        <div className="admin-loading-line" />
        <div className="admin-loading-line" />
      </div>
    </section>
  );
}
