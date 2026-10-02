import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Columns3, Copy, FileDown, FileUp, Filter, GripVertical, LayoutList, Pencil, Plus, Save, Search, Star, Trash2 } from 'lucide-react'
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

const serializeFilters = (filters = {}) => {
  const result = []
  for (const [field, config] of Object.entries(filters || {})) {
    const selected = Array.isArray(config?.values) ? config.values : []
    if (selected.length) {
      result.push({
        field,
        operator: 'in',
        value: selected.map((item) => {
          try { return JSON.parse(item) } catch { return item }
        }),
      })
    }
    if (config?.operator) {
      result.push({
        field,
        operator: config.operator,
        value: ['is_blank', 'is_not_blank'].includes(config.operator) ? null : config.value,
      })
    }
  }
  return result
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
  availableColumns = [],
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
  listViews = [],
  activeListViewId = '',
  onListViewChange = null,
  onSaveListView = null,
  canUpdateActiveView = false,
  serverMode = false,
  searchValue,
  onSearchChange,
  sortValue,
  onSortChange,
  filtersValue,
  onFiltersChange,
  pageInfo = null,
  onPageChange = null,
  onInlineEdit = null,
  onBulkEdit = null,
  onBulkDelete = null,
  onManageListView = null,
  displayMode = 'table',
  onDisplayModeChange = null,
  kanbanFields = [],
  kanbanField = '',
  onKanbanFieldChange = null,
  onKanbanMove = null,
}) {
  const [localQuery, setLocalQuery] = useState('')
  const [localSort, setLocalSort] = useState({ key: columns[0]?.key || '', direction: 'asc' })
  const [localFilters, setLocalFilters] = useState({})
  const query = searchValue !== undefined ? searchValue : localQuery
  const sort = sortValue !== undefined ? sortValue : localSort
  const filters = filtersValue !== undefined ? filtersValue : localFilters
  const setQuery = (next) => onSearchChange ? onSearchChange(next) : setLocalQuery(next)
  const setSort = (next) => {
    if (onSortChange) {
      const resolved = typeof next === 'function' ? next(sort) : next
      onSortChange(resolved)
      return
    }
    setLocalSort(next)
  }
  const setFilters = (next) => {
    if (onFiltersChange) {
      const resolved = typeof next === 'function' ? next(filters) : next
      onFiltersChange(resolved)
      return
    }
    setLocalFilters(next)
  }
  const [filterOpen, setFilterOpen] = useState(null)
  const [columnPickerOpen, setColumnPickerOpen] = useState(false)
  const [draggingKey, setDraggingKey] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [editingCell, setEditingCell] = useState(null)
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(() => columns.map((column) => column.key))
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
    const visible = new Set((rows || []).map((row) => String(row.id)))
    setSelectedIds((current) => current.filter((id) => visible.has(String(id))))
  }, [rows])

  useEffect(() => {
    const close = (event) => {
      if (!filterAreaRef.current?.contains(event.target)) setFilterOpen(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    const all = (availableColumns.length ? availableColumns : columns)
    const validKeys = all.map((column) => column.key)
    const configuredKeys = columns.map((column) => column.key).filter((key) => validKeys.includes(key))
    setColumnOrder((current) => {
      if (activeListViewId) return configuredKeys
      const kept = current.filter((key) => validKeys.includes(key))
      const missing = configuredKeys.filter((key) => !kept.includes(key))
      return [...kept, ...missing]
    })
    setVisibleColumnKeys((current) => {
      if (activeListViewId) return configuredKeys
      const kept = current.filter((key) => validKeys.includes(key))
      return kept.length ? kept : configuredKeys
    })
  }, [columns, availableColumns, activeListViewId])

  useEffect(() => {
    if (!columnOrder.length) return
    try {
      localStorage.setItem(layoutKey(title), JSON.stringify(columnOrder))
    } catch {}
  }, [columnOrder, title])

  const orderedColumns = useMemo(() => {
    const all = availableColumns.length ? availableColumns : columns
    const byKey = new Map(all.map((column) => [column.key, column]))
    const visible = new Set(visibleColumnKeys.length ? visibleColumnKeys : columns.map((column) => column.key))
    const order = columnOrder.length ? columnOrder : columns.map((column) => column.key)
    const ordered = order.filter((key) => visible.has(key)).map((key) => byKey.get(key)).filter(Boolean)
    const missing = [...visible].filter((key) => !order.includes(key)).map((key) => byKey.get(key)).filter(Boolean)
    return [...ordered, ...missing]
  }, [columns, availableColumns, columnOrder, visibleColumnKeys])

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
    if (serverMode) return Array.isArray(rows) ? rows : []
    const q = query.trim().toLowerCase()
    let result = !q
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
  }, [rows, query, searchKeys, columns, sort, filters, serverMode])

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

  const toggleColumnVisibility = (key) => {
    setVisibleColumnKeys((current) => {
      const present = current.includes(key)
      if (present && current.length <= 1) return current
      if (present) return current.filter((item) => item !== key)
      setColumnOrder((order) => order.includes(key) ? order : [...order, key])
      return [...current, key]
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

  const resolvedSubtitle = typeof subtitle === 'function'
    ? subtitle({ filteredCount: filtered.length, totalCount: rows.length })
    : subtitle

  const kanbanColumn = columns.find((column) => column.key === kanbanField) || null
  const kanbanValues = useMemo(() => {
    if (!kanbanColumn) return []
    const configured = Array.isArray(kanbanColumn.options)
      ? kanbanColumn.options.filter((option) => option?.active !== false).map((option) => ({
          value: typeof option === 'object' ? option.value ?? option.key ?? option.label : option,
          label: typeof option === 'object' ? option.label ?? option.name ?? option.value : option,
        }))
      : []
    const seen = new Map(configured.map((option) => [String(option.value), option]))
    for (const row of filtered) {
      const raw = row?.[kanbanField]
      const key = String(raw ?? '')
      if (!seen.has(key)) seen.set(key, { value: raw ?? '', label: valueLabel(raw) })
    }
    return [...seen.values()]
  }, [filtered, kanbanColumn, kanbanField])

  const selectionEnabled = Boolean(onBulkEdit || onBulkDelete)
  const visibleIds = filtered.map((row) => String(row.id))
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const currentSet = new Set(current.map(String))
      if (allVisibleSelected) visibleIds.forEach((id) => currentSet.delete(id))
      else visibleIds.forEach((id) => currentSet.add(id))
      return [...currentSet]
    })
  }

  const toggleSelected = (id) => {
    const key = String(id)
    setSelectedIds((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }

  const beginInlineEdit = (row, column) => {
    if (!canEdit || !onInlineEdit || column.editable === false) return
    const type = String(column.fieldType || 'text').toLowerCase()
    if (['lookup','multiselect','formula','rollup','json'].includes(type)) return
    setEditingCell({ rowId: String(row.id), key: column.key, value: row?.[column.key] ?? '' })
  }

  const commitInlineEdit = async (row, column, value) => {
    setEditingCell(null)
    if (!onInlineEdit) return
    await onInlineEdit(row, column, value)
  }

  const inlineEditor = (row, column) => {
    const type = String(column.fieldType || 'text').toLowerCase()
    const value = editingCell?.value ?? ''
    const setValue = (next) => setEditingCell((current) => current ? { ...current, value: next } : current)
    if (type === 'boolean') {
      return <input autoFocus type="checkbox" checked={Boolean(value)} onChange={(event) => { const next = event.target.checked; setValue(next); void commitInlineEdit(row, column, next) }} onClick={(event) => event.stopPropagation()} />
    }
    if (['picklist','select'].includes(type)) {
      const options = Array.isArray(column.options) ? column.options : []
      return (
        <select autoFocus value={value ?? ''} onChange={(event) => { const next = event.target.value; setValue(next); void commitInlineEdit(row, column, next) }} onBlur={() => setEditingCell(null)} onClick={(event) => event.stopPropagation()}>
          <option value="">Select…</option>
          {options.filter((option) => option?.active !== false).map((option) => {
            const optionValue = typeof option === 'object' ? option.value ?? option.key ?? option.label : option
            const optionLabel = typeof option === 'object' ? option.label ?? option.name ?? optionValue : option
            return <option key={String(optionValue)} value={String(optionValue)}>{String(optionLabel)}</option>
          })}
        </select>
      )
    }
    const htmlType = ['number','decimal','currency'].includes(type) ? 'number'
      : type === 'date' ? 'date'
        : type === 'datetime' ? 'datetime-local'
          : type === 'email' ? 'email'
            : type === 'phone' ? 'tel'
              : 'text'
    return (
      <input
        autoFocus
        type={htmlType}
        value={value ?? ''}
        onChange={(event) => setValue(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onBlur={() => void commitInlineEdit(row, column, editingCell?.value ?? '')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); setEditingCell(null) }
          if (event.key === 'Enter') { event.preventDefault(); void commitInlineEdit(row, column, editingCell?.value ?? '') }
        }}
      />
    )
  }

  return (
    <div className="record-list-view">
      <div className="record-list-header">
        <div>
          <strong>{title}</strong>
          {resolvedSubtitle ? <p>{resolvedSubtitle}</p> : null}
        </div>
        <div className="record-list-header-actions">
          {listViews.length ? (
            <label className="record-list-view-picker">
              <span className="sr-only">List view</span>
              <select value={activeListViewId || ''} onChange={(event) => onListViewChange?.(event.target.value)}>
                {listViews.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.scope === 'PERSONAL' || view.owner_user_id ? 'My · ' : ''}{view.label}{view.is_default ? ' · Default' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {onSaveListView ? (
            <div className="record-data-actions" aria-label="List view tools">
              {canUpdateActiveView && activeListViewId ? (
                <button
                  type="button"
                  className="record-data-icon"
                  title="Save current view"
                  aria-label="Save current view"
                  onClick={() => onSaveListView({
                    columns: orderedColumns.map((column) => column.key),
                    filters: serializeFilters(filters),
                    sort: { field: sort?.key || null, direction: sort?.direction || 'asc' },
                    pageSize: pageInfo?.pageSize || 50,
                  }, 'update')}
                >
                  <Save size={15} />
                </button>
              ) : null}
              <button
                type="button"
                className="record-data-icon"
                title="Save as a personal view"
                aria-label="Save as a personal view"
                onClick={() => onSaveListView({
                  columns: orderedColumns.map((column) => column.key),
                  filters: serializeFilters(filters),
                  sort: { field: sort?.key || null, direction: sort?.direction || 'asc' },
                  pageSize: pageInfo?.pageSize || 50,
                }, 'new')}
              >
                <Copy size={15} />
              </button>
              {onManageListView && canUpdateActiveView && activeListViewId ? (
                <>
                  <button type="button" className="record-data-icon" title="Make this my default view" aria-label="Make this my default view" onClick={() => onManageListView('default')}>
                    <Star size={15} />
                  </button>
                  <button type="button" className="record-data-icon" title="Rename this view" aria-label="Rename this view" onClick={() => onManageListView('rename')}>
                    <Pencil size={15} />
                  </button>
                  <button type="button" className="record-data-icon" title="Delete this view" aria-label="Delete this view" onClick={() => onManageListView('delete')}>
                    <Trash2 size={15} />
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          {(availableColumns.length || columns.length) ? (
            <div className="record-column-picker-wrap">
              <button type="button" className="record-data-icon" title="Select fields to display" aria-label="Select fields to display" aria-expanded={columnPickerOpen} onClick={() => setColumnPickerOpen((value) => !value)}>
                <Columns3 size={15} />
              </button>
              {columnPickerOpen ? (
                <div className="record-column-picker" role="dialog" aria-label="Select fields to display">
                  <strong>Fields to display</strong>
                  <div>
                    {(availableColumns.length ? availableColumns : columns).map((column) => {
                      const checked = visibleColumnKeys.includes(column.key)
                      return (
                        <label key={column.key}>
                          <input type="checkbox" checked={checked} onChange={() => toggleColumnVisibility(column.key)} />
                          <span>{column.label}</span>
                        </label>
                      )
                    })}
                  </div>
                  <button type="button" onClick={() => setColumnPickerOpen(false)}>Done</button>
                </div>
              ) : null}
            </div>
          ) : null}
          {onDisplayModeChange ? (
            <div className="record-data-actions" aria-label="Display mode">
              <button type="button" className={`record-data-icon ${displayMode === 'table' ? 'is-active' : ''}`} title="Table view" aria-label="Table view" onClick={() => onDisplayModeChange('table')}>
                <LayoutList size={15} />
              </button>
              <button type="button" className={`record-data-icon ${displayMode === 'split' ? 'is-active' : ''}`} title="Split view" aria-label="Split view" onClick={() => onDisplayModeChange('split')}>
                <Columns3 size={15} />
              </button>
              <button type="button" className={`record-data-icon ${displayMode === 'kanban' ? 'is-active' : ''}`} title="Kanban view" aria-label="Kanban view" disabled={!kanbanFields.length} onClick={() => onDisplayModeChange('kanban')}>
                <GripVertical size={15} />
              </button>
            </div>
          ) : null}
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
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search records"
            aria-label={`Search ${title}`}
          />
        </label>
        {displayMode === 'kanban' && kanbanFields.length ? (
          <label className="record-list-view-picker">
            <span className="sr-only">Kanban grouping field</span>
            <select value={kanbanField || ''} onChange={(event) => onKanbanFieldChange?.(event.target.value)}>
              {kanbanFields.map((field) => <option key={field.key} value={field.key}>Group by {field.label}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {selectionEnabled && selectedIds.length ? (
        <div className="record-list-bulk-actions">
          <strong>{selectedIds.length} selected</strong>
          {onBulkEdit && canEdit ? <button type="button" onClick={() => onBulkEdit([...selectedIds])}>Edit selected</button> : null}
          {onBulkDelete ? <button type="button" onClick={() => onBulkDelete([...selectedIds])}>Delete selected</button> : null}
          <button type="button" onClick={() => setSelectedIds([])}>Clear</button>
        </div>
      ) : null}

      {loading ? (
        <div className="record-list-state">Loading…</div>
      ) : error ? (
        <div className="workspace-error-state" role="alert">
          <strong>Unable to load records</strong>
          <span>{error}</span>
          {onDataChanged ? <button type="button" onClick={() => onDataChanged()}>Retry</button> : null}
        </div>
      ) : displayMode === 'kanban' && kanbanColumn ? (
        <div className="record-kanban-wrap">
          <div className="record-kanban-board">
            {kanbanValues.map((group) => {
              const groupRows = filtered.filter((row) => String(row?.[kanbanField] ?? '') === String(group.value ?? ''))
              return (
                <section
                  className="record-kanban-column"
                  key={String(group.value)}
                  onDragOver={(event) => { if (onKanbanMove && canEdit) event.preventDefault() }}
                  onDrop={(event) => {
                    if (!onKanbanMove || !canEdit) return
                    event.preventDefault()
                    const rowId = event.dataTransfer.getData('application/x-oneengine-record-id')
                    if (rowId) void onKanbanMove(rowId, kanbanField, group.value)
                  }}
                >
                  <header><strong>{group.label}</strong><span>{groupRows.length}</span></header>
                  <div className="record-kanban-stack">
                    {groupRows.map((row) => (
                      <article
                        key={row.id}
                        className={`record-kanban-card ${String(selectedRowId) === String(row.id) ? 'is-selected' : ''}`}
                        draggable={Boolean(onKanbanMove && canEdit)}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('application/x-oneengine-record-id', String(row.id))
                        }}
                        onClick={() => onRowSelect?.(row)}
                        tabIndex={0}
                        onKeyDown={(event) => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); onRowSelect?.(row) } }}
                      >
                        <strong>{String(row?.[orderedColumns[0]?.key] ?? row?.name ?? row?.id ?? 'Record')}</strong>
                        {orderedColumns.slice(1, 4).map((column) => <span key={column.key}><b>{column.label}:</b> {valueLabel(row?.[column.key])}</span>)}
                      </article>
                    ))}
                    {!groupRows.length ? <div className="record-kanban-empty">No records</div> : null}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="record-list-table-wrap" ref={filterAreaRef}>
          <table className="record-list-table">
            <thead>
              <tr>
                {selectionEnabled ? (
                  <th className="record-list-select-head">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible records" />
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
                  {selectionEnabled ? (
                    <td className="record-list-select-cell">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(String(row.id))}
                        onChange={() => toggleSelected(row.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Select ${row.name || row.full_name || row.username || 'record'}`}
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
                    const isEditing = editingCell?.rowId === String(row.id) && editingCell?.key === column.key
                    return (
                      <td
                        key={column.key}
                        className={`record-list-value-cell${canEdit && onInlineEdit && column.editable !== false ? ' is-inline-editable' : ''}`}
                        data-label={column.label}
                        onDoubleClick={(event) => { event.stopPropagation(); beginInlineEdit(row, column) }}
                        title={canEdit && onInlineEdit && column.editable !== false ? 'Double-click to edit' : undefined}
                      >
                        {isEditing ? inlineEditor(row, column) : (column.render ? column.render(row) : (row?.[column.key] ?? '—'))}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={orderedColumns.length + (canEdit ? 1 : 0) + (selectionEnabled ? 1 : 0)} className="record-list-empty">
                    {emptyText}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      {pageInfo && Number(pageInfo.pages || 0) > 1 ? (
        <div className="record-list-pagination" aria-label="Record pages">
          <button
            type="button"
            className="record-data-icon"
            disabled={Number(pageInfo.page || 1) <= 1}
            onClick={() => onPageChange?.(Number(pageInfo.page || 1) - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={15} />
          </button>
          <span>Page {pageInfo.page || 1} of {pageInfo.pages || 1} · {pageInfo.total || 0} records</span>
          <button
            type="button"
            className="record-data-icon"
            disabled={Number(pageInfo.page || 1) >= Number(pageInfo.pages || 1)}
            onClick={() => onPageChange?.(Number(pageInfo.page || 1) + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      ) : pageInfo && Number(pageInfo.total || 0) >= 0 ? (
        <div className="record-list-pagination"><span>{pageInfo.total || 0} records</span></div>
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
    </div>
  )
}
