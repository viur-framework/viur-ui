---
covers:
  [
    src.components.DataTable.DataTable,
    src.components.DataTable.ViurDataTable,
    src.components.DataTable.viurColumns.columnsFromStructure,
    src.components.DataTable.viurColumns.boneText,
    src.components.DataTable.viurColumns.badgesForBone,
    src.components.DataTable.columns.resolveColumns,
    src.components.DataTable.useColumnLayout.useColumnLayout,
    src.components.DataTable.useVirtualRows.useVirtualRows,
    src.components.DataTable.useGridNavigation.useGridNavigation,
  ]
status: accepted
---

## Seam

ViUR list module: `ViurDataTable` with `module`. It owns fetching
(`useListFetch`, cursor), server sort, local mode and field visibility. Hook
in via `columns` (own definitions), `bones` / `language` / `locale` (derived
columns), `params` (spread into every fetch), `tableProps` (passed to the
inner `DataTable`) and the slots, which are forwarded 1:1. Search goes
through the exposed `search(term)`, field visibility through
`columns.all()` / `columns.apply(ids)`.

Anything that is not a ViUR list: `DataTable` directly, with `data`
(client mode), `dataSource` (server mode with callback) or `server` +
`@data-request` (caller replaces `data`).

Columns from a ViUR structure: `columnsFromStructure(structure, options)`;
per-bone changes via `options.overrides[boneName]` (shallow merge over the
generated column), not by post-processing the array.

Cell content: `formatter` for text, `value` for a computed sort/filter value,
`badge` for colored chips, slot `cell:<id>` (`row, value, column, index`) for
markup. Also `header:<id>`, `footer:<id>`, `row-detail`, `toolbar-start/end`,
`cursor-start/end`, `empty`, `no-results`, `loading`.

Layout persistence: `DataTable` stores nothing. Read `getState()`, store it
yourself, restore with `setState()`. To know when: `layout-change` fires once
per finished column change (order, width at resize end, pin, visibility,
auto-size, reset) with the column part of `getState()`; sort, filters and
paging have their own events and v-models. `ViurDataTable` and `Browser` do
not re-emit it, pass `onLayoutChange` via `tableProps`. Only `ViurDataTable` persists, and only
the hidden-field list under `storageKey`.

## Rules

- Value to text goes through `boneText` / `Utils.boneToString`
  (`src/forms/bones/utils.js`). Do not format bone values again in a
  formatter or slot; languages, `multiple` and relational format strings are
  handled there once, for forms and table alike.
- Server mode sorts only on `indexed`, single-valued, monolingual bones.
  `columnsFromStructure` sets `sortable` accordingly; do not force
  `sortable: true` on other bones in server mode, the core cannot order by
  them.
- Local sort/filter/search only when ALL rows are loaded (`local: true`).
  On a partial cursor slice a local result is wrong, not approximate.
- `bonelist` only for modules that support `X-VIUR-BONELIST` server-side;
  otherwise the core answers 400.

## Traps

- With `tableProps: { withSearch: true }` the built-in search box in server
  mode does nothing: `ViurDataTable.onRequest` reads only `sort` and
  `pageSize` from the request, `request.search` and `request.filters` are
  dropped. Use the exposed `search()`.
- Server mode sends only the first sort entry (`orderby`/`orderdir`). Shift
  multi-sort shows several arrows but the server sorts by one.
- `pageSize` above 99 is clamped to 99 (`Math.min(99, ...)`) without notice.
- Passing own `columns` disables field visibility: `effectiveColumns` returns
  them unchanged, so `columns.apply()` stores the hidden list but hides
  nothing. Set `hidden` on own columns yourself.
- Slot content is display only. Search, copy and CSV use
  `formatter` (or `defaultText`). Text that only exists in a `cell:` slot is
  not searchable and not exported.
- Virtualization (`auto` above 60 rows) assumes `rowHeight` (44 px) for every
  data row; only `row-detail` panels are measured. A cell slot that makes
  rows taller breaks the scroll offsets - set `rowHeight` or
  `virtualize: false`.
- Leaving local mode (reload, new cursor, server search) clears client search
  and filters and drops sorts on non-indexed bones (`watch(allLoaded)`).
- Multilingual columns sort by the displayed language (`languageSortValue`),
  not by the first language of the bone. Keep `language` consistent between
  display and any own `comparator`.

## See also

- `docs/adr/forms/bones.md` - `Utils.boneToString` lives next to the bone
  registry.
- `docs/adr/request.md` - `useListFetch`, cursor and cache.
