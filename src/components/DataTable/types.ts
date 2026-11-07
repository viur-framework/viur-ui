// Types of the DataTable widget — modeled after <wa-data-grid> (WebAwesome Pro
// v12), but with Vue means: cell content comes via slots instead of
// Lit templates, state via v-model instead of properties on the element.

export type Row = Record<string, unknown>

export type Align = "start" | "center" | "end"
export type PinSide = "start" | "end"

export type SortMode =
  | "auto" // numbers numerically, dates chronologically, otherwise alphanumerically
  | "text"
  | "textCaseSensitive"
  | "number"
  | "datetime"
  | "basic"

export type FilterType =
  | "text" // substring, case-insensitive (default)
  | "equals"
  | "number-range" // [min, max]
  | "date-range" // [from, to], inclusive by calendar day
  | "set" // value is one of the selected ones
  | "includes-any" // array cell contains one of the selected ones
  | "includes-all" // array cell contains all selected ones

export type AggregationKind = "sum" | "min" | "max" | "extent" | "mean" | "median" | "count" | "unique" | "uniqueCount"

export interface FilterOption {
  value: string
  label?: string
  count?: number
}

/** A column definition. Plain data object — reactive, without render logic. */
export interface DataTableColumn<R extends Row = Row> {
  /** Path into the row, dot paths allowed ("user.name"). Serves as the id if `id` is missing. */
  field?: string
  /** Explicit id. Required for columns without `field` (actions, computed columns). */
  id?: string
  /**
   * Computes the cell value from the row. Unlike `formatter` (display only),
   * this value is used for sorting, filtering, search and export.
   */
  value?: (row: R) => unknown
  label?: string
  align?: Align
  headerAlign?: Align
  /** Default: true as soon as `field` or `value` is present. */
  sortable?: boolean
  sortFn?: SortMode
  /** Where empty values sort to. */
  sortUndefined?: false | "first" | "last"
  /** First sort of this column is descending. */
  sortDescFirst?: boolean
  comparator?: (a: unknown, b: unknown, rowA: R, rowB: R) => number
  /** Default: true as soon as `field` or `value` is present. */
  searchable?: boolean
  filterable?: boolean
  filterType?: FilterType
  filterFn?: (value: unknown, filterValue: unknown, row: R) => boolean
  /** Replaces the computed facets in the set/includes filter (e.g. in server mode). */
  filterOptions?: FilterOption[]
  hidden?: boolean
  hideable?: boolean
  resizable?: boolean
  movable?: boolean
  pinnable?: boolean
  pinned?: PinSide
  width?: number
  minWidth?: number
  maxWidth?: number
  /** Share of the free space; beats `width`. */
  flex?: number
  /** Cell text. For rich content use the `cell:<id>` slot. */
  formatter?: (value: unknown, row: R) => string
  /**
   * Render value(s) as colored badge(s) instead of text. Positive values
   * green, negative red, everything in between rainbow-graded — see
   * `badgesForBone` in viurColumns.ts, which creates this function for plain
   * select and bool bones.
   */
  badge?: (value: unknown, row: R) => CellBadge[] | null
  /** Footer: text or function over the filtered rows (all pages). */
  footer?: string | ((rows: R[]) => string)
  aggregation?: AggregationKind | ((values: unknown[], rows: R[]) => unknown)
  cellClass?: string | ((value: unknown, row: R) => string)
}

/** Column with resolved defaults — what the component uses internally. */
/** A colored cell badge (see DataTableColumn.badge). */
export interface CellBadge {
  label: string
  /** CSS color (base tone); the table mixes background/border itself. */
  color: string
}

export interface ResolvedColumn<R extends Row = Row> {
  id: string
  def: DataTableColumn<R>
  field?: string
  label: string
  align: Align
  headerAlign: Align
  sortable: boolean
  searchable: boolean
  filterable: boolean
  filterType: FilterType
  hideable: boolean
  /** Cell value of a row (value() or dot path). */
  get: (row: R) => unknown
  /** Cell text for display, text search, copying and CSV. */
  text: (row: R) => string
}

export interface SortEntry {
  id: string
  desc: boolean
}

export interface FilterEntry {
  id: string
  value: unknown
}

export interface ColumnFacets {
  /** Distinct values with hit count, descending by frequency. */
  values: { value: string; count: number }[]
  min?: number
  max?: number
}

