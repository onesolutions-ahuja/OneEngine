import { useMemo, useState } from 'react'
import { Pencil, Plus, Search } from 'lucide-react'

export default function RecordListView({
  title,
  subtitle,
  rows = [],
  columns = [],
  searchKeys = [],
  createLabel = 'Create New',
  canCreate = false,
  canEdit = false,
  onCreate,
  onEdit,
  loading = false,
  error = '',
  emptyText = 'No records found.',
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      searchKeys.some((key) => String(row?.[key] ?? '').toLowerCase().includes(q)),
    )
  }, [rows, query, searchKeys])

  return (
    <div className="record-list-view">
      <div className="record-list-actions">
        <button
          type="button"
          className="record-create-button"
          disabled={!canCreate}
          onClick={onCreate}
        >
          <Plus size={15} />
          {createLabel}
        </button>
      </div>

      <div className="record-list-separator" aria-hidden="true" />

      <div className="record-list-header">
        <div>
          <strong>{title}</strong>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <label className="record-list-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search records"
            aria-label={`Search ${title}`}
          />
        </label>
      </div>

      {loading ? (
        <div className="record-list-state">Loading…</div>
      ) : error ? (
        <div className="record-list-state record-list-state--error">{error}</div>
      ) : (
        <div className="record-list-table-wrap">
          <table className="record-list-table">
            <thead>
              <tr>
                {columns.map((column) => <th key={column.key}>{column.label}</th>)}
                {canEdit ? <th className="record-list-edit-head">Edit</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      {column.render ? column.render(row) : (row?.[column.key] ?? '—')}
                    </td>
                  ))}
                  {canEdit ? (
                    <td className="record-list-edit-cell">
                      <button
                        type="button"
                        className="record-edit-button"
                        aria-label={`Edit ${row.name || row.full_name || row.username || 'record'}`}
                        onClick={() => onEdit?.(row)}
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (canEdit ? 1 : 0)} className="record-list-empty">
                    {emptyText}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
