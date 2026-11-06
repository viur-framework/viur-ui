import type { DefineComponent, Ref } from "vue"
import type { Row, RowKey } from "./types.ts"

/** Props of ViurDataTable.vue (see defineProps there). */
export interface ViurDataTableProps {
  /** Module name or dot path ("user", "shop.order"). */
  module: string
  /** Renderer for the requests; default: VITE_DEFAULT_RENDERER. */
  renderer?: string | null
  /** Subtype of grouped lists (handler `list.grouped`). */
  group?: string | null
  /** Additional request parameters — spread into every fetch. */
  params?: Record<string, unknown>
  /** Columns; if not given, derived from the viewSkel structure. */
  columns?: unknown[] | null
  /** Only these bones as columns (for derived columns). */
  bones?: string[] | null
  /** Columns appended after the derived (or given) ones, e.g. an action column filled via `cell:<id>`. */
  extraColumns?: unknown[] | null
  /** Extends/overrides derived columns per bone. */
  columnOverrides?: Record<string, Record<string, unknown>> | null
  label?: string | null
  selectable?: false | "single" | "multiple"
  /** Entries per load (ViUR `limit`). */
  pageSize?: number
  /** Upper limit for local mode (everything loaded → client pipeline). */
  localModeLimit?: number
  /** Send X-VIUR-BONELIST when fields are deselected (server needs a "*" subskel). */
  bonelist?: boolean
  /** localStorage key for field visibility; null = no persistence. */
  storageKey?: string | null
  language?: string | null
  /** Comes first with language="*" (usually the UI language). */
  primaryLanguage?: string | null
  locale?: string | null
  /** Column width draggable (default true — unlike the bare DataTable). */
  resizable?: boolean
  /** Columns reorderable via drag (default true). */
  reorderable?: boolean
  /** Columns pinnable (default true). */
  pinnable?: boolean
  /** Passed through to the DataTable. */
  tableProps?: Record<string, unknown>
}

export interface ViurDataTableEmitProps<R extends Row = Row> {
  /** Double click or Enter on a data row. */
  onOpen?: (payload: { row: R; key: RowKey }) => void
  /** Click or Enter on a data cell (passed through from the DataTable). */
  onCellClick?: (payload: { column: string; value: unknown; row: R; index: number }) => void
  /** v-model:selectedKeys */
  "onUpdate:selectedKeys"?: (value: RowKey[]) => void
}

/** What ViurDataTable exposes via defineExpose. */
export interface ViurDataTableApi<R extends Row = Row> {
  /** The ListRequest (useListFetch): data, structure, cursor, execute, … */
  list: Record<string, unknown>
  /** Template ref to the DataTable (DataTableApi). */
  table: Ref<unknown>
  /** Load from the start — with the current props.params. */
  refresh: () => Promise<unknown>
  /** Search: server-side (ViUR `search`) or local, if everything is loaded. */
  search: (term: string) => void
  /** Field visibility (e.g. for a "Fields" dialog). */
  columns: {
    all: () => { id: string; label: string; hidden: boolean }[]
    apply: (visibleIds: string[]) => void
  }
  /** Label of an entry (first text value of its columns). */
  entryTitle: (key: RowKey) => string
  /** Everything loaded → sorting/filtering/searching run locally. */
  allLoaded: Ref<boolean>
  rows: Ref<R[]>
}

declare const ViurDataTable: DefineComponent<ViurDataTableProps & ViurDataTableEmitProps>
export default ViurDataTable
