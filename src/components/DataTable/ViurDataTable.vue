<template>
  <div class="vi-vdt">
    <!-- Structure didn't arrive (missing permission, unexpected response): columns
         are then derived from the data — the notice stays visible. -->
    <wa-callout
      v-if="notice"
      class="vi-vdt-notice"
      variant="warning"
    >
      {{ notice }}
    </wa-callout>

    <DataTable
      ref="tableEl"
      v-model:sort="sort"
      v-model:selected-keys="selectedKeys"
      v-model:page-size="limit"
      v-model:search="clientSearch"
      v-model:filters="clientFilters"
      class="vi-vdt-table"
      :server="!allLoaded"
      :max-multi-sort="allLoaded ? 0 : 1"
      :columns="effectiveColumns"
      :data="rows"
      :label="label ?? module"
      row-key="key"
      :selectable="selectable"
      :loading="list.isFetching.value"
      :has-more="Boolean(list.cursor.value)"
      :resizable="resizable"
      :reorderable="reorderable"
      :pinnable="pinnable"
      v-bind="tableProps"
      @data-request="onRequest"
      @load-more="onLoadMore"
      @page-change="onPageSizeChange"
      @row-activate="$emit('open', { row: $event.row, key: $event.key })"
      @cell-click="$emit('cell-click', $event)"
    >
      <template
        v-for="(_, slotName) in $slots"
        #[slotName]="scope"
      >
        <slot
          :name="slotName"
          v-bind="scope"
        ></slot>
      </template>
    </DataTable>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue"
import { useListFetch } from "../../request/index.js"
import { useI18n } from "vue-i18n"
import DataTable from "./DataTable.vue"
import { columnsFromStructure } from "./viurColumns.ts"

// ViurDataTable: thin ViUR wrapper around the DataTable for LIST modules
// (counterpart to ViurBrowser for tree modules): pass `module`, done. Contains the complete
// list mechanics — server sorting/search, cursor-based loading, local mode
// (everything loaded → sorting/filtering/searching client-side), columns from the
// structure, field visibility incl. optional persistence and optional
// X-VIUR-BONELIST (server serializes only the visible fields).

const props = defineProps({
  module: { type: String, required: true },
  renderer: { type: String, default: null },
  /** Subtype of grouped lists (handler `list.grouped`). */
  group: { type: String, default: null },
  /** Additional request parameters — spread into EVERY fetch (e.g. the
   *  server context as @ parameters). Changes take effect from the next
   *  fetch; `refresh()` reloads immediately. */
  params: { type: Object, default: () => ({}) },
  /** Columns; if not given, derived from the viewSkel structure. */
  columns: { type: Array, default: null },
  /** Only these bones as columns (for derived columns). */
  bones: { type: Array, default: null },
  /** Accessible label; default: module name. */
  label: { type: String, default: null },
  selectable: { type: [String, Boolean], default: "multiple" },
  /** Entries per load (ViUR `limit`), at most 99: the server caps it anyway (`conf.db.query_external_limit`). */
  pageSize: { type: Number, default: 50 },
  /**
   * Upper limit for local mode: above it, sorting/filtering/searching stay
   * with the server (the first local search sends every row through the
   * bone formatter — at five digits that freezes the main thread).
   */
  localModeLimit: { type: Number, default: 5_000 },
  /** Send X-VIUR-BONELIST when fields are deselected. ONLY enable if
   *  the module supports it server-side ("*" subskel) — otherwise the
   *  core responds with 400. */
  bonelist: { type: Boolean, default: false },
  /** localStorage key for field visibility (the HIDDEN list is
   *  stored: new server fields appear automatically); null = no
   *  persistence. */
  storageKey: { type: String, default: null },
  /** Language/locale for bone rendering in the columns. */
  language: { type: String, default: null },
  /** Comes first with language="*" (usually the UI language). */
  primaryLanguage: { type: String, default: null },
  locale: { type: String, default: null },
  /** Drag columns wider/narrower via a handle in the header. Unlike the
   *  bare DataTable (opt-in there), ON by default here — the
   *  ViurDataTable is the convenience widget. */
  resizable: { type: Boolean, default: true },
  /** Reorder columns via drag. */
  reorderable: { type: Boolean, default: true },
  /** Pin columns left/right. */
  pinnable: { type: Boolean, default: true },
  /** Passed through to the DataTable (overrides individual props). */
  tableProps: { type: Object, default: () => ({}) },
})

defineEmits(["open", "cell-click"])

const { t } = useI18n()
const tableEl = ref(null)
const selectedKeys = defineModel("selectedKeys", { type: Array, default: () => [] })

const sort = ref([])
const limit = ref(Math.min(99, Number(props.params?.limit ?? props.pageSize) || 50))
/** Server-side search term (ViUR `search`); empty = off. */
const serverSearch = ref("")
/** Client search/filters — apply ONLY in the fully loaded state. */
const clientSearch = ref("")
const clientFilters = ref([])
/** Hidden columns (field names); null until the user chose, then the columns' own `hidden` counts. */
const hiddenFields = ref(loadHiddenFields())

const list = useListFetch(props.module, {
  group: props.group ?? null,
  params: { limit: limit.value },
  immediate: false,
  ...(props.renderer ? { renderer: props.renderer } : {}),
  headers: () => bonelistHeader(),
})

const rows = computed(() => list.data.value)

/** Everything loaded and small enough → local mode (the table's client pipeline). */
const allLoaded = computed(
  () => rows.value.length > 0 && rows.value.length <= props.localModeLimit && list.complete.value && !serverSearch.value
)