/** Request to the server (dataSource / data-request). */
export interface DataTableRequest {
  sort: SortEntry[]
  filters: FilterEntry[]
  search: string
  page: number
  pageSize: number
  signal: AbortSignal
}

export interface DataTableResponse<R extends Row = Row> {
  rows: R[]
  total: number
}

/** Column layout part of `DataTableState` (payload of `layout-change`). */
export interface DataTableLayout {
  columnOrder?: string[]
  columnWidths?: Record<string, number>
  columnVisibility?: Record<string, boolean>
  columnPinning?: { start: string[]; end: string[] }
}

/** Serializable snapshot of the user-adjustable state. */
export interface DataTableState extends DataTableLayout {
  version: 1
  sort?: SortEntry[]
  filters?: FilterEntry[]
  search?: string
  selectedKeys?: RowKey[]
  expandedKeys?: RowKey[]
  page?: number
  pageSize?: number
}

export type RowKey = string | number

/** Node of the (tree/group) hierarchy after filtering and sorting. */
export interface RowNode<R extends Row = Row> {
  kind: "data" | "group"
  key: RowKey
  depth: number
  children: RowNode<R>[]
  /** kind "data" */
  row?: R
  /** kind "group" */
  groupColumnId?: string
  groupValue?: unknown
  groupCount?: number
  groupRows?: R[]
  aggregates?: Record<string, unknown>
}

/** A rendered row (flat, including detail panels). */
export interface DisplayRow<R extends Row = Row> {
  kind: "data" | "group" | "detail"
  /** Unique within the render pass (detail rows have a suffix). */
  key: string
  /** Key of the associated row/group. */
  nodeKey: RowKey
  depth: number
  expandable: boolean
  expanded: boolean
  /** Running index of the data rows (kind "data" only). */
  index: number
  /**
   * The PASS-THROUGH columns left of the row's own connector (length = `depth - 1`).
   * `true` means: a vertical line runs through there, because the ancestor
   * of this column still has a sibling after it.
   *
   * The mapping matters: the line in a column does not connect the ancestor
   * of THIS level with its sibling, but the ancestor of the
   * NEXT level — just like in `tree` output:
   *
   * ```
   * A
   * ├── B
   * │   └── C     ← the "│" is here because D still comes after B
   * └── D
   * ```
   *
   * Roots create no pass-through column: no line is drawn between two
   * roots.
   */
  ancestorLines: boolean[]
  /** Last child of its parent → connector "└" instead of "├". */
  isLastChild: boolean
  row?: R
  node?: RowNode<R>
}

/**
 * The component API exposed via `defineExpose`. Use as the type for
 * template refs — `InstanceType<typeof DataTable>` doesn't work with
 * generic components.
 */
export interface DataTableApi<R extends Row = Row> {
  getVisibleRows: () => R[]
  getProcessedRows: () => R[]
  getSelectedRows: () => R[]
  scrollToIndex: (index: number, align?: "start" | "center" | "end") => void
  expandRow: (key: RowKey) => void
  collapseRow: (key: RowKey) => void
  expandAllRows: () => void
  collapseAllRows: () => void
  toggleColumn: (id: string, visible: boolean) => void
  pinColumn: (id: string, side: PinSide | false) => void
  getColumnPin: (id: string) => PinSide | false
  autoSizeColumn: (id: string) => void
  autoSizeColumns: () => void
  sizeColumnsToFit: () => void
  resetColumns: () => void
  getColumnFacets: (id: string) => ColumnFacets
  reload: () => void
  /** Discard a row's lazily loaded children and fetch them again. */
  reloadChildren: (key: RowKey) => Promise<void>
  /** Lazily loaded children of a row (undefined = not loaded yet). */
  getLoadedChildren: (key: RowKey) => R[] | undefined
  /** Replace a row's lazily loaded children without loading. */
  setLoadedChildren: (key: RowKey, rows: R[]) => void
  getDataAsCsv: (options?: {
    columnIds?: string[]
    includeHeaders?: boolean
    delimiter?: string
    escapeFormulas?: boolean
  }) => string
  exportDataAsCsv: (options?: {
    fileName?: string
    columnIds?: string[]
    includeHeaders?: boolean
    delimiter?: string
    escapeFormulas?: boolean
  }) => void
  copySelectedRows: (options?: { format?: "tsv" | "csv" }) => Promise<number>
  getState: () => DataTableState
  setState: (state: Partial<DataTableState>) => void
  resetState: () => void
  focus: () => void
}
