import { useMemo, useState } from 'react'
import { ArrowDownAZ, ArrowUpAZ, Pencil, Plus, Search } from 'lucide-react'

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
  const [sort, setSort] = useState({ key: columns[0]?.key || '', direction: 'asc' })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const searched = !q
      ? rows
      : rows.filter((row) =>
          searchKeys.some((key) => String(row?.[key] ?? '').toLowerCase().includes(q)),
        )

    if (!sort.key) return searched
    const column = columns.find((item) => item.key === sort.key)
    const read = column?.sortValue
      ? (row) => column.sortValue(row)
      : (row) => row?.[sort.key]

    return [...searched].sort((a, b) => {
      const av = read(a)
      const bv = read(b)
      const an = Number(av)
      const bn = Number(bv)
      let result = 0

      if (av == null && bv == null) result = 0
      else if (av == null) result = 1
      else if (bv == null) result = -1
      else if (Number.isFinite(an) && Number.isFinite(bn) && String(av).trim() !== '' && String(bv).trim() !== '') {
        result = an - bn
      } else {
        result = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true })
      }

      return sort.direction === 'asc' ? result : -result
    })
  }, [rows, query, searchKeys, columns, sort])

  const toggleSort = (column) => {
    if (column.sortable === false) return
    setSort((current) => ({
      key: column.key,
      direction: current.key === column.key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <div className="record-list-view">
      <div className="record-list-header">
        <div>
          <strong>{title}</strong>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
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

      <div className="record-list-search-row">
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
                {canEdit ? <th className="record-list-edit-head"></th> : null}
                {columns.map((column) => {
                  const active = sort.key === column.key
                  const Icon = active && sort.direction === 'desc' ? ArrowDownAZ : ArrowUpAZ
                  return (
                    <th key={column.key}>
                      <button
                        type="button"
                        className={`record-sort-button ${active ? 'is-active' : ''}`}
                        onClick={() => toggleSort(column)}
                        disabled={column.sortable === false}
                        title={active && sort.direction === 'asc' ? 'Sort Z to A' : 'Sort A to Z'}
                      >
                        <span>{column.label}</span>
                        {column.sortable === false ? null : <Icon size={13} />}
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  {canEdit ? (
                    <td className="record-list-edit-cell">
                      <button
                        type="button"
                        className="record-edit-button"
                        aria-label={`Edit ${row.name || row.full_name || row.username || 'record'}`}
                        onClick={() => onEdit?.(row)}
                      >
                        <Pencil size={13} />
                      </button>
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td key={column.key}>
                      {column.render ? column.render(row) : (row?.[column.key] ?? '—')}
                    </td>
                  ))}
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
