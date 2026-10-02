import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, FileDown, FileUp, Filter, GripVertical, Pencil, Plus, Search, Save, Trash2, X } from 'lucide-react'
import DataLoaderWindow from './DataLoaderWindow'

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

const normalizeComparable = (value) => {
  if (value == null || value === '') return ''
  const number = Number(value)
  if (Number.isFinite(number)) return number
  const date = Date.parse(value)
  if (Number.isFinite(date) && /[-/:]/.test(String(value))) return date
  return String(value).toLowerCase()
}

const matchesOperator = (raw, operator, expected) => {
  const actualText = valueLabel(raw).toLowerCase()
  const expectedText = String(expected ?? '').toLowerCase()
  if (!expectedText && !['is_blank', 'is_not_blank'].includes(operator)) return true

  if (operator === 'contains') return actualText.includes(expectedText)
  if (operator === 'not_contains') return !actualText.includes(expectedText)
  if (operator === 'starts_with') return actualText.startsWith(expectedText)
  if (operator === 'equals') return actualText === expectedText
  if (operator === 'not_equals') return actualText !== expectedText
  if (operator === 'is_blank') return raw == null || raw === ''
  if (operator === 'is_not_blank') return raw != null && raw !== ''

  const actual = normalizeComparable(raw)
  const wanted = normalizeComparable(expected)
  if (operator === 'greater_than') return actual > wanted
  if (operator === 'less_than') return actual < wanted
  if (operator === 'greater_or_equal') return actual >= wanted
  if (operator === 'less_or_equal') return actual <= wanted
  return true
}