const effectiveColumns = computed(() => {
  const derived = columnsFromStructure(list.structure.value, {
    ...(props.bones ? { bones: props.bones } : {}),
    ...(props.language ? { language: props.language } : {}),
    ...(props.primaryLanguage ? { primaryLanguage: props.primaryLanguage } : {}),
    ...(props.locale ? { locale: props.locale } : {}),
    exclude: ["key"],
    local: allLoaded.value,
    boolTexts: [t("bones.bool.true"), t("bones.bool.false")],
  })
  const columns = props.columns ?? (derived.length ? derived : null)
  if (!columns) return fallbackColumns(rows.value[0])
  return columns.map((column) => ({
    ...column,
    hidden: hiddenFields.value
      ? hiddenFields.value.includes(String(column.field ?? column.id))
      : column.hidden === true,
  }))
})

const notice = computed(() =>
  rows.value.length && !columnsFromStructure(list.structure.value).length ? t("dataTable.structureNotice") : ""
)

/** Fallback columns: the fields of the first record, unformatted. */
function fallbackColumns(row) {
  if (!row) return []
  return Object.keys(row)
    .filter((field) => field !== "key")
    .map((field) => ({ field, label: field, sortable: false, minWidth: 120, flex: 1 }))
}

/** Fetch parameters: props.params (context etc.) + search + sorting + limit. */
function requestParams(sortEntries = sort.value) {
  const params = { ...props.params, limit: limit.value }
  if (serverSearch.value) params.search = serverSearch.value
  const [first] = sortEntries
  if (first) {
    params.orderby = first.id
    if (first.desc) params.orderdir = "1"
  }
  return params
}

function onRequest(request) {
  if (request.pageSize) limit.value = Math.min(99, request.pageSize)
  // the table's own search box: in server mode ViUR searches
  serverSearch.value = String(request.search ?? "").trim()
  void list.filter(requestParams(request.sort)).catch(() => null)
}

function onPageSizeChange({ pageSize }) {
  if (!pageSize || pageSize === limit.value) return
  limit.value = Math.min(99, pageSize)
  void list.filter(requestParams()).catch(() => null)
}

async function onLoadMore({ pages }) {
  if (pages === "all") {
    await list.nextAll().catch(() => null)
    return
  }
  await list.next(pages).catch(() => null)
}

// Back in server mode (reload, new cursor, server search): reset local
// refinements and remove sortings the server can't handle
// (only indexed, single-valued bones).
watch(allLoaded, (local) => {
  if (local) return
  clientSearch.value = ""
  clientFilters.value = []
  // ViUR orders by one bone: keep the newest sorting
  sort.value = sort.value
    .filter((entry) => {
      const bone = list.structure.value?.[entry.id]
      return bone?.indexed === true && !bone?.multiple && !bone?.languages?.length
    })
    .slice(-1)
})

// ── Field visibility (+ optional persistence, + optional bonelist) ──────────
function loadHiddenFields() {
  if (!props.storageKey) return null
  try {
    const parsed = JSON.parse(localStorage.getItem(props.storageKey) ?? "null")
    return Array.isArray(parsed) ? parsed.map(String) : null
  } catch {
    return null
  }
}

function bonelistHeader() {
  if (!props.bonelist || !hiddenFields.value?.length) return null
  const fields = Object.keys(list.structure.value ?? {}).filter((name) => !hiddenFields.value.includes(name))
  if (!fields.length) return null
  return { "X-VIUR-BONELIST": ["key", ...fields].join(",") }
}

const columnsApi = {
  /** All showable/hideable columns with their current state. */
  all: () =>
    effectiveColumns.value
      .filter((column) => column.hideable !== false)
      .map((column) => ({
        id: String(column.field ?? column.id),
        label: String(column.label ?? column.field ?? column.id),
        hidden: column.hidden === true,
      })),
  /** Set visible columns (persisted; with bonelist a reload follows). */
  apply: (visibleIds) => {
    const visible = new Set(visibleIds)
    hiddenFields.value = effectiveColumns.value
      .map((column) => String(column.field ?? column.id))
      .filter((id) => !visible.has(id))
    if (props.storageKey) {
      try {
        localStorage.setItem(props.storageKey, JSON.stringify(hiddenFields.value))
      } catch {
        // localStorage may be missing (private mode) — then just not persistent.
      }
    }
    if (props.bonelist) void list.filter(requestParams()).catch(() => null)
  },
}

/** Server-side search — or local, if everything is loaded. */
function search(term) {
  const trimmed = String(term ?? "").trim()
  if (allLoaded.value) {
    clientSearch.value = trimmed
  } else {
    serverSearch.value = trimmed
    // shown in the table's search box, and sent along with every later sort/page request
    clientSearch.value = trimmed
    void list.filter(requestParams()).catch(() => null)
  }
}

/** Load from the start — with the CURRENT props.params (context etc.). */
function refresh() {
  return list.filter(requestParams())
}

/** Label of an entry: first text value of its columns, otherwise the key. */
function entryTitle(key) {
  const row = rows.value.find((entry) => String(entry.key) === String(key))
  if (!row) return String(key)
  for (const column of effectiveColumns.value) {
    const field = column.field
    if (!field) continue
    const text = column.formatter
      ? column.formatter(row[field], row)
      : row[field] === null || row[field] === undefined
        ? ""
        : String(row[field])
    if (text) return text
  }
  return String(key)
}

defineExpose({
  list,
  table: tableEl,
  refresh,
  search,
  columns: columnsApi,
  entryTitle,
  allLoaded,
  rows,
})
</script>

<style scoped>
.vi-vdt {
  display: flex;
  flex-direction: column;
  gap: var(--wa-space-s);
  flex: 1;
  min-block-size: 0;
}

.vi-vdt-table {
  flex: 1;
  min-block-size: 0;
}
</style>
