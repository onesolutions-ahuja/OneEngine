import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Filter, Pencil, Plus, Search } from 'lucide-react'

const valueFor = (column, row) => {
  if (column.filterValue) return column.filterValue(row)
  if (column.sortValue) return column.sortValue(row)
  return row?.[column.key]
}

const valueLabel = (value) => {
  if (value === true) return 'Active'
  if (value === false) return 'Inactive'
  if (value == null || value === '') return 'Blank'
  return String(value)
}

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
  const [filters, setFilters] = useState({})
  const [filterOpen, setFilterOpen] = useState(null)
  const filterAreaRef = useRef(null)

  useEffect(() => {
    const close = (event) => {
      if (!filterAreaRef.current?.contains(event.target)) setFilterOpen(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const filterOptions = useMemo(() => {
    const result = {}
    for (const column of columns) {
      const seen = new Map()
      for (const row of rows) {
        const raw = valueFor(column, row)
        const id = JSON.stringify(raw)
        if (!seen.has(id)) seen.set(id, { id, raw, label: valueLabel(raw) })
      }
      result[column.key] = [...seen.values()].sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }),
      )
    }
    return result
  }, [rows, columns])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let result = !q
      ? rows
      : rows.filter((row) =>
          searchKeys.some((key) => String(row?.[key] ?? '').toLowerCase().includes(q)),
        )

    result = result.filter((row) =>
      columns.every((column) => {
        const selected = filters[column.key]
        if (!selected?.length) return true
        return selected.includes(JSON.stringify(valueFor(column, row)))
      }),
    )

    if (!sort.key) return result
    const column = columns.find((item) => item.key === sort.key)
    const read = column?.sortValue
      ? (row) => column.sortValue(row)
      : (row) => row?.[sort.key]

    return [...result].sort((a, b) => {
      const av = read(a)
      const bv = read(b)
      const an = Number(av)
      const bn = Number(bv)
      let comparison = 0

      if (av == null && bv == null) comparison = 0
      else if (av == null) comparison = 1
      else if (bv == null) comparison = -1
      else if (Number.isFinite(an) && Number.isFinite(bn) && String(av).trim() !== '' && String(bv).trim() !== '') {
        comparison = an - bn
      } else {
        comparison = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true })
      }

      return sort.direction === 'asc' ? comparison : -comparison
    })
  }, [rows, query, searchKeys, columns, sort, filters])

  const toggleSort = (column) => {
    if (column.sortable === false) return
    setSort((current) => ({
      key: column.key,
      direction: current.key === column.key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const toggleFilterValue = (columnKey, optionId) => {
    setFilters((current) => {
      const selected = current[columnKey] || []
      const next = selected.includes(optionId)
        ? selected.filter((value) => value !== optionId)
        : [...selected, optionId]
      return { ...current, [columnKey]: next }
    })
  }

  const clearColumnFilter = (columnKey) => {
    setFilters((current) => ({ ...current, [columnKey]: [] }))
  }

  return (
    <div className="record-list-view">
      <div className="record-list-header">
        <div>
          <strong>{title}</strong>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <button type="button" className="record-create-button" disabled={!canCreate} onClick={onCreate}>
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
        <div className="record-list-table-wrap" ref={filterAreaRef}>
          <table className="record-list-table">
            <thead>
              <tr>
                {canEdit ? <th className="record-list-edit-head"></th> : null}
                {columns.map((column) => {
                  const activeSort = sort.key === column.key
                  const SortIcon = activeSort && sort.direction === 'desc' ? ArrowDown : ArrowUp
                  const activeFilter = (filters[column.key] || []).length > 0
                  const options = filterOptions[column.key] || []
                  return (
                    <th key={column.key} className="record-list-column-head">
                      <div className="record-column-controls">
                        <button
                          type="button"
                          className={`record-sort-button ${activeSort ? 'is-active' : ''}`}
                          onClick={() => toggleSort(column)}
                          disabled={column.sortable === false}
                          title={activeSort && sort.direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
                        >
                          <span>{column.label}</span>
                          {column.sortable === false ? null : <SortIcon size={12} />}
                        </button>

                        <button
                          type="button"
                          className={`record-filter-button ${activeFilter ? 'is-active' : ''}`}
                          aria-label={`Filter ${column.label}`}
                          aria-expanded={filterOpen === column.key}
                          onClick={(event) => {
                            event.stopPropagation()
                            setFilterOpen((current) => current === column.key ? null : column.key)
                          }}
                        >
                          <Filter size={12} />
                        </button>
                      </div>

                      {filterOpen === column.key ? (
                        <div className="record-filter-popover" onClick={(event) => event.stopPropagation()}>
                          <div className="record-filter-popover-head">
                            <strong>Filter {column.label}</strong>
                            <button type="button" onClick={() => clearColumnFilter(column.key)}>Clear</button>
                          </div>
                          <div className="record-filter-options">
                            {options.map((option) => {
                              const checked = (filters[column.key] || []).includes(option.id)
                              return (
                                <label key={option.id} className="record-filter-option">
                                  <span className={`record-filter-check ${checked ? 'is-checked' : ''}`}>
                                    {checked ? <Check size={11} /> : null}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleFilterValue(column.key, option.id)}
                                  />
                                  <span>{option.label}</span>
                                </label>
                              )
                            })}
                          </div>
                          <div className="record-filter-popover-foot">
                            <button type="button" onClick={() => setFilterOpen(null)}>Done</button>
                          </div>
                        </div>
                      ) : null}
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