const layoutKey = (title) => {
  let userId = 'anonymous'
  try {
    const user = JSON.parse(sessionStorage.getItem('onepos_user') || '{}')
    userId = user?.id || user?.username || 'anonymous'
  } catch {}
  return `onepos_recordlist_layout:${userId}:${String(title || 'list').toLowerCase().replace(/\s+/g, '-')}`
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
  objectKey = null,
  objectLabel = null,
  onDataChanged,
  selectedRowId = null,
  onRowSelect,
  searchValue,
  onSearchChange,
  selectable = false,
  selectedRowIds = [],
  onSelectionChange,
  bulkActions = [],
  onInlineEdit,
  page = 1,
  pageSize = 50,
  total = null,
  onPageChange,
}) {
  const [query, setQuery] = useState('')
  const resolvedQuery = onSearchChange ? (searchValue ?? '') : query
  const setResolvedQuery = (value) => onSearchChange ? onSearchChange(value) : setQuery(value)
  const [editingCell, setEditingCell] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [savingCell, setSavingCell] = useState(false)
  const [sort, setSort] = useState({ key: columns[0]?.key || '', direction: 'asc' })
  const [filters, setFilters] = useState({})
  const [filterOpen, setFilterOpen] = useState(null)
  const [draggingKey, setDraggingKey] = useState(null)
  const [dataLoaderMode, setDataLoaderMode] = useState(null)
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(layoutKey(title)) || '[]')
      return Array.isArray(saved) ? saved : []
    } catch {
      return []
    }
  })
  const filterAreaRef = useRef(null)

  useEffect(() => {
    const close = (event) => {
      if (!filterAreaRef.current?.contains(event.target)) setFilterOpen(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    const validKeys = columns.map((column) => column.key)
    setColumnOrder((current) => {
      const kept = current.filter((key) => validKeys.includes(key))
      const missing = validKeys.filter((key) => !kept.includes(key))
      return [...kept, ...missing]
    })
  }, [columns])

  useEffect(() => {
    if (!columnOrder.length) return
    try {
      localStorage.setItem(layoutKey(title), JSON.stringify(columnOrder))
    } catch {}
  }, [columnOrder, title])

  const orderedColumns = useMemo(() => {
    const byKey = new Map(columns.map((column) => [column.key, column]))
    const order = columnOrder.length ? columnOrder : columns.map((column) => column.key)
    return order.map((key) => byKey.get(key)).filter(Boolean)
  }, [columns, columnOrder])

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
    const q = resolvedQuery.trim().toLowerCase()
    let result = onSearchChange || !q
      ? rows
      : rows.filter((row) =>
          searchKeys.some((key) => String(row?.[key] ?? '').toLowerCase().includes(q)),
        )

    result = result.filter((row) =>
      columns.every((column) => {
        const config = filters[column.key]
        if (!config) return true

        const selected = config.values || []
        const raw = valueFor(column, row)
        if (selected.length && !selected.includes(JSON.stringify(raw))) return false

        if (config.operator) {
          return matchesOperator(raw, config.operator, config.value)
        }
        return true
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
  }, [rows, resolvedQuery, searchKeys, columns, sort, filters, onSearchChange])

  const toggleSort = (column) => {
    if (column.sortable === false) return
    setSort((current) => ({
      key: column.key,
      direction: current.key === column.key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const patchFilter = (columnKey, patch) => {
    setFilters((current) => ({
      ...current,
      [columnKey]: { values: [], operator: '', value: '', ...(current[columnKey] || {}), ...patch },
    }))
  }

  const toggleFilterValue = (columnKey, optionId) => {
    const current = filters[columnKey] || { values: [], operator: '', value: '' }
    const selected = current.values || []
    patchFilter(columnKey, {
      values: selected.includes(optionId)
        ? selected.filter((value) => value !== optionId)
        : [...selected, optionId],
    })
  }

  const clearColumnFilter = (columnKey) => {
    setFilters((current) => {
      const next = { ...current }
      delete next[columnKey]
      return next
    })
  }

  const moveColumn = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return
    setColumnOrder((current) => {
      const base = current.length ? [...current] : columns.map((column) => column.key)
      const from = base.indexOf(fromKey)
      const to = base.indexOf(toKey)
      if (from < 0 || to < 0) return base
      const [moved] = base.splice(from, 1)
      base.splice(to, 0, moved)
      return base
    })
  }

  const selectedSet = useMemo(() => new Set((selectedRowIds || []).map(String)), [selectedRowIds])
  const visibleIds = filtered.map((row) => String(row?.id ?? row?.record_id ?? '')).filter(Boolean)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))

  const changeSelection = (next) => onSelectionChange?.([...new Set(next.map(String))])
  const toggleRowSelection = (row, checked) => {
    const id = String(row?.id ?? row?.record_id ?? '')
    if (!id) return
    const next = new Set(selectedSet)
    if (checked) next.add(id)
    else next.delete(id)
    changeSelection([...next])
  }
  const toggleAllVisible = (checked) => {
    const next = new Set(selectedSet)
    visibleIds.forEach((id) => checked ? next.add(id) : next.delete(id))
    changeSelection([...next])
  }

  const beginInlineEdit = (row, column) => {
    if (!onInlineEdit || column.editable === false) return
    const id = row?.id ?? row?.record_id
    if (!id) return
    setEditingCell({ rowId: String(id), columnKey: column.key })
    setEditValue(row?.[column.key] ?? '')
  }

  const cancelInlineEdit = () => {
    setEditingCell(null)
    setEditValue('')
  }

  const saveInlineEdit = async (row, column) => {
    if (!onInlineEdit) return
    setSavingCell(true)
    try {
      await onInlineEdit(row, column, editValue)
      cancelInlineEdit()
    } finally {
      setSavingCell(false)
    }
  }

  const totalPages = total == null ? null : Math.max(1, Math.ceil(Number(total || 0) / Math.max(1, Number(pageSize || 50))))

  const resolvedSubtitle = typeof subtitle === 'function'
    ? subtitle({ filteredCount: filtered.length, totalCount: rows.length })
    : subtitle

  return (
    <div className="record-list-view">
      <div className="record-list-header">
        <div>
          <strong>{title}</strong>
          {resolvedSubtitle ? <p>{resolvedSubtitle}</p> : null}
        </div>
        <div className="record-list-header-actions">
          {objectKey ? (
            <div className="record-data-actions" aria-label="Data tools">
              <button
                type="button"
                className="record-data-icon"
                title={`Import ${objectLabel || title}`}
                aria-label={`Import ${objectLabel || title}`}
                onClick={() => setDataLoaderMode('import')}
              >
                <FileUp size={16} />
              </button>
              <button
                type="button"
                className="record-data-icon"
                title={`Export ${objectLabel || title}`}
                aria-label={`Export ${objectLabel || title}`}
                onClick={() => setDataLoaderMode('export')}
              >
                <FileDown size={16} />
              </button>
            </div>
          ) : null}
          {selectable && selectedSet.size ? (
            <div className="record-bulk-actions" aria-label="Bulk actions">
              <span>{selectedSet.size} selected</span>
              {bulkActions.map((action) => (
                <button
                  type="button"
                  key={action.key || action.label}
                  disabled={action.disabled}
                  onClick={() => action.onClick?.([...selectedSet])}
                >
                  {action.icon || null}{action.label}
                </button>
              ))}
            </div>
          ) : null}
          <button type="button" className="record-create-button" disabled={!canCreate} onClick={onCreate}>
            <Plus size={15} />
            {createLabel}
          </button>
        </div>
      </div>

      <div className="record-list-separator" aria-hidden="true" />

      <div className="record-list-search-row">
        <label className="record-list-search">
          <Search size={15} />
          <input
            value={resolvedQuery}
            onChange={(event) => setResolvedQuery(event.target.value)}
            placeholder="Search records"
            aria-label={`Search ${title}`}
          />
        </label>
      </div>

      {loading ? (
        <div className="record-list-state">Loading…</div>
      ) : error ? (
        <div className="workspace-error-state" role="alert">
          <strong>Unable to load records</strong>
          <span>{error}</span>
          {onDataChanged ? <button type="button" onClick={() => onDataChanged()}>Retry</button> : null}
        </div>
      ) : (
        <div className="record-list-table-wrap" ref={filterAreaRef}>
          <table className="record-list-table">
            <thead>
              <tr>
                {selectable ? (
                  <th className="record-list-select-head">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      aria-label="Select all visible records"
                      onChange={(event) => toggleAllVisible(event.target.checked)}
                    />
                  </th>
                ) : null}
                {canEdit ? <th className="record-list-edit-head"></th> : null}
                {orderedColumns.map((column) => {
                  const activeSort = sort.key === column.key
                  const SortIcon = activeSort && sort.direction === 'desc' ? ArrowDown : ArrowUp
                  const filter = filters[column.key] || {}
                  const activeFilter = Boolean((filter.values || []).length || filter.operator)
                  const options = filterOptions[column.key] || []
                  return (
                    <th
                      key={column.key}
                      className={`record-list-column-head ${draggingKey === column.key ? 'is-dragging' : ''}`}
                      tabIndex={0}
                      aria-label={`${column.label}. Hold Alt and use left or right arrow to reorder.`}
                      onKeyDown={(event) => {
                        if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
                        event.preventDefault()
                        const index = orderedColumns.findIndex((item) => item.key === column.key)
                        const target = event.key === 'ArrowLeft' ? orderedColumns[index - 1] : orderedColumns[index + 1]
                        if (target) moveColumn(column.key, target.key)
                      }}
                      draggable
                      onDragStart={(event) => {
                        setDraggingKey(column.key)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', column.key)
                      }}
                      onDragEnd={() => setDraggingKey(null)}
                      onDragOver={(event) => {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        moveColumn(event.dataTransfer.getData('text/plain'), column.key)
                        setDraggingKey(null)
                      }}
                    >
                      <div className="record-column-controls">
                        <GripVertical size={11} className="record-column-drag" />
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

                          <div className="record-filter-condition">
                            <select
                              value={filter.operator || ''}
                              onChange={(event) => patchFilter(column.key, { operator: event.target.value })}
                            >
                              <option value="">Choose condition…</option>
                              <option value="equals">Equals</option>
                              <option value="not_equals">Does not equal</option>
                              <option value="contains">Contains</option>
                              <option value="not_contains">Does not contain</option>
                              <option value="starts_with">Starts with</option>
                              <option value="greater_than">More than</option>
                              <option value="less_than">Less than</option>
                              <option value="greater_or_equal">More than or equal</option>
                              <option value="less_or_equal">Less than or equal</option>
                              <option value="is_blank">Is blank</option>
                              <option value="is_not_blank">Is not blank</option>
                            </select>
                            {filter.operator && !['is_blank', 'is_not_blank'].includes(filter.operator) ? (
                              <input
                                value={filter.value || ''}
                                onChange={(event) => patchFilter(column.key, { value: event.target.value })}
                                placeholder="Value"
                              />
                            ) : null}
                          </div>

                          <div className="record-filter-values-title">Values</div>
                          <div className="record-filter-options">
                            {options.map((option) => {
                              const checked = (filter.values || []).includes(option.id)
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
                <tr
                  key={row.id}
                  className={String(selectedRowId) === String(row.id) ? 'is-selected' : ''}
                  onClick={() => onRowSelect?.(row)}
                  tabIndex={onRowSelect ? 0 : undefined}
                  role={onRowSelect ? 'button' : undefined}
                  onKeyDown={(event) => {
                    if (!onRowSelect || !['Enter', ' '].includes(event.key)) return
                    event.preventDefault()
                    onRowSelect(row)
                  }}
                >
                  {selectable ? (
                    <td className="record-list-select-cell" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(String(row?.id ?? row?.record_id ?? ''))}
                        aria-label="Select record"
                        onChange={(event) => toggleRowSelection(row, event.target.checked)}
                      />
                    </td>
                  ) : null}
                  {canEdit ? (
                    <td className="record-list-edit-cell">
                      <button
                        type="button"
                        className="record-edit-button"
                        aria-label={`Edit ${row.name || row.full_name || row.username || 'record'}`}
                        onClick={(event) => { event.stopPropagation(); onEdit?.(row) }}
                      >
                        <Pencil size={13} />
                      </button>
                    </td>
                  ) : null}
                  {orderedColumns.map((column) => {
                    const rowId = String(row?.id ?? row?.record_id ?? '')
                    const isEditing = editingCell?.rowId === rowId && editingCell?.columnKey === column.key
                    return (
                      <td
                        key={column.key}
                        className={`record-list-value-cell ${onInlineEdit && column.editable !== false ? 'is-inline-editable' : ''}`}
                        data-label={column.label}
                        onDoubleClick={(event) => { event.stopPropagation(); beginInlineEdit(row, column) }}
                      >
                        {isEditing ? (
                          <div className="record-inline-editor" onClick={(event) => event.stopPropagation()}>
                            {column.editorType === 'select' ? (
                              <select value={editValue ?? ''} onChange={(event) => setEditValue(event.target.value)}>
                                <option value="">Select…</option>
                                {(column.options || []).map((option) => {
                                  const value = typeof option === 'object' ? option.value ?? option.key ?? option.label : option
                                  const label = typeof option === 'object' ? option.label ?? option.name ?? value : option
                                  return <option key={String(value)} value={String(value)}>{String(label)}</option>
                                })}
                              </select>
                            ) : column.editorType === 'boolean' ? (
                              <select value={String(editValue)} onChange={(event) => setEditValue(event.target.value === 'true')}>
                                <option value="true">Active</option>
                                <option value="false">Inactive</option>
                              </select>
                            ) : (
                              <input
                                type={column.editorType === 'number' ? 'number' : column.editorType === 'date' ? 'date' : column.editorType === 'datetime' ? 'datetime-local' : 'text'}
                                value={editValue ?? ''}
                                onChange={(event) => setEditValue(column.editorType === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)}
                                autoFocus
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') cancelInlineEdit()
                                  if (event.key === 'Enter') saveInlineEdit(row, column)
                                }}
                              />
                            )}
                            <button type="button" aria-label="Save inline edit" disabled={savingCell} onClick={() => saveInlineEdit(row, column)}><Save size={12} /></button>
                            <button type="button" aria-label="Cancel inline edit" disabled={savingCell} onClick={cancelInlineEdit}><X size={12} /></button>
                          </div>
                        ) : column.render ? column.render(row) : (row?.[column.key] ?? '—')}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={orderedColumns.length + (canEdit ? 1 : 0) + (selectable ? 1 : 0)} className="record-list-empty">
                    {emptyText}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      {onPageChange && totalPages ? (
        <div className="record-list-pagination">
          <span>{total == null ? "" : `${total} records`}</span>
          <div>
            <button type="button" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>Next</button>
          </div>
        </div>
      ) : null}
      {dataLoaderMode && objectKey ? (
        <DataLoaderWindow
          objectKey={objectKey}
          objectLabel={objectLabel || title}
          initialMode={dataLoaderMode}
          onClose={() => setDataLoaderMode(null)}
          onImported={onDataChanged}
        />
      ) : null}
      <style>{`
        .record-bulk-actions { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .record-bulk-actions span { font-size:11px; color:var(--text-secondary,#64748b); }
        .record-bulk-actions button { display:inline-flex; align-items:center; gap:4px; border:1px solid var(--border-color,#d1d5db); border-radius:7px; background:var(--card-background,#fff); padding:6px 8px; font-size:10px; cursor:pointer; }
        .record-list-select-head, .record-list-select-cell { width:34px; text-align:center; }
        .record-list-value-cell.is-inline-editable { cursor:text; }
        .record-inline-editor { display:flex; align-items:center; gap:4px; min-width:140px; }
        .record-inline-editor input, .record-inline-editor select { min-width:0; flex:1; border:1px solid var(--border-color,#d1d5db); border-radius:6px; padding:5px 6px; font-size:11px; }
        .record-inline-editor button { display:grid; place-items:center; border:1px solid var(--border-color,#d1d5db); border-radius:6px; background:var(--card-background,#fff); padding:5px; cursor:pointer; }
        .record-list-pagination { display:flex; align-items:center; justify-content:space-between; gap:10px; border-top:1px solid var(--border-color,#e5e7eb); padding:10px 12px; color:var(--text-secondary,#64748b); font-size:10px; }
        .record-list-pagination > div { display:flex; align-items:center; gap:8px; }
        .record-list-pagination button { border:1px solid var(--border-color,#d1d5db); border-radius:7px; background:var(--card-background,#fff); padding:5px 8px; font-size:10px; cursor:pointer; }
        .record-list-pagination button:disabled { cursor:not-allowed; opacity:.45; }
      `}</style>
    </div>
  )
}
