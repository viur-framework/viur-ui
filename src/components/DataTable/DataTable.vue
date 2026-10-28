<template>
  <!-- Vue reimplementation of <wa-data-grid> (WebAwesome Pro). Columns are data,
       cell contents come from slots (`cell:<id>`), mutable state
       flows through v-model. Everything else lives in the composables. -->
  <div
    class="vi-dt"
    :class="[
      `is-size-${size}`,
      `is-${appearance}`,
      {
        'is-striped': striped,
        'is-loading': state.isLoading,
        'is-selectable': selectable !== false && selectOnRowClick,
      },
    ]"
    :style="state.hostStyle"
  >
    <!-- ── Toolbar: search + columns menu ───────────────────────────── -->
    <div
      v-if="state.showToolbar || $slots['toolbar-start'] || $slots['toolbar-end']"
      class="vi-dt-toolbar wa-split wa-gap-s wa-flex-nowrap"
    >
      <div class="wa-cluster wa-gap-xs wa-flex-nowrap">
        <slot name="toolbar-start" />
        <wa-input
          v-if="withSearch"
          class="vi-dt-search"
          size="small"
          appearance="outlined"
          :placeholder="t('dataTable.search')"
          :value="search"
          @input="onSearchInput(($event.target as HTMLInputElement).value)"
        >
          <wa-icon
            slot="start"
            name="magnifying-glass"
          ></wa-icon>
        </wa-input>
      </div>
      <div class="wa-cluster wa-gap-xs wa-flex-nowrap">
        <slot name="toolbar-end" />
        <template v-if="withColumnsMenu">
          <wa-button
            :id="`${uid}-columns`"
            class="vi-dt-columns-button"
            size="small"
            appearance="outlined"
          >
            <wa-icon
              slot="start"
              name="table-columns"
            ></wa-icon>
            {{ t("dataTable.columns") }}
          </wa-button>
          <wa-popover
            :for="`${uid}-columns`"
            placement="bottom-end"
            class="vi-dt-columns-menu"
          >
            <div class="wa-stack wa-gap-2xs">
              <label
                v-for="column in state.columns"
                :key="column.id"
                class="vi-dt-colopt wa-flank wa-flex-nowrap wa-gap-xs"
              >
                <input
                  type="checkbox"
                  :checked="layout.isVisible(column)"
                  :disabled="!column.hideable"
                  :data-column="column.id"
                  @change="layout.toggleColumn(column.id)"
                />
                <span class="wa-ellipsis">{{ column.label }}</span>
              </label>
              <wa-button
                class="vi-dt-reset-columns"
                size="small"
                appearance="plain"
                @click="resetColumns"
              >
                {{ t("dataTable.resetColumns") }}
              </wa-button>
            </div>
          </wa-popover>
        </template>
      </div>
    </div>

    <!-- ── Scroll area: header, body, column footers ────────────────── -->
    <div
      ref="scrollerEl"
      class="vi-dt-scroller"
      :role="state.gridRole"
      :aria-label="label ?? undefined"
      :aria-rowcount="state.filteredCount"
      :aria-colcount="state.cellColumns.length"
      @scroll.passive="virtual.onScroll"
      @keydown="nav.handleKeydown"
    >
      <div
        class="vi-dt-head"
        role="rowgroup"
      >
        <div
          class="vi-dt-row vi-dt-headrow"
          role="row"
          :style="state.gridStyle"
        >
          <div
            v-for="cell in state.cellColumns"
            :key="cell.key"
            class="vi-dt-cell vi-dt-hcell"
            :class="[
              cell.kind === 'data' ? `is-align-${cell.col!.column.headerAlign}` : 'is-lead',
              {
                'is-sticky': cell.sticky,
                'is-pin-edge': cell.pinEdge,
                'is-pin-start': cell.side === 'start',
                'is-pin-end': cell.side === 'end',
                'is-sortable': cell.kind === 'data' && cell.col!.column.sortable,
                'is-sorted': cell.kind === 'data' && state.sortIndex[cell.col!.column.id] !== undefined,
                'is-dragging': layout.state.dragging?.id === cell.id,
                'is-drop-target': layout.state.dragging?.overId === cell.id && layout.state.dragging?.id !== cell.id,
              },
            ]"
            :style="cellStyle(cell)"
            role="columnheader"
            :data-row="-1"
            :data-col="cell.index"
            :data-column="cell.id"
            :tabindex="nav.isActive(-1, cell.index) ? 0 : -1"
            :aria-sort="ariaSort(cell)"
            :draggable="cell.kind === 'data' && cell.col!.movable ? 'true' : undefined"
            @click="onHeaderClick(cell, $event)"
            @focus="nav.setActive(-1, cell.index, false)"
            @dragstart="onDragStart(cell, $event)"
            @dragover="onDragOver(cell, $event)"
            @dragend="layout.endDrag()"
            @drop.prevent="layout.endDrag()"
          >
            <!-- Selection header cell: everything on this page -->
            <input
              v-if="cell.kind === 'select' && selectable === 'multiple'"
              class="vi-dt-checkbox vi-dt-select-all"
              type="checkbox"
              :aria-label="t('dataTable.selectAllPage')"
              :checked="state.selectAllState === 'checked'"
              :indeterminate.prop="state.selectAllState === 'indeterminate'"
              @click.stop="toggleSelectAll()"
            />

            <template v-if="cell.kind === 'data'">
              <span class="vi-dt-hlabel wa-ellipsis">
                <slot
                  :name="`header:${cell.col!.column.id}`"
                  :column="cell.col!.column"
                >
                  {{ cell.col!.column.label }}
                </slot>
              </span>
              <wa-icon
                v-if="state.sortIndex[cell.col!.column.id] !== undefined"
                class="vi-dt-sort"
                :name="state.sortDirs[cell.col!.column.id] ? 'chevron-down' : 'chevron-up'"
              ></wa-icon>
              <span
                v-if="state.sort.length > 1 && state.sortIndex[cell.col!.column.id] !== undefined"
                class="vi-dt-sortnum"
              >
                {{ state.sortIndex[cell.col!.column.id]! + 1 }}
              </span>
              <wa-button
                v-if="cell.col!.column.filterable"
                :id="filterButtonId(cell.col!.column.id)"
                class="vi-dt-filter-button"
                :class="{ 'is-active': !isEmptyFilter(filterValue(cell.col!.column.id)) }"
                appearance="plain"
                size="small"
                :data-column="cell.col!.column.id"
                :title="t('dataTable.filterFor', { column: cell.col!.column.label })"
              >
                <wa-icon name="filter"></wa-icon>
              </wa-button>
              <wa-dropdown
                v-if="withColumnMenu"
                class="vi-dt-column-menu"
                placement="bottom-end"
              >
                <wa-button
                  slot="trigger"
                  class="vi-dt-column-menu-button"
                  appearance="plain"
                  size="small"
                  :data-column="cell.col!.column.id"
                  :title="t('dataTable.columnOptions')"
                >
                  <wa-icon name="ellipsis-vertical"></wa-icon>
                </wa-button>
                <wa-dropdown-item
                  v-if="cell.col!.column.sortable"
                  @click="applySort(cell.col!.column.id, false)"
                >
                  {{ t("dataTable.sortAsc") }}
                </wa-dropdown-item>
                <wa-dropdown-item
                  v-if="cell.col!.column.sortable"
                  @click="applySort(cell.col!.column.id, true)"
                >
                  {{ t("dataTable.sortDesc") }}
                </wa-dropdown-item>
                <wa-dropdown-item
                  v-if="cell.col!.pinnable"
                  @click="pinColumn(cell.col!.column.id, 'start')"
                >
                  {{ t("dataTable.pinLeft") }}
                </wa-dropdown-item>
                <wa-dropdown-item
                  v-if="cell.col!.pinnable"
                  @click="pinColumn(cell.col!.column.id, 'end')"
                >
                  {{ t("dataTable.pinRight") }}
                </wa-dropdown-item>
                <wa-dropdown-item
                  v-if="cell.col!.pinnable && cell.col!.pinned"
                  @click="pinColumn(cell.col!.column.id, false)"
                >
                  {{ t("dataTable.unpin") }}
                </wa-dropdown-item>
                <wa-dropdown-item
                  v-if="cell.col!.resizable"
                  @click="autoSizeColumn(cell.col!.column.id)"
                >
                  {{ t("dataTable.autoSize") }}
                </wa-dropdown-item>
                <wa-dropdown-item
                  v-if="cell.col!.column.hideable"
                  @click="layout.toggleColumn(cell.col!.column.id, false)"
                >
                  {{ t("dataTable.hideColumn") }}
                </wa-dropdown-item>
              </wa-dropdown>
              <wa-icon
                v-if="cell.col!.pinned"
                class="vi-dt-pin"
                name="thumbtack"
                :title="cell.col!.pinned === 'start' ? t('dataTable.pinnedLeft') : t('dataTable.pinnedRight')"
                @click.stop="pinColumn(cell.col!.column.id, false)"
              ></wa-icon>
              <span
                v-if="cell.col!.resizable"
                class="vi-dt-resize"
                :data-column="cell.col!.column.id"
                @pointerdown.stop.prevent="onResizeStart(cell.col!.column.id, $event)"
                @dblclick.stop="autoSizeColumn(cell.col!.column.id)"
              ></span>
            </template>
          </div>
        </div>
      </div>

      <div
        ref="bodyEl"
        class="vi-dt-body"
        role="rowgroup"
        :style="{
          paddingBlockStart: `${virtual.state.padStart}px`,
          paddingBlockEnd: `${virtual.state.padEnd}px`,
        }"
      >
        <template
          v-for="displayRow in virtual.state.windowRows"
          :key="displayRow.key"
        >
          <!-- Detail panel: its own full-width row -->
          <div
            v-if="displayRow.kind === 'detail'"
            class="vi-dt-detailrow"
            role="row"
            :data-detail="displayRow.key"
          >
            <div
              class="vi-dt-detail"
              role="gridcell"
            >
              <slot
                name="row-detail"
                :row="displayRow.row!"
              />
            </div>
          </div>

          <div
            v-else
            class="vi-dt-row"
            :class="[
              displayRow.kind === 'group' ? 'is-group' : 'is-data',
              {
                'is-selected': displayRow.kind === 'data' && state.selectedSet.has(displayRow.nodeKey),
                'is-odd': displayRow.index % 2 === 1,
                'is-dragging': state.rowDrag?.key === displayRow.nodeKey,
                'is-drop-before': state.rowDrag?.overKey === displayRow.nodeKey && state.rowDrag?.mode === 'before',
                'is-drop-after': state.rowDrag?.overKey === displayRow.nodeKey && state.rowDrag?.mode === 'after',
                'is-drop-inside':
                  (state.rowDrag?.overKey === displayRow.nodeKey && state.rowDrag?.mode === 'inside') ||
                  (dragSession?.state.over?.container === dragSource &&
                    dragSession?.state.over?.key === displayRow.nodeKey),
              },
              rowClass?.(displayRow.row!) || '',
            ]"
            role="row"
            :style="state.gridStyle"
            :data-key="displayRow.key"
            :aria-selected="
              selectable !== false && displayRow.kind === 'data' ? state.selectedSet.has(displayRow.nodeKey) : undefined
            "
            :aria-level="state.isTree ? displayRow.depth + 1 : undefined"
            :aria-expanded="displayRow.expandable ? displayRow.expanded : undefined"
            @dblclick="onRowDoubleClick(displayRow, $event)"
          >
            <div
              v-for="cell in state.cellColumns"
              :key="cell.key"
              class="vi-dt-cell"
              :class="[
                cell.kind === 'data' ? `is-align-${cell.col!.column.align}` : 'is-lead',
                cell.kind === 'data' ? cellClass(cell, displayRow) : '',
                {
                  'is-tree-cell': state.isTree && cell.index === state.firstDataCellIndex,
                  'is-child': displayRow.depth > 0,
                  'is-sticky': cell.sticky,
                  'is-pin-edge': cell.pinEdge,
                  'is-pin-start': cell.side === 'start',
                  'is-pin-end': cell.side === 'end',
                },
              ]"
              :style="[cellStyle(cell), indentStyle(cell, displayRow)]"
              role="gridcell"
              :data-row="state.rowIndexOf[displayRow.key]"
              :data-col="cell.index"
              :data-column="cell.id"
              :tabindex="nav.isActive(state.rowIndexOf[displayRow.key]!, cell.index) ? 0 : -1"
              @focus="nav.setActive(state.rowIndexOf[displayRow.key]!, cell.index, false)"
              @mousedown="onCellMouseDown($event)"
              @click="onCellClick(displayRow, cell, $event)"
              @contextmenu="onCellContextMenu(displayRow, cell, $event)"
            >
              <!-- Drag handle for the fixed order -->
              <span
                v-if="cell.kind === 'order' && displayRow.kind === 'data'"
                class="vi-dt-grip"
                :class="{ 'is-disabled': !state.orderActive }"
                :title="state.orderActive ? t('dataTable.dragToReorder') : t('dataTable.reorderDisabled')"
                :aria-hidden="!state.orderActive"
                @pointerdown.prevent="beginRowDrag(displayRow, $event)"
              >
                <wa-icon name="grip-vertical"></wa-icon>
              </span>

              <!-- Selection -->
              <input
                v-if="cell.kind === 'select' && selectable !== false"
                class="vi-dt-checkbox"
                :type="selectable === 'single' ? 'radio' : 'checkbox'"
                :aria-label="t('dataTable.selectRow', { row: displayRow.index + 1 })"
                :checked="state.rowSelection[displayRow.key] === 'checked'"
                :indeterminate.prop="state.rowSelection[displayRow.key] === 'indeterminate'"
                :disabled="displayRow.kind === 'data' && !canSelect(displayRow.row!)"
                @click.stop="onSelectRow(displayRow, $event as MouseEvent)"
              />

              <!-- Expand column (tree, groups, detail panels) -->
              <template v-if="cell.kind === 'expand'">
                <wa-button
                  v-if="displayRow.expandable"
                  class="vi-dt-expand"
                  appearance="plain"
                  size="small"
                  :aria-expanded="displayRow.expanded"
                  :aria-label="displayRow.expanded ? t('dataTable.collapseRow') : t('dataTable.expandRow')"
                  @click.stop="toggleExpand(displayRow)"
                >
                  <wa-icon :name="displayRow.expanded ? 'chevron-down' : 'chevron-right'"></wa-icon>
                </wa-button>
              </template>

              <!-- Group row: value + count in the first data column, aggregates elsewhere -->
              <template v-else-if="displayRow.kind === 'group' && cell.kind === 'data'">
                <template v-if="cell.index === state.firstDataCellIndex">
                  <slot
                    name="group"
                    :group="displayRow.node"
                  >
                    <span class="vi-dt-group-value wa-ellipsis">{{ groupLabel(displayRow) }}</span>
                    <span class="vi-dt-group-count">{{ displayRow.node!.groupCount }}</span>
                  </slot>
                </template>
                <span
                  v-else
                  class="vi-dt-aggregate wa-ellipsis"
                >
                  {{ aggregateText(cell, displayRow) }}
                </span>
              </template>

              <!-- Data cell -->
              <template v-else-if="cell.kind === 'data'">
                <!-- Tree data: guide lines, then arrow (or placeholder). One
                     slot per level — a line is only drawn where another
                     sibling still follows below the ancestor. -->
                <template v-if="state.isTree && cell.index === state.firstDataCellIndex">
                  <!-- Pass-through columns … -->
                  <span
                    v-for="(line, level) in displayRow.ancestorLines"
                    :key="level"
                    class="vi-dt-guide"
                    :class="{ 'is-line': line }"
                    aria-hidden="true"
                  ></span>
                  <!-- … and the row's own corner. -->
                  <span
                    v-if="displayRow.depth > 0"
                    class="vi-dt-guide"
                    :class="displayRow.isLastChild ? 'is-corner' : 'is-tee'"
                    aria-hidden="true"
                  ></span>
                  <wa-button
                    v-if="displayRow.expandable"
                    class="vi-dt-expand"
                    :class="{ 'is-empty': isEmptyBranch(displayRow) }"
                    appearance="plain"
                    size="small"
                    :disabled="isEmptyBranch(displayRow) || undefined"
                    :aria-expanded="displayRow.expanded"
                    :aria-busy="isLoadingChildren(displayRow.row)"
                    :aria-label="
                      isEmptyBranch(displayRow)
                        ? t('dataTable.noChildren')
                        : displayRow.expanded
                          ? t('dataTable.collapseRow')
                          : t('dataTable.expandRow')
                    "
                    @click.stop="toggleExpand(displayRow)"
                  >
                    <wa-spinner
                      v-if="isLoadingChildren(displayRow.row)"
                      class="vi-dt-expand-spinner"
                    ></wa-spinner>
                    <wa-icon
                      v-else
                      :name="displayRow.expanded ? 'chevron-down' : 'chevron-right'"
                    ></wa-icon>
                  </wa-button>
                  <!-- Leaf: same spacing as between arrow and lines. -->
                  <span
                    v-else
                    class="vi-dt-leaf-gap"
                    aria-hidden="true"
                  ></span>
                </template>
                <slot
                  :name="`cell:${cell.col!.column.id}`"
                  :row="displayRow.row!"
                  :value="cell.col!.column.get(displayRow.row!)"
                  :column="cell.col!.column"
                  :index="displayRow.index"
                >
                  <span
                    v-if="cell.col!.column.def.badge && badgesFor(cell.col!.column, displayRow.row!)"
                    class="vi-dt-badges"
                  >
                    <span
                      v-for="(badge, badgeIndex) in badgesFor(cell.col!.column, displayRow.row!)"
                      :key="badgeIndex"
                      class="vi-dt-badge"
                      :style="{ '--dt-badge-color': badge.color }"
                    >
                      {{ badge.label }}
                    </span>
                  </span>
                  <span
                    v-else
                    class="wa-ellipsis"
                    :title="cell.col!.column.text(displayRow.row!)"
                  >
                    {{ cell.col!.column.text(displayRow.row!) }}
                  </span>
                </slot>
              </template>
            </div>
          </div>
        </template>
      </div>

      <!-- Column footers, at the bottom edge of the scroll area -->
      <div
        v-if="state.hasColumnFooters"
        class="vi-dt-foot"
        role="rowgroup"
      >
        <div
          class="vi-dt-row vi-dt-footrow"
          role="row"
          :style="state.gridStyle"
        >
          <div
            v-for="cell in state.cellColumns"
            :key="cell.key"
            class="vi-dt-cell vi-dt-footcell"
            :class="[
              cell.kind === 'data' ? `is-align-${cell.col!.column.align}` : 'is-lead',
              {
                'is-sticky': cell.sticky,
                'is-pin-edge': cell.pinEdge,
                'is-pin-start': cell.side === 'start',
                'is-pin-end': cell.side === 'end',
              },
            ]"
            :style="cellStyle(cell)"
            role="gridcell"
            :data-column="cell.id"
          >
            <template v-if="cell.kind === 'data'">
              <slot
                :name="`footer:${cell.col!.column.id}`"
                :rows="state.footerRows"
              >
                <span class="wa-ellipsis">{{ state.footerText[cell.col!.column.id] ?? "" }}</span>
              </slot>
            </template>
          </div>
        </div>
      </div>

      <!-- Empty / no results -->
      <div
        v-if="state.showEmpty"
        class="vi-dt-state"
      >
        <slot name="empty">
          <div class="wa-stack wa-gap-2xs wa-align-items-center">
            <wa-icon name="table-cells"></wa-icon>
            <span>{{ t("dataTable.noData") }}</span>
          </div>
        </slot>
      </div>
      <div
        v-else-if="state.showNoResults"
        class="vi-dt-state"
      >
        <slot name="no-results">
          <div class="wa-stack wa-gap-2xs wa-align-items-center">
            <wa-icon name="magnifying-glass"></wa-icon>
            <span>{{ t("dataTable.noResults") }}</span>
          </div>
        </slot>
      </div>

      <!-- Loading overlay (server mode) -->
      <div
        v-if="state.isLoading"
        class="vi-dt-loading"
      >
        <slot name="loading"><wa-spinner class="vi-dt-spinner"></wa-spinner></slot>
      </div>
    </div>

    <!-- ── Load more (cursor sources) ───────────────────────────────── -->
    <div
      v-if="state.cursorMode"
      class="vi-dt-more wa-split wa-gap-s wa-flex-nowrap"
    >
      <span class="vi-dt-moreinfo">{{ state.loadedText }}</span>
      <div class="wa-cluster wa-gap-2xs wa-flex-nowrap">
        <!-- Slot for caller content in the bar (e.g. reload action). -->
        <slot name="cursor-start" />
        <select
          class="vi-dt-pagesize"
          :aria-label="t('dataTable.perPageAria')"
          :value="pageSize"
          @change="onCursorPageSize(Number(($event.target as HTMLSelectElement).value))"
        >
          <option
            v-for="option in state.cursorPageSizes"
            :key="option"
            :value="option"
          >
            {{ t("dataTable.perPage", { count: option }) }}
          </option>
        </select>
        <template v-if="hasMore">
          <wa-button
            class="vi-dt-more-btn"
            size="small"
            appearance="outlined"
            :loading="state.isLoading || undefined"
            @click="emit('load-more', { pages: 1, pageSize })"
          >
            {{ loadMoreLabel ?? t("dataTable.loadMore") }}
          </wa-button>
          <wa-button
            v-for="pages in loadMorePages"
            :key="pages"
            size="small"
            appearance="outlined"
            :disabled="state.isLoading || undefined"
            :title="t('dataTable.loadPages', { pages })"
            @click="emit('load-more', { pages, pageSize })"
          >
            +{{ pages }}
          </wa-button>
          <wa-button
            size="small"
            appearance="outlined"
            :disabled="state.isLoading || undefined"
            @click="emit('load-more', { pages: 'all', pageSize })"
          >
            {{ loadAllLabel ?? t("dataTable.loadAll") }}
          </wa-button>
        </template>
        <slot name="cursor-end" />
      </div>
    </div>

    <!-- ── Pager ────────────────────────────────────────────────────── -->
    <div
      v-if="paginate"
      class="vi-dt-pager wa-split wa-gap-s wa-flex-nowrap"
    >
      <span class="vi-dt-pageinfo">
        {{
          t("dataTable.pageInfo", {
            rows: state.filteredCount,
            page: page + 1,
            pages: state.pageCount,
          })
        }}
      </span>
      <div class="wa-cluster wa-gap-2xs wa-flex-nowrap">
        <select
          class="vi-dt-pagesize"
          :aria-label="t('dataTable.rowsPerPageAria')"
          :value="pageSize"
          @change="setPageSize(Number(($event.target as HTMLSelectElement).value))"
        >
          <option
            v-for="option in pageSizeOptions"
            :key="option"
            :value="option"
          >
            {{ t("dataTable.perPage", { count: option }) }}
          </option>
        </select>
        <wa-button
          class="vi-dt-first"
          size="small"
          appearance="outlined"
          :disabled="page === 0 || undefined"
          :title="t('dataTable.firstPage')"
          @click="setPage(0)"
        >
          <wa-icon name="angles-left"></wa-icon>
        </wa-button>
        <wa-button
          class="vi-dt-prev"
          size="small"
          appearance="outlined"
          :disabled="page === 0 || undefined"
          :title="t('dataTable.prevPage')"
          @click="setPage(page - 1)"
        >
          <wa-icon name="chevron-left"></wa-icon>
        </wa-button>
        <wa-button
          class="vi-dt-next"
          size="small"
          appearance="outlined"
          :disabled="page >= state.pageCount - 1 || undefined"
          :title="t('dataTable.nextPage')"
          @click="setPage(page + 1)"
        >
          <wa-icon name="chevron-right"></wa-icon>
        </wa-button>
        <wa-button
          class="vi-dt-last"
          size="small"
          appearance="outlined"
          :disabled="page >= state.pageCount - 1 || undefined"
          :title="t('dataTable.lastPage')"
          @click="setPage(state.pageCount - 1)"
        >
          <wa-icon name="angles-right"></wa-icon>
        </wa-button>
      </div>
    </div>

    <!-- Filter popover per visible filterable column (after their anchors!) -->
    <wa-popover
      v-for="column in state.filterColumns"
      :key="column.id"
      class="vi-dt-filter-panel"
      :for="filterButtonId(column.id)"
      placement="bottom-start"
    >
      <ColumnFilterPanel
        :column="column"
        :facets="state.facets[column.id]"
        :model-value="filterValue(column.id)"
        @update:model-value="setFilter(column.id, $event)"
      />
    </wa-popover>

    <span
      class="vi-dt-live"
      aria-live="polite"
    >
      {{ state.announcement }}
    </span>
  </div>
</template>

<script setup lang="ts" generic="R extends Row">
import { useI18n } from "vue-i18n"
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch, shallowRef } from "vue"
import ColumnFilterPanel from "./ColumnFilterPanel.vue"
import { useColumnLayout, type LayoutColumn } from "./useColumnLayout.ts"
import { useGridNavigation } from "./useGridNavigation.ts"
import { useVirtualRows } from "./useVirtualRows.ts"
import { DRAG_SESSION } from "../Browser/dragSession.ts"
import { aggregateColumn, defaultText, findColumn, isEmptyFilter, nextSortState, resolveColumns } from "./columns.ts"
import {
  buildRows,
  collectKeys,
  flattenNodes,
  isDescendant,
  locateNode,
  nestByParent,
  orderValueFor,
  paginateNodes,
  selectionStateFor,
  type BuiltRows,
  type ChildRowsAccessor,
  type NestedTree,
  type SelectionState,
  type NodeLocation,
} from "./rows.ts"
import type {
  ColumnFacets,
  DataTableColumn,
  DataTableRequest,
  DataTableResponse,
  DataTableState,
  DisplayRow,
  FilterEntry,
  PinSide,
  ResolvedColumn,
  Row,
  RowKey,
  RowNode,
  SortEntry,
  CellBadge,
} from "./types.ts"

const props = withDefaults(
  defineProps<{
    columns: DataTableColumn<R>[]
    data?: R[]
    /** Field with a stable row id — for selection across sorting/pages. */
    rowKey?: string | null
    label?: string | null
    selectable?: false | "single" | "multiple"
    selectableRows?: ((row: R) => boolean) | null
    /** With selection enabled, a left click on the row selects the entry (Shift: range). */
    selectOnRowClick?: boolean
    /**
     * Reset the lazy-loaded tree (`loadChildren`) on every external data
     * change (arrows collapsed, children cache empty). Default false: a drop
     * stays a purely local move and nothing collapses unasked —
     * resetting only happens via `reload()` / `resetTree()`.
     */
    resetTreeOnDataChange?: boolean
    /** Container id of this table in an enclosing drag session (Browser). */
    dragSource?: string
    striped?: boolean
    size?: "xs" | "s" | "m" | "l" | "xl"
    appearance?: "outlined" | "plain"
    withSearch?: boolean
    withColumnsMenu?: boolean
    withColumnMenu?: boolean
    resizable?: boolean
    reorderable?: boolean
    pinnable?: boolean
    paginate?: boolean
    pageSizeOptions?: number[]
    groupBy?: string | string[] | null
    childRows?: string | ((row: R) => R[] | undefined | null) | null
    /**
     * Field referencing the parent row (ViUR: `parententry`). With it the
     * component builds the tree itself from a FLAT list — `rowKey`
     * is required for this. Already nested data still goes through
     * `childRows`, which then takes precedence.
     */
    parentField?: string | null
    /**
     * Load the children of a level on demand (ViUR: `list` with `parententry`).
     * When set, EVERY data row gets an expand arrow, because it is unknown
     * beforehand whether there are children. After loading the arrow stays
     * and is disabled if nothing came back — so the layout doesn't jump.
     */
    loadChildren?: ((row: R) => Promise<R[]>) | null
    /**
     * If the application knows in advance whether a row CAN have children (in ViUR e.g.
     * `node` vs. `leaf`), report it here: `false` → no arrow at all,
     * `true`/`undefined` → arrow, loading happens on expand.
     */
    rowHasChildren?: ((row: R) => boolean | undefined) | null
    filterFromLeafRows?: boolean
    /** Rows get a detail panel (content: slot `row-detail`). */
    rowDetail?: boolean
    rowClass?: ((row: R) => string | null | undefined) | null
    /**
     * Field holding the numeric order (ViUR: "sortindex"). When set,
     * the table is fixed-sorted by it and rows can be reordered by
     * dragging — the component reports the new value via
     * `row-reorder`, saving happens outside.
     */
    orderField?: string | null
    /** Step for new values at the start/end of the list. */
    orderStep?: number
    sortDescFirst?: boolean
    withoutSortRemoval?: boolean
    maxMultiSort?: number
    searchFn?: ((value: unknown, term: string, row: R) => boolean) | null
    /** Server mode without callback: the component emits `data-request`. */
    /**
     * Cursor sources (e.g. ViUR lists) load forward instead of jumping between
     * pages. If `hasMore` is set (even `false`), a bar with "Load more" appears
     * instead of the pager; the caller does the loading on `load-more`.
     */
    hasMore?: boolean | null
    loadMoreLabel?: string | null
    loadAllLabel?: string | null
    /** Quick pick "load the next N pages" in the cursor bar. */
    loadMorePages?: number[]
    /** Page sizes of the cursor bar (ViUR: limit, max 99). */
    cursorPageSizes?: number[]
    server?: boolean
    dataSource?: ((request: DataTableRequest) => Promise<DataTableResponse<R>>) | null
    total?: number
    loading?: boolean
    filterDebounce?: number
    /** Force true/false, "auto" from `virtualizeThreshold` rows on. */
    virtualize?: boolean | "auto"
    virtualizeThreshold?: number
    rowHeight?: number
    /**
     * Cap for the scroll area. WITHOUT a value the CSS default
     * `--dt-max-height: 30rem` applies — so the variable stays overridable
     * from outside (e.g. `--dt-max-height: none`, so the table fills an
     * area). A set value is applied inline and wins.
     */
    maxHeight?: string
  }>(),
  {
    data: () => [],
    rowKey: null,
    label: null,
    selectable: false,
    selectableRows: null,
    selectOnRowClick: true,
    resetTreeOnDataChange: false,
    dragSource: "list",
    striped: false,
    size: "m",
    appearance: "outlined",
    withSearch: false,
    withColumnsMenu: false,
    withColumnMenu: false,
    resizable: false,
    reorderable: false,
    pinnable: false,
    paginate: false,
    pageSizeOptions: () => [10, 20, 50, 100],
    groupBy: null,
    childRows: null,
    parentField: null,
    loadChildren: null,
    rowHasChildren: null,
    filterFromLeafRows: false,
    rowDetail: false,
    rowClass: null,
    orderField: null,
    orderStep: 1,
    sortDescFirst: false,
    withoutSortRemoval: false,
    maxMultiSort: 0,
    searchFn: null,
    hasMore: null,
    loadMoreLabel: null,
    loadAllLabel: null,
    loadMorePages: () => [5, 10],
    cursorPageSizes: () => [10, 30, 50, 99],
    server: false,
    dataSource: null,
    total: undefined,
    loading: undefined,
    filterDebounce: 250,
    virtualize: "auto",
    virtualizeThreshold: 60,
    rowHeight: 44,
    // No default: see maxHeight above — the cap comes from the CSS.
    maxHeight: undefined,
  }
)

// State that can be tracked from outside — one v-model each.
const sort = defineModel<SortEntry[]>("sort", { default: () => [] })
const filters = defineModel<FilterEntry[]>("filters", { default: () => [] })
const search = defineModel<string>("search", { default: "" })
const selectedKeys = defineModel<RowKey[]>("selectedKeys", { default: () => [] })
const expandedKeys = defineModel<RowKey[]>("expandedKeys", { default: () => [] })
const page = defineModel<number>("page", { default: 0 })
const pageSize = defineModel<number>("pageSize", { default: 20 })

const emit = defineEmits<{
  "cell-click": [payload: { column: string; value: unknown; row: R; index: number }]
  /** Double click on a data row — typically to open the record. */
  "row-dblclick": [payload: { key: RowKey; row: R; index: number; originalEvent: MouseEvent }]
  /** Double click or Enter on a data row — "open the record" for mouse and keyboard alike. */
  "row-activate": [payload: { key: RowKey; row: R; index: number }]
  "cell-contextmenu": [payload: { column: string; value: unknown; row: R; index: number; originalEvent: MouseEvent }]
  "sort-change": [sort: SortEntry[]]
  "filter-change": [payload: { search: string; filters: FilterEntry[] }]
  "row-select": [payload: { selectedKeys: RowKey[]; rows: R[] }]
  "row-expand": [payload: { key: RowKey; row?: R }]
  "row-collapse": [payload: { key: RowKey; row?: R }]
  "column-move": [payload: { columnOrder: string[]; finished: boolean }]
  "column-resize": [payload: { column: string; width: number; finished: boolean }]
  "column-pin": [payload: { column: string; side: PinSide | false }]
  "column-visibility-change": [payload: { column: string; visible: boolean }]
  "page-change": [payload: { page: number; pageSize: number }]
  "row-reorder": [
    payload: {
      row: R
      key: RowKey
      /** New value for the `orderField` field. */
      order: number
      /** New parent row (tree); null = top level. */
      parent: RowKey | null
      /** true if the parent changed (then `move` instead of `edit`). */
      parentChanged: boolean
      /** Position among the new siblings. */
      toIndex: number
      /** Neighbours share the same value — the list should be renumbered. */
      needsReindex: boolean
    },
  ]
  "load-more": [payload: { pages: number | "all"; pageSize: number }]
  "data-request": [request: DataTableRequest]
  "data-error": [payload: { error: unknown; request: DataTableRequest }]
  "children-error": [payload: { error: unknown; key: RowKey; row: R }]
}>()

const uid = useId()

// DOM refs (allowed exception).
const scrollerEl = ref<HTMLElement>()
const bodyEl = ref<HTMLElement>()

// Non-reactive internals.
let headerObserver: ResizeObserver | undefined
let detailObserver: ResizeObserver | undefined
let debounceTimer = 0
let abortController: AbortController | undefined
let lastSelectedIndex: number | null = null

// Enclosing drag session (Browser): allows dropping rows OUTSIDE the table
// (navigation tree, folder rows). Without Browser: null.
const dragSession = inject(DRAG_SESSION, null)

const { t } = useI18n()

/**
 * Optimistic moves (drag & drop / Alt+arrow): rowKey → new
 * order value and, if applicable, new parent. This makes the row vanish immediately
 * from its old position and appear at the target (also INSIDE a folder) without
 * waiting for saving and reloading. As soon as the caller delivers new data
 * (props.data / server response), the overrides are discarded —
 * then the data alone is authoritative again.
 */
const moveOverrides = shallowRef(new Map<RowKey, { order: number; parent?: RowKey | null }>())

/**
 * Optimistic moves in LAZY-LOAD mode (`loadChildren`): there the children
 * don't live in `props.data` but in the cache `state.loadedChildren` —
 * so a move takes the row directly out of the source bucket and
 * puts a copy into the target bucket. For the top level (props.data must
 * not be mutated) there is a hide list and injected copies.
 * Both are — like moveOverrides — discarded as soon as new data arrives.
 */
const lazyMoves = shallowRef({ hidden: new Set<RowKey>(), injected: [] as R[] })

const LEAD_WIDTH = 44
const ORDER_WIDTH = 36

/** Drop: before, after or inside (like admin4). */
type DropMode = "before" | "after" | "inside"

interface CellColumn {
  key: string
  index: number
  kind: "select" | "expand" | "data" | "order"
  id: string
  sticky: boolean
  side: PinSide | null
  offset: number
  pinEdge: boolean
  col?: LayoutColumn<R>
}

const layout = useColumnLayout<R>({
  columns: () => cols(),
  resizable: () => props.resizable,
  reorderable: () => props.reorderable,
  pinnable: () => props.pinnable,
  onResize: (column, width, finished) => emit("column-resize", { column, width, finished }),
  onMove: (columnOrder, finished) => emit("column-move", { columnOrder, finished }),
  onPin: (column, side) => emit("column-pin", { column, side }),
  onVisibilityChange: (column, visible) => emit("column-visibility-change", { column, visible }),
})

const state = reactive({
  /** Server mode: rows and total count from the last response. */
  serverRows: [] as R[],
  serverTotal: -1,
  fetching: false,
  announcement: "",

  columns: computed((): ResolvedColumn<R>[] => resolveColumns(props.columns)),

  groupByList: computed((): string[] => {
    const value = props.groupBy
    if (!value) return []
    return (Array.isArray(value) ? value : value.split(/[\s,]+/)).filter(Boolean)
  }),

  isServer: computed((): boolean => props.server || Boolean(props.dataSource)),

  /**
   * Hierarchy from a flat list (parentField). Null once the data is
   * already nested or the prerequisites are missing.
   */
  nested: computed((): NestedTree<R> | null => {
    if (props.childRows || !props.parentField) return null
    if (!props.rowKey) {
      console.warn("[DataTable] `parent-field` braucht `row-key`, um Eltern und Kinder zu verbinden")
      return null
    }
    return nestByParent(state.rows as R[], props.rowKey, props.parentField)
  }),

  /**
   * Access to the children: from `childRows`, from the built tree
   * (`parentField`) and/or from the lazy-loaded levels — merged in this
   * order.
   */
  childAccessor: computed((): ChildRowsAccessor<R> | null => {
    const nested = state.nested as NestedTree<R> | null
    const staticAccess: ChildRowsAccessor<R> | null =
      props.childRows ?? (nested ? (row: R) => nested.children.get(row[props.rowKey!] as RowKey) : null)

    if (!props.loadChildren) return staticAccess

    return (row: R) => {
      const own =
        typeof staticAccess === "function"
          ? staticAccess(row)
          : staticAccess
            ? (row[staticAccess] as R[] | undefined)
            : undefined
      if (own?.length) return own
      return state.loadedChildren[String(rowKeyOf(row))] as R[] | undefined
    }
  }),

  isTree: computed((): boolean => Boolean(state.childAccessor)),
  isLoading: computed((): boolean => props.loading ?? state.fetching),

  /** Lazy-loaded children per row key (empty array = there are none). */
  loadedChildren: {} as Record<string, R[]>,
  /** Rows whose children are currently loading. */
  loadingChildren: {} as Record<string, boolean>,

  /** Ongoing row drag gesture (fixed order). */
  rowDrag: null as {
    key: RowKey
    overKey: RowKey | null
    /** Like admin4: before, after or INSIDE (new parent). */
    mode: DropMode
  } | null,

  rows: computed((): R[] => {
    let base = props.dataSource ? (state.serverRows as R[]) : props.data
    if (props.rowKey && (lazyMoves.value.hidden.size || lazyMoves.value.injected.length)) {
      const key = props.rowKey
      const { hidden, injected } = lazyMoves.value
      base = base.filter((row) => !hidden.has(row[key] as RowKey)).concat(injected)
    }
    if (moveOverrides.value.size && props.rowKey) {
      const key = props.rowKey
      base = base.map((row) => {
        const override = moveOverrides.value.get(row[key] as RowKey)
        if (!override) return row
        const patched = { ...row }
        if (props.orderField) (patched as Record<string, unknown>)[props.orderField] = override.order
        if (props.parentField && override.parent !== undefined) {
          ;(patched as Record<string, unknown>)[props.parentField] = override.parent
        }
        return patched
      })
    }
    // Fixed order: numerically ascending — also in SERVER mode. Only this way
    // does a row moved via drag & drop IMMEDIATELY take its place without
    // reloading the level (the new value comes from moveOverrides above).
    // An active column sort takes precedence: then the pipeline orders in
    // client mode and the server in server mode.
    if (!props.orderField || sort.value.length > 0) return base
    const field = props.orderField
    return [...base].sort((a, b) => Number(a[field] ?? 0) - Number(b[field] ?? 0))
  }),

  /**
   * Reordering only makes sense in the fixed order — not with
   * grouping and not while a column sort is active.
   *
   * In server mode it is explicitly allowed: the order comes from the
   * server there (`orderby` on the field), the new value is computed from the
   * neighbours and reported outward via `row-reorder` — saving happens
   * outside anyway.
   */
  orderActive: computed(
    (): boolean => Boolean(props.orderField) && !state.groupByList.length && sort.value.length === 0
  ),

  sort: computed((): SortEntry[] => sort.value),

  /** Filter/search/sort/grouping — in server mode the server does this. */
  built: computed(
    (): BuiltRows<R> =>
      buildRows<R>({
        data: (state.nested as NestedTree<R> | null)?.roots ?? (state.rows as R[]),
        columns: state.columns,
        sort: state.isServer ? [] : sort.value,
        filters: state.isServer ? [] : filters.value,
        search: state.isServer ? "" : search.value,
        searchFn: props.searchFn,
        childRows: state.childAccessor as ChildRowsAccessor<R> | null,
        filterFromLeafRows: props.filterFromLeafRows,
        groupBy: state.groupByList,
        rowKey: props.rowKey,
      })
  ),

  /** Cursor mode: the caller controls loading more (see hasMore). */
  cursorMode: computed((): boolean => props.hasMore !== null && props.hasMore !== undefined),
  /** Page sizes of the cursor bar — the current size is always selectable. */
  cursorPageSizes: computed((): number[] => {
    const options = new Set(props.cursorPageSizes)
    options.add(pageSize.value)
    return [...options].sort((a, b) => a - b)
  }),
  /** "N entries" or "N of M" — M only if the server knows a total count. */
  loadedText: computed((): string => {
    const loaded = state.rows.length
    // Local search/filter active: show the number of MATCHES, not the
    // load counter — otherwise the bar looks as if nothing were filtered.
    if (!state.isServer && state.filteredCount !== loaded) {
      return t("dataTable.filteredOf", { filtered: state.filteredCount, loaded })
    }
    const total = props.total ?? (state.serverTotal >= 0 ? state.serverTotal : -1)
    if (total >= 0 && total !== loaded) return t("dataTable.loadedOf", { loaded, total })
    if (loaded === 1) return t("dataTable.loadedOne")
    return t("dataTable.loaded", { loaded })
  }),

  facets: computed((): Record<string, ColumnFacets> => state.built.facets),

  filteredCount: computed((): number =>
    state.isServer ? (props.total ?? state.serverTotal ?? state.rows.length) : state.built.filteredCount
  ),

  pageCount: computed((): number => {
    if (!props.paginate) return 1
    const total = state.filteredCount
    return Math.max(1, Math.ceil(total / Math.max(1, pageSize.value)))
  }),

  pagedNodes: computed((): RowNode<R>[] =>
    props.paginate && !state.isServer ? paginateNodes(state.built.nodes, page.value, pageSize.value) : state.built.nodes
  ),

  expandedSet: computed((): Set<RowKey> => new Set(expandedKeys.value)),
  selectedSet: computed((): Set<RowKey> => new Set(selectedKeys.value)),

  displayRows: computed((): DisplayRow<R>[] =>
    flattenNodes(state.pagedNodes as RowNode<R>[], {
      isExpanded: (key) => state.expandedSet.has(key),
      withDetail: props.rowDetail,
      // With lazy loading it's unknown beforehand whether a row has children: show
      // the arrow as long as the opposite isn't established.
      mayHaveChildren: props.loadChildren
        ? (node) => node.kind === "data" && Boolean(node.row) && childState(node.row!) !== "none"
        : undefined,
    })
  ),

  /** Index in the render list per row key — for keyboard and focus. */
  rowIndexOf: computed((): Record<string, number> => {
    const map: Record<string, number> = {}
    state.displayRows.forEach((row, index) => {
      map[row.key] = index
    })
    return map
  }),

  dataDisplayRows: computed((): DisplayRow<R>[] => state.displayRows.filter((row) => row.kind === "data")),

  rowSelection: computed((): Record<string, SelectionState> => {
    const map: Record<string, SelectionState> = {}
    for (const row of state.displayRows) {
      if (row.kind === "detail" || !row.node) continue
      map[row.key] =
        row.kind === "data" && !row.node.children.length
          ? state.selectedSet.has(row.nodeKey)
            ? "checked"
            : "unchecked"
          : selectionStateFor(row.node, state.selectedSet)
    }
    return map
  }),

  selectAllState: computed((): SelectionState => {
    const keys = selectableKeysOnPage()
    if (!keys.length) return "unchecked"
    const hits = keys.filter((key) => state.selectedSet.has(key)).length
    return hits === 0 ? "unchecked" : hits === keys.length ? "checked" : "indeterminate"
  }),

  sortIndex: computed((): Record<string, number | undefined> => {
    const map: Record<string, number | undefined> = {}
    sort.value.forEach((entry, index) => {
      map[entry.id] = index
    })
    return map
  }),
  sortDirs: computed((): Record<string, boolean> => {
    const map: Record<string, boolean> = {}
    for (const entry of sort.value) map[entry.id] = entry.desc
    return map
  }),

  /** Leading columns (selection, expand) plus the visible data columns. */
  cellColumns: computed((): CellColumn[] => {
    const cells: CellColumn[] = []
    let lead = 0
    if (props.orderField) {
      cells.push({
        key: "__order",
        index: cells.length,
        kind: "order",
        id: "__order",
        sticky: true,
        side: "start",
        offset: lead,
        pinEdge: false,
      })
      lead += ORDER_WIDTH
    }
    if (props.selectable !== false) {
      cells.push({
        key: "__select",
        index: cells.length,
        kind: "select",
        id: "__select",
        sticky: true,
        side: "start",
        offset: lead,
        pinEdge: false,
      })
      lead += LEAD_WIDTH
    }
    if (state.hasExpandColumn) {
      cells.push({
        key: "__expand",
        index: cells.length,
        kind: "expand",
        id: "__expand",
        sticky: true,
        side: "start",
        offset: lead,
        pinEdge: false,
      })
      lead += LEAD_WIDTH
    }
    for (const col of layout.state.visibleColumns as LayoutColumn<R>[]) {
      cells.push({
        key: col.column.id,
        index: cells.length,
        kind: "data",
        id: col.column.id,
        sticky: Boolean(col.pinned),
        side: col.pinned || null,
        offset: col.pinned === "start" ? col.offset + lead : col.offset,
        pinEdge: col.pinEdge,
        col,
      })
    }
    return cells
  }),

  firstDataCellIndex: computed((): number => state.cellColumns.find((cell) => cell.kind === "data")?.index ?? 0),

  /**
   * Dedicated expand column only for groups and detail panels. With tree data
   * the arrow sits IN the first data column — only there does it indent with the
   * level, and that is exactly what makes the hierarchy visible.
   */
  hasExpandColumn: computed((): boolean => Boolean(props.rowDetail || state.groupByList.length)),

  gridStyle: computed((): Record<string, string> => {
    const tracks: string[] = []
    if (props.orderField) tracks.push(`${ORDER_WIDTH}px`)
    if (props.selectable !== false) tracks.push(`${LEAD_WIDTH}px`)
    if (state.hasExpandColumn) tracks.push(`${LEAD_WIDTH}px`)
    for (const col of layout.state.visibleColumns as LayoutColumn<R>[]) tracks.push(col.track)
    return { gridTemplateColumns: tracks.join(" ") }
  }),

  hostStyle: computed((): Record<string, string> => {
    const style: Record<string, string> = { "--dt-row-height": `${props.rowHeight}px` }
    // Only set when given — otherwise the inline value would override every
    // outside rule and `--dt-max-height` would no longer be a variable.
    if (props.maxHeight) style["--dt-max-height"] = props.maxHeight
    return style
  }),

  gridRole: computed((): string => (state.isTree ? "treegrid" : "grid")),

  // Panel props aren't generic — cast to the base form here.
  filterColumns: computed((): ResolvedColumn[] =>
    (layout.state.visibleColumns as LayoutColumn<R>[])
      .map((col) => col.column as unknown as ResolvedColumn)
      .filter((column) => column.filterable)
  ),

  footerRows: computed((): R[] => (state.isTree ? state.built.topLevelRows : state.built.dataRows)),

  hasColumnFooters: computed((): boolean =>
    (layout.state.visibleColumns as LayoutColumn<R>[]).some((col) => col.column.def.footer !== undefined)
  ),

  footerText: computed((): Record<string, string> => {
    const map: Record<string, string> = {}
    for (const col of layout.state.visibleColumns as LayoutColumn<R>[]) {
      const footer = col.column.def.footer
      if (footer === undefined) continue
      map[col.column.id] = typeof footer === "function" ? footer(state.footerRows) : footer
    }
    return map
  }),

  virtualizeActive: computed((): boolean =>
    props.virtualize === "auto" ? state.displayRows.length > props.virtualizeThreshold : Boolean(props.virtualize)
  ),

  hasFilterOrSearch: computed(
    (): boolean => Boolean(search.value.trim()) || filters.value.some((filter) => !isEmptyFilter(filter.value))
  ),

  showEmpty: computed((): boolean => !state.displayRows.length && !state.hasFilterOrSearch && !state.isLoading),
  showNoResults: computed((): boolean => !state.displayRows.length && state.hasFilterOrSearch && !state.isLoading),
  showToolbar: computed((): boolean => props.withSearch || props.withColumnsMenu),
})

// reactive() unwraps the generics to `Row`; these helpers give the accessors
// their concrete type back.
const cols = (): ResolvedColumn<R>[] => state.columns as ResolvedColumn<R>[]
const displayed = (): DisplayRow<R>[] => state.displayRows as DisplayRow<R>[]
const dataRowsOf = (): R[] => state.built.dataRows as R[]
const selectedSetOf = (): Set<RowKey> => state.selectedSet as Set<RowKey>

const virtual = useVirtualRows<R>(scrollerEl, {
  rows: () => displayed(),
  rowHeight: () => props.rowHeight,
  enabled: () => state.virtualizeActive,
})

const nav = useGridNavigation(scrollerEl, {
  rowCount: () => state.displayRows.length,
  colCount: () => state.cellColumns.length,
  pageRows: () => Math.max(1, Math.floor((scrollerEl.value?.clientHeight ?? 400) / props.rowHeight)),
  onHeaderActivate: (col, shift) => {
    const cell = state.cellColumns[col]
    if (cell?.kind === "data") toggleSort(cell.col!.column, shift)
    else if (cell?.kind === "select") toggleSelectAll()
  },
  onCellActivate: (rowIndex, col) => {
    const displayRow = state.displayRows[rowIndex]
    const cell = state.cellColumns[col]
    if (!displayRow) return
    const onTreeCell = state.isTree && cell?.kind === "data" && cell.index === state.firstDataCellIndex
    if (displayRow.expandable && (cell?.kind === "expand" || displayRow.kind === "group" || onTreeCell)) {
      toggleExpand(displayRow)
      return
    }
    if (displayRow.kind === "data" && cell?.kind === "data") {
      emit("cell-click", {
        column: cell.col!.column.id,
        value: cell.col!.column.get(displayRow.row!),
        row: displayRow.row!,
        index: displayRow.index,
      })
      emit("row-activate", { key: displayRow.nodeKey, row: displayRow.row!, index: displayRow.index })
    }
  },
  onToggleSelect: (rowIndex) => {
    const displayRow = state.displayRows[rowIndex]
    if (displayRow) toggleRowSelection(displayRow, false)
  },
  onExtendSelection: (rowIndex) => {
    const displayRow = state.displayRows[rowIndex]
    if (displayRow) toggleRowSelection(displayRow, true)
  },
  onSelectAll: () => selectAllOnPage(true),
  onCopy: () => void copySelectedRows(),
  onContextMenu: (rowIndex, col) => {
    const displayRow = state.displayRows[rowIndex]
    const cell = state.cellColumns[col]
    if (displayRow?.kind !== "data" || cell?.kind !== "data") return
    emit("cell-contextmenu", {
      column: cell.col!.column.id,
      value: cell.col!.column.get(displayRow.row!),
      row: displayRow.row!,
      index: displayRow.index,
      originalEvent: new MouseEvent("contextmenu"),
    })
  },
  onMoveRow: (rowIndex, delta) => moveRowByKeyboard(rowIndex, delta),
  onMoveColumn: (col, delta) => {
    const cell = state.cellColumns[col]
    if (cell?.kind === "data" && cell.col!.movable) layout.shiftColumn(cell.col!.column.id, delta)
  },
  onResizeColumn: (col, delta) => {
    const cell = state.cellColumns[col]
    if (cell?.kind !== "data" || !cell.col!.resizable) return
    layout.setWidth(cell.col!.column.id, cell.col!.width + delta)
    emit("column-resize", {
      column: cell.col!.column.id,
      width: cell.col!.width + delta,
      finished: true,
    })
  },
})

// ── Rendering ────────────────────────────────────────────────────────

function cellStyle(cell: CellColumn): Record<string, string> {
  if (!cell.sticky) return {}
  return cell.side === "end"
    ? { position: "sticky", insetInlineEnd: `${cell.offset}px`, zIndex: "2" }
    : { position: "sticky", insetInlineStart: `${cell.offset}px`, zIndex: "2" }
}

/**
 * Indentation of tree and group levels. It sits on the FIRST data column
 * — in the narrow expand column (fixed width) it would be invisible.
 */
/**
 * Indentation of the levels. In the tree the guide slots handle this
 * (`.vi-dt-guide`) — there the normal padding stays. Groups without a tree
 * have no guide lines and are still indented via padding.
 */
function indentStyle(cell: CellColumn, displayRow: DisplayRow<R>): Record<string, string> {
  if (cell.index !== state.firstDataCellIndex || displayRow.depth === 0) return {}
  if (state.isTree) return {}
  return {
    paddingInlineStart: `calc(var(--dt-cell-padding) + var(--dt-indent) * ${displayRow.depth})`,
  }
}

function cellClass(cell: CellColumn, displayRow: DisplayRow<R>): string {
  const source = cell.col?.column.def.cellClass
  if (!source || !displayRow.row) return ""
  if (typeof source === "string") return source
  return source(cell.col!.column.get(displayRow.row), displayRow.row) ?? ""
}

function ariaSort(cell: CellColumn): "none" | "ascending" | "descending" | undefined {
  if (cell.kind !== "data" || !cell.col!.column.sortable) return undefined
  const index = state.sortIndex[cell.col!.column.id]
  if (index === undefined) return "none"
  return state.sortDirs[cell.col!.column.id] ? "descending" : "ascending"
}

function filterButtonId(columnId: string): string {
  return `${uid}-filter-${columnId.replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

function filterValue(columnId: string): unknown {
  return filters.value.find((filter) => filter.id === columnId)?.value
}

function groupLabel(displayRow: DisplayRow<R>): string {
  return defaultText(displayRow.node?.groupValue)
}

function aggregateText(cell: CellColumn, displayRow: DisplayRow<R>): string {
  if (cell.kind !== "data" || !displayRow.node) return ""
  const column = cell.col!.column
  const value = displayRow.node.aggregates?.[column.id]
  if (value === undefined) return ""
  const first = displayRow.node.groupRows?.[0]
  return column.def.formatter && first ? column.def.formatter(value, first) : defaultText(value)
}

// ── Sorting ──────────────────────────────────────────────────────────

function toggleSort(column: ResolvedColumn<R>, multi: boolean): void {
  if (!column.sortable) return
  // The NEW value is kept locally and passed on — not read back from the model
  // (see scheduleFetch: with a bound v-model the update only arrives
  // with the parent's prop).
  const next = nextSortState(sort.value, column as ResolvedColumn, {
    multi,
    descFirst: props.sortDescFirst,
    withoutRemoval: props.withoutSortRemoval,
    maxMultiSort: props.maxMultiSort,
  })
  sort.value = next
  emit("sort-change", next)
  setPage(0, false)
  if (state.isServer) scheduleFetch(false, { sort: next })
}

function applySort(columnId: string, desc: boolean): void {
  const next = [{ id: columnId, desc }]
  sort.value = next
  emit("sort-change", next)
  setPage(0, false)
  if (state.isServer) scheduleFetch(false, { sort: next })
}

function onHeaderClick(cell: CellColumn, event: MouseEvent): void {
  nav.setActive(-1, cell.index, false)
  if (cell.kind !== "data") return
  const target = event.target as HTMLElement
  // Don't sort on clicks on header controls (filter, menu, pin, resize).
  if (target.closest(".vi-dt-filter-button, .vi-dt-column-menu, .vi-dt-pin, .vi-dt-resize")) return
  toggleSort(cell.col!.column, event.shiftKey)
}

// ── Search & filter ──────────────────────────────────────────────────

function onSearchInput(value: string): void {
  search.value = value
  setPage(0, false)
  emit("filter-change", { search: value, filters: filters.value })
  if (state.isServer) scheduleFetch(true, { search: value })
}

function setFilter(columnId: string, value: unknown): void {
  const rest = filters.value.filter((filter) => filter.id !== columnId)
  const next = isEmptyFilter(value) ? rest : [...rest, { id: columnId, value }]
  filters.value = next
  setPage(0, false)
  emit("filter-change", { search: search.value, filters: next })
  if (state.isServer) scheduleFetch(true, { filters: next })
}

// ── Selection ────────────────────────────────────────────────────────

/** Badges of a cell (columns with a `badge` function, e.g. select/bool). */
function badgesFor(column: ResolvedColumn<R>, row: R): CellBadge[] | null {
  const badges = column.def.badge?.(column.get(row), row)
  return badges?.length ? badges : null
}

function canSelect(row: R): boolean {
  return props.selectableRows ? props.selectableRows(row) : true
}

/**
 * Selectable keys of the current page — including collapsed
 * subtrees and group members, but without locked rows
 * (`selectableRows`). Only visit the page's root nodes, otherwise
 * expanded children count twice.
 */
function selectableKeysOnPage(): RowKey[] {
  const keys: RowKey[] = []
  const seen = new Set<RowKey>()

  const visit = (node: RowNode<R>): void => {
    if (node.kind === "data" && node.row && !seen.has(node.key)) {
      if (canSelect(node.row)) {
        seen.add(node.key)
        keys.push(node.key)
      }
    }
    for (const child of node.children) visit(child)
  }

  for (const displayRow of displayed()) {
    if (displayRow.kind === "detail" || displayRow.depth !== 0 || !displayRow.node) continue
    visit(displayRow.node as RowNode<R>)
  }
  return keys
}

function commitSelection(keys: RowKey[]): void {
  selectedKeys.value = keys
  emit("row-select", { selectedKeys: keys, rows: resolveSelectedRows(keys) })
}

function resolveSelectedRows(keys: RowKey[]): R[] {
  const wanted = new Set(keys)
  return dataRowsOf().filter((row: R, index: number) => {
    const key = props.rowKey ? (row[props.rowKey] as RowKey) : index
    return wanted.has(key)
  })
}

function toggleRowSelection(displayRow: DisplayRow<R>, range: boolean): void {
  if (props.selectable === false || displayRow.kind === "detail") return
  if (displayRow.kind === "data" && displayRow.row && !canSelect(displayRow.row)) return

  if (props.selectable === "single") {
    commitSelection(state.selectedSet.has(displayRow.nodeKey) ? [] : [displayRow.nodeKey])
    lastSelectedIndex = displayRow.index
    return
  }

  const selected: Set<RowKey> = new Set(selectedSetOf())

  if (range && lastSelectedIndex !== null && displayRow.kind === "data") {
    const from = Math.min(lastSelectedIndex, displayRow.index)
    const to = Math.max(lastSelectedIndex, displayRow.index)
    for (const candidate of state.dataDisplayRows as DisplayRow<R>[]) {
      if (candidate.index < from || candidate.index > to) continue
      if (candidate.row && !canSelect(candidate.row)) continue
      selected.add(candidate.nodeKey)
    }
    commitSelection([...selected])
    return
  }

  // Tree/group: include children.
  const keys = displayRow.node ? collectKeys(displayRow.node) : [displayRow.nodeKey]
  const selectable = keys.filter((key) => {
    const row = findRowByKey(key)
    return !row || canSelect(row)
  })
  const allSelected = selectable.every((key) => selected.has(key))
  for (const key of selectable) {
    if (allSelected) selected.delete(key)
    else selected.add(key)
  }
  if (displayRow.kind === "data") lastSelectedIndex = displayRow.index
  commitSelection([...selected])
}

function findRowByKey(key: RowKey): R | undefined {
  if (!props.rowKey) return undefined
  return dataRowsOf().find((row: R) => (row[props.rowKey!] as RowKey) === key)
}

/**
 * Selection via checkbox. Deliberately on `click` rather than `change`: only the
 * click event carries `shiftKey`, and range selection relies on it.
 */
function onSelectRow(displayRow: DisplayRow<R>, event: MouseEvent): void {
  toggleRowSelection(displayRow, event.shiftKey)
}
// Click on the ROW (not the checkbox): behaves like a file manager.
// A plain click replaces the selection with this row; Ctrl/Cmd adds
// or removes it; Shift selects the range. The checkbox
// itself (onSelectRow) still toggles additively.
// With Ctrl/Cmd or Shift held, the click serves multi-selection —
// the browser's text selection is suppressed for this (preventDefault on
// mousedown prevents the selection from starting, the click still arrives).
function onCellMouseDown(event: MouseEvent): void {
  if (props.selectable === false || !props.selectOnRowClick) return
  if (event.ctrlKey || event.metaKey || event.shiftKey) event.preventDefault()
}
function selectRowFromClick(displayRow: DisplayRow<R>, event: MouseEvent): void {
  if (props.selectable !== "multiple" || event.ctrlKey || event.metaKey || event.shiftKey) {
    toggleRowSelection(displayRow, event.shiftKey)
    return
  }
  if (displayRow.kind === "detail") return
  if (displayRow.kind === "data" && displayRow.row && !canSelect(displayRow.row)) return
  // Tree/group: include children (like the checkbox).
  const keys = (displayRow.node ? collectKeys(displayRow.node) : [displayRow.nodeKey]).filter((key) => {
    const row = findRowByKey(key)
    return !row || canSelect(row)
  })
  if (displayRow.kind === "data") lastSelectedIndex = displayRow.index
  commitSelection(keys)
}

function selectAllOnPage(force?: boolean): void {
  const keys = selectableKeysOnPage()
  const allSelected = keys.length > 0 && keys.every((key) => selectedSetOf().has(key))
  const selected: Set<RowKey> = new Set(selectedSetOf())
  const shouldSelect = force ?? !allSelected
  for (const key of keys) {
    if (shouldSelect) selected.add(key)
    else selected.delete(key)
  }
  commitSelection([...selected])
  state.announcement = shouldSelect
    ? t("dataTable.rowsSelected", { count: keys.length })
    : t("dataTable.selectionCleared")
}

function toggleSelectAll(): void {
  selectAllOnPage()
}

// ── Lazy-load children ───────────────────────────────────────────────

function rowKeyOf(row: R): RowKey {
  return props.rowKey ? (row[props.rowKey] as RowKey) : ""
}

/**
 * What do we know about this row's children?
 *   "none"    → definitely none (the application says so via `rowHasChildren`)
 *   "empty"   → loaded, there were none → arrow stays, but disabled
 *   "loaded"  → loaded, there are children
 *   "unknown" → not loaded yet → arrow active
 */
function childState(row: R): "none" | "empty" | "loaded" | "unknown" {
  if (props.rowHasChildren?.(row) === false) return "none"
  const cached = state.loadedChildren[String(rowKeyOf(row))] as R[] | undefined
  if (!cached) return "unknown"
  return cached.length ? "loaded" : "empty"
}

function isLoadingChildren(row?: R): boolean {
  return row ? Boolean(state.loadingChildren[String(rowKeyOf(row))]) : false
}

/** Arrow without effect: loaded and there is nothing. */
function isEmptyBranch(displayRow: DisplayRow<R>): boolean {
  if (!props.loadChildren || displayRow.kind !== "data" || !displayRow.row) return false
  return childState(displayRow.row) === "empty" && !displayRow.node?.children.length
}

/** Fetch a row's children (once; `force` reloads). */
async function fetchChildren(row: R, force = false): Promise<void> {
  if (!props.loadChildren) return
  const key = String(rowKeyOf(row))
  if (!force && state.loadedChildren[key]) return
  if (state.loadingChildren[key]) return

  state.loadingChildren[key] = true
  try {
    const children = await props.loadChildren(row)
    state.loadedChildren[key] = (children ?? []) as (typeof state.loadedChildren)[string]
  } catch (error) {
    emit("children-error", { error, key: rowKeyOf(row), row })
    console.warn("[DataTable] Kinder konnten nicht geladen werden", error)
  } finally {
    delete state.loadingChildren[key]
  }
}

// ── Expanding ────────────────────────────────────────────────────────

function toggleExpand(displayRow: DisplayRow<R>): void {
  if (!displayRow.expandable) return
  if (isEmptyBranch(displayRow) || isLoadingChildren(displayRow.row)) return

  // Load first, then expand — otherwise an empty level expands and
  // collapses again as soon as the response arrives.
  if (props.loadChildren && displayRow.kind === "data" && displayRow.row) {
    const row = displayRow.row
    if (childState(row) === "unknown" && !displayRow.node?.children.length) {
      void fetchChildren(row)
        .then(() => {
          if (childState(row) !== "empty") expand(displayRow.nodeKey, row)
        })
        .catch((error) => console.warn("[DataTable] Ebene konnte nicht aufgeklappt werden", error))
      return
    }
  }

  const keys = new Set(expandedKeys.value)
  if (keys.has(displayRow.nodeKey)) {
    keys.delete(displayRow.nodeKey)
    expandedKeys.value = [...keys]
    emit("row-collapse", { key: displayRow.nodeKey, row: displayRow.row })
  } else {
    keys.add(displayRow.nodeKey)
    expandedKeys.value = [...keys]
    emit("row-expand", { key: displayRow.nodeKey, row: displayRow.row })
  }
}

/** Expand a row and emit the event. */
function expand(key: RowKey, row?: R): void {
  if (expandedKeys.value.includes(key)) return
  expandedKeys.value = [...expandedKeys.value, key]
  emit("row-expand", { key, row })
}

function allExpandableKeys(nodes: RowNode<R>[] = state.built.nodes as RowNode<R>[], into: RowKey[] = []): RowKey[] {
  for (const node of nodes) {
    if (node.children.length || (props.rowDetail && node.kind === "data")) into.push(node.key)
    if (node.children.length) allExpandableKeys(node.children, into)
  }
  return into
}

// ── Cell clicks ──────────────────────────────────────────────────────

/**
 * Double click on a data row. Controls in the row (selection,
 * expand, actions) don't trigger it — double-clicking there doesn't mean
 * "open record".
 */
function onRowDoubleClick(displayRow: DisplayRow<R>, event: MouseEvent): void {
  if (displayRow.kind !== "data" || !displayRow.row) return
  const target = event.target as HTMLElement
  if (target.closest("wa-checkbox, wa-button, a, input, select, .vi-dt-expand")) return
  // A double click fires two clicks, which would undo the click selection
  // again — the row stays/becomes selected.
  if (props.selectable !== false && props.selectOnRowClick && canSelect(displayRow.row)) {
    const key = displayRow.nodeKey
    if (!state.selectedSet.has(key)) {
      commitSelection(props.selectable === "single" ? [key] : [...selectedSetOf(), key])
    }
  }
  emit("row-dblclick", {
    key: displayRow.nodeKey,
    row: displayRow.row,
    index: displayRow.index,
    originalEvent: event,
  })
  emit("row-activate", { key: displayRow.nodeKey, row: displayRow.row, index: displayRow.index })
}

function onCellClick(displayRow: DisplayRow<R>, cell: CellColumn, event: MouseEvent): void {
  nav.setActive(state.rowIndexOf[displayRow.key] ?? 0, cell.index, false)
  if (displayRow.kind === "group") {
    toggleExpand(displayRow)
    return
  }
  if (cell.kind !== "data" || !displayRow.row) return
  const target = event.target as HTMLElement
  if (target.closest(".vi-dt-expand, .vi-dt-checkbox")) return
  // Select the row on click — unless the click hits an interactive element
  // in the cell (link, button, input field) that handles the click itself.
  if (
    props.selectable !== false &&
    props.selectOnRowClick &&
    displayRow.kind === "data" &&
    !target.closest("a, button, input, select, textarea, label, [contenteditable], wa-button, wa-checkbox, wa-switch")
  ) {
    selectRowFromClick(displayRow, event)
  }
  emit("cell-click", {
    column: cell.col!.column.id,
    value: cell.col!.column.get(displayRow.row),
    row: displayRow.row,
    index: displayRow.index,
  })
}

function onCellContextMenu(displayRow: DisplayRow<R>, cell: CellColumn, event: MouseEvent): void {
  if (cell.kind !== "data" || !displayRow.row) return
  emit("cell-contextmenu", {
    column: cell.col!.column.id,
    value: cell.col!.column.get(displayRow.row),
    row: displayRow.row,
    index: displayRow.index,
    originalEvent: event,
  })
}

// ── Fixed order: reordering rows ─────────────────────────────────────

/**
 * Rows are dragged with POINTER events, not with HTML5 drag and drop.
 * Reason: `dragover` requires an accepting target and fires unreliably
 * depending on the environment (not at all on touch) — the insertion marker would then
 * be missing and the target position would be random. Pointer events behave the same
 * everywhere, work with touch and are testable.
 */
function beginRowDrag(displayRow: DisplayRow<R>, event: PointerEvent): void {
  if (!state.orderActive || displayRow.kind !== "data") return
  state.rowDrag = { key: displayRow.nodeKey, overKey: null, mode: "after" }

  if (dragSession) {
    const keys = movingKeysFor(displayRow.nodeKey)
    dragSession.start({
      keys,
      rows: keys.map((movingKey) => findRowByKey(movingKey) ?? displayRow.row!).filter(Boolean) as R[],
      source: props.dragSource,
    })
  }

  const move = (moveEvent: PointerEvent) => updateRowDrag(moveEvent.clientX, moveEvent.clientY)
  const up = (upEvent: PointerEvent) => {
    window.removeEventListener("pointermove", move)
    window.removeEventListener("pointerup", up)
    updateRowDrag(upEvent.clientX, upEvent.clientY)
    commitRowDrag()
  }
  window.addEventListener("pointermove", move)
  window.addEventListener("pointerup", up)
  event.stopPropagation()
}

/**
 * Determine the row under the pointer and derive the zone. As in admin4 there are
 * three: top quarter = before, bottom quarter = after, the middle = INSIDE
 * (the row becomes a child of the target). Without a tree only before/after remain.
 */
function updateRowDrag(clientX: number, clientY: number): void {
  const drag = state.rowDrag
  if (!drag) return
  // Ask the enclosing session first: if it provides a target (tree node or
  // folder row), it takes over display and drop — the internal indicator rests.
  if (dragSession?.state.active) {
    const external = dragSession.update(clientX, clientY)
    if (external) {
      drag.overKey = null
      return
    }
  }
  const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>(".vi-dt-row.is-data")
  if (!element || !scrollerEl.value?.contains(element)) return
  const target = displayed().find((row) => row.key === element.dataset.key)
  if (!target || target.nodeKey === drag.key) return

  // Dragging into its own subtree is impossible — it would hang from itself.
  if (isDescendant(state.built.nodes as RowNode<R>[], drag.key, target.nodeKey)) {
    drag.overKey = null
    return
  }

  const rect = element.getBoundingClientRect()
  const offset = (clientY - rect.top) / rect.height
  drag.overKey = target.nodeKey
  if (!state.isTree) drag.mode = offset > 0.5 ? "after" : "before"
  else if (offset < 0.25) drag.mode = "before"
  else if (offset > 0.75) drag.mode = "after"
  else drag.mode = "inside"
}

/** Lazy-load mode: take the row out of its old bucket and insert it at the target. */
function applyLazyMove(source: NodeLocation<R>, targetParent: RowKey | null, insertAt: number, order: number): void {
  const row = source.node.row
  if (!row) return
  const key = source.node.key
  const moved = { ...row } as R
  if (props.orderField) (moved as Record<string, unknown>)[props.orderField] = order
  if (props.parentField) (moved as Record<string, unknown>)[props.parentField] = targetParent

  const hidden = new Set(lazyMoves.value.hidden)
  let injected = lazyMoves.value.injected.filter((candidate) => (candidate[props.rowKey!] as RowKey) !== key)

  // Remove from the source …
  if (source.parentKey === null) {
    hidden.add(key) // top level: props.data stays untouched, just hide
  } else {
    const bucket = state.loadedChildren[String(source.parentKey)] as R[] | undefined
    if (bucket) {
      state.loadedChildren[String(source.parentKey)] = bucket.filter(
        (candidate) => (candidate[props.rowKey!] as RowKey) !== key
      ) as (typeof state.loadedChildren)[string]
    }
  }

  // … and insert at the target.
  if (targetParent === null) {
    // The original (if it is in props.data) stays hidden; the copy with the
    // new order value is visible.
    hidden.add(key)
    injected = [...injected, moved]
  } else {
    const bucket = state.loadedChildren[String(targetParent)] as R[] | undefined
    if (bucket) {
      const next = [...bucket]
      next.splice(Math.max(0, Math.min(insertAt, next.length)), 0, moved)
      state.loadedChildren[String(targetParent)] = next as (typeof state.loadedChildren)[string]
    }
    // Bucket never loaded: on expand fetchChildren gets the current state
    // from the server — which contains the row after saving anyway.
  }

  lazyMoves.value = { hidden, injected }
}

/**
 * Reset lazy-load mode: discard the children cache and collapse all
 * branches — the arrows are back to "collapsed" afterwards, and the next
 * expand fetches the fresh state from the server. Runs on `reload()` and
 * when the caller delivers new data; without `loadChildren` (parentField
 * trees) the expand state is kept, since there the children are always
 * derived from the current data anyway.
 */
function resetLazyTree(): void {
  if (!props.loadChildren) return
  state.loadedChildren = {}
  state.loadingChildren = {}
  if (expandedKeys.value.length) expandedKeys.value = []
}

// Drag & drop is purely CLIENT-SIDE: the row is moved locally (buckets/
// overrides above), `row-reorder` reports the move for saving in the
// background — the table reloads NOTHING afterwards, and the app doesn't
// have to either. When new data comes in from outside, it is authoritative: the
// optimistic overrides are discarded (fresh data already contains
// a saved move). The lazy-load tree stays as it is —
// it is only collapsed and cleared via `reload()`/`resetTree()` or, via the
// opt-in `resetTreeOnDataChange`, on every data change not preceded by a
// move.
watch(
  () => (props.dataSource ? (state.serverRows as R[]) : props.data),
  () => {
    const afterMove =
      moveOverrides.value.size > 0 || lazyMoves.value.hidden.size > 0 || lazyMoves.value.injected.length > 0
    if (moveOverrides.value.size) moveOverrides.value = new Map()
    if (lazyMoves.value.hidden.size || lazyMoves.value.injected.length) {
      lazyMoves.value = { hidden: new Set(), injected: [] }
    }
    if (props.resetTreeOnDataChange && !afterMove) resetLazyTree()
  }
)

function commitRowDrag(): void {
  const drag = state.rowDrag
  state.rowDrag = null
  // A session target (tree/folder outside the internal logic) takes precedence:
  // the Browser takes over the move, nothing else happens here.
  if (dragSession?.state.active) {
    if (dragSession.state.over) {
      dragSession.drop()
      return
    }
    dragSession.cancel()
  }
  if (drag?.overKey !== null && drag?.overKey !== undefined) {
    moveRowTo(drag.key, drag.overKey, drag.mode)
  }
}

/**
 * Move a row to a new position and report the new order value.
 *
 * The computation is always among the future SIBLINGS — for "inside" that is
 * among the target's children, otherwise among the target's siblings. Only then
 * does the value make sense in the tree: `sortindex` applies per parent.
 */
function moveRowTo(key: RowKey, targetKey: RowKey, mode: DropMode): void {
  if (!props.orderField || key === targetKey) return
  const field = props.orderField
  const nodes = state.built.nodes as RowNode<R>[]

  const target = locateNode(nodes, targetKey)
  if (!target) return

  // Multi-selection: if the dragged row is part of the selection, the whole
  // selection moves along — in display order. Rows that may not go to the target
  // (the target itself, ancestors of the target) are left out.
  const moving = movingKeysFor(key).filter(
    (candidate) => candidate !== targetKey && !isDescendant(nodes, candidate, targetKey)
  )
  if (!moving.length) return
  const movingSet = new Set(moving)

  const orderOf = (node: RowNode<R>): number => Number(node.row?.[field] ?? 0)

  let parentKey: RowKey | null
  let insertAt: number
  let values: number[]

  if (mode === "inside") {
    // New children: after the target's existing children.
    parentKey = targetKey
    const children = target.node.children.filter((child) => !movingSet.has(child.key))
    values = children.map(orderOf)
    insertAt = values.length
  } else {
    parentKey = target.parentKey
    const siblings = target.siblings.filter((node) => !movingSet.has(node.key))
    values = siblings.map(orderOf)
    const targetIndex = siblings.findIndex((node) => node.key === targetKey)
    insertAt = mode === "after" ? targetIndex + 1 : targetIndex
  }

  let movedCount = 0
  let parentChangedAny = false
  const firstInsertAt = insertAt

  for (const movingKey of moving) {
    const source = locateNode(nodes, movingKey)
    if (!source?.node.row) continue

    const { order, needsReindex } = orderValueFor(values, insertAt, props.orderStep)
    // Add the assigned value to the neighbour list so the next
    // row of the selection is sorted in AFTER it (order is preserved).
    values.splice(Math.max(0, Math.min(values.length, insertAt)), 0, order)

    // Apply optimistically: the row leaves its old position immediately and
    // appears at the target — on a drop INTO a folder, among its children.
    if (props.rowKey) {
      if (props.loadChildren) {
        applyLazyMove(source, parentKey, insertAt, order)
      } else {
        const next = new Map(moveOverrides.value)
        next.set(movingKey, { order, parent: props.parentField ? parentKey : undefined })
        moveOverrides.value = next
      }
    }

    emit("row-reorder", {
      row: source.node.row,
      key: movingKey,
      order,
      parent: parentKey,
      parentChanged: parentKey !== source.parentKey,
      toIndex: insertAt,
      needsReindex,
    })
    if (parentKey !== source.parentKey) parentChangedAny = true
    movedCount++
    insertAt++
  }

  if (!movedCount) return
  const movedParams = { count: movedCount, position: firstInsertAt + 1 }
  state.announcement =
    movedCount > 1
      ? parentChangedAny
        ? t("dataTable.rowsMovedLevel", movedParams)
        : t("dataTable.rowsMoved", movedParams)
      : parentChangedAny
        ? t("dataTable.rowMovedLevel", movedParams)
        : t("dataTable.rowMoved", movedParams)
}

/**
 * Which rows a move affects: only the dragged one — or, if it is part of the
 * selection, all selected rows in display order. Selected
 * descendants of an also-selected row move implicitly with their
 * subtree and are not moved twice.
 */
function movingKeysFor(key: RowKey): RowKey[] {
  if (props.selectable === false || !state.selectedSet.has(key) || state.selectedSet.size < 2) return [key]
  const selected = state.selectedSet as Set<RowKey>
  const nodes = state.built.nodes as RowNode<R>[]
  const ordered: RowKey[] = []
  for (const row of state.dataDisplayRows as DisplayRow<R>[]) {
    if (selected.has(row.nodeKey)) ordered.push(row.nodeKey)
  }
  // dataDisplayRows only contains VISIBLE rows — selected rows in
  // collapsed branches are appended so they aren't left behind.
  const seen = new Set(ordered)
  for (const candidate of selected) {
    if (!seen.has(candidate)) ordered.push(candidate)
  }
  const selectedList = [...selected]
  const result = ordered.filter(
    (candidate) => !selectedList.some((other) => other !== candidate && isDescendant(nodes, other, candidate))
  )
  return result.length ? result : [key]
}

/** Row key as in the pipeline (rowKey or index path). */
function keyOfRow(row: R, index: number): RowKey {
  return props.rowKey ? (row[props.rowKey] as RowKey) : String(index)
}

/**
 * Keyboard: move a row by one position (Alt + ↑/↓) — within its
 * SIBLINGS. Changing the parent is reserved for the mouse; via keyboard
 * it wouldn't be clear which level is being targeted.
 */
function moveRowByKeyboard(rowIndex: number, delta: number): void {
  if (!state.orderActive) return
  const displayRow = state.displayRows[rowIndex]
  if (displayRow?.kind !== "data") return
  const location = locateNode(state.built.nodes as RowNode<R>[], displayRow.nodeKey)
  if (!location) return
  const neighbour = location.siblings[location.index + delta]
  if (!neighbour) return
  moveRowTo(displayRow.nodeKey, neighbour.key, delta > 0 ? "after" : "before")
  nav.setActive(rowIndex + delta, nav.state.col)
}

// ── Columns: resize, reorder, pin ────────────────────────────────────

function onResizeStart(columnId: string, event: PointerEvent): void {
  layout.startResize(columnId, event.clientX)
  const move = (moveEvent: PointerEvent) => layout.moveResize(moveEvent.clientX)
  const up = () => {
    layout.endResize()
    window.removeEventListener("pointermove", move)
    window.removeEventListener("pointerup", up)
  }
  window.addEventListener("pointermove", move)
  window.addEventListener("pointerup", up)
}

function onDragStart(cell: CellColumn, event: DragEvent): void {
  if (cell.kind !== "data" || !cell.col!.movable) return
  event.dataTransfer?.setData("text/plain", cell.col!.column.id)
  layout.startDrag(cell.col!.column.id, event.clientX, event.clientY)
}

function onDragOver(cell: CellColumn, event: DragEvent): void {
  if (!layout.state.dragging || cell.kind !== "data") return
  event.preventDefault()
  layout.dragOver(cell.col!.column.id, event.clientX, event.clientY)
}

function pinColumn(columnId: string, side: PinSide | false): void {
  layout.pinColumn(columnId, side)
}

/**
 * Size a column to the width of its widest content.
 *
 * The TEXT is measured, not the box: the content sits in a
 * block element that fills the cell — its scrollWidth would therefore always be
 * the current column width, and autosize could never shrink. A Range
 * over the node contents yields the real text width; for component content
 * (badges, tags) the measurement falls back to scrollWidth.
 */
function autoSizeColumn(columnId: string): void {
  const cells = scrollerEl.value?.querySelectorAll<HTMLElement>(`[data-column="${columnId}"]`)
  if (!cells?.length) return
  const range = document.createRange()
  let widest = 0
  for (const cell of cells) {
    const content = cell.querySelector<HTMLElement>(".wa-ellipsis, .vi-dt-hlabel") ?? cell
    let measured = 0
    if (content.firstChild) {
      range.selectNodeContents(content)
      measured = range.getBoundingClientRect().width
    }
    widest = Math.max(widest, Math.max(measured, content.scrollWidth === content.clientWidth ? 0 : content.scrollWidth))
  }
  const width = Math.ceil(widest) + 40 // padding + header tools
  layout.setWidth(columnId, width)
  emit("column-resize", { column: columnId, width, finished: true })
}

function autoSizeColumns(): void {
  for (const col of layout.state.visibleColumns as LayoutColumn<R>[]) autoSizeColumn(col.column.id)
}

function sizeColumnsToFit(): void {
  const available = scrollerEl.value?.clientWidth ?? 0
  const columns = layout.state.visibleColumns as LayoutColumn<R>[]
  if (!available || !columns.length) return
  let lead = 0
  if (props.orderField) lead += ORDER_WIDTH
  if (props.selectable !== false) lead += LEAD_WIDTH
  if (state.hasExpandColumn) lead += LEAD_WIDTH
  const each = Math.floor((available - lead) / columns.length)
  for (const col of columns) layout.setWidth(col.column.id, each)
}

function resetColumns(): void {
  layout.resetColumns()
}

// ── Pagination ───────────────────────────────────────────────────────

function setPage(next: number, notify = true): void {
  const clamped = Math.max(0, Math.min(state.pageCount - 1, next))
  if (clamped === page.value) return
  page.value = clamped
  if (notify) emit("page-change", { page: clamped, pageSize: pageSize.value })
  nav.clamp()
  if (state.isServer) scheduleFetch(false, { page: clamped })
}

/** Cursor bar: new page size — the caller reloads with it (page-change). */
function onCursorPageSize(next: number): void {
  pageSize.value = next
  emit("page-change", { page: 0, pageSize: next })
}

function setPageSize(next: number): void {
  pageSize.value = next
  page.value = 0
  emit("page-change", { page: 0, pageSize: next })
  if (state.isServer) scheduleFetch(false, { page: 0, pageSize: next })
}

// ── Server mode ──────────────────────────────────────────────────────

/**
 * What the next server fetch should use instead of the model values.
 *
 * Needed because with a BOUND `v-model`, Vue doesn't set the local value of a
 * `defineModel` immediately: the update only arrives via the parent's
 * prop. Reading right after writing therefore yields the old value —
 * unnoticed as long as nobody binds `v-model:sort` & co., and visibly wrong
 * on the first sort click as soon as someone does.
 */
type RequestOverrides = Partial<Pick<DataTableRequest, "sort" | "filters" | "search" | "page" | "pageSize">>
let pendingRequest: RequestOverrides = {}

function buildRequest(signal: AbortSignal): DataTableRequest {
  const request: DataTableRequest = {
    sort: pendingRequest.sort ?? sort.value,
    filters: pendingRequest.filters ?? filters.value,
    search: pendingRequest.search ?? search.value,
    page: pendingRequest.page ?? page.value,
    pageSize: pendingRequest.pageSize ?? pageSize.value,
    signal,
  }
  pendingRequest = {}
  return request
}

function scheduleFetch(debounced: boolean, overrides: RequestOverrides = {}): void {
  if (!state.isServer) return
  pendingRequest = { ...pendingRequest, ...overrides }
  if (debounceTimer) window.clearTimeout(debounceTimer)
  if (!debounced) {
    void fetchRows()
    return
  }
  debounceTimer = window.setTimeout(() => {
    debounceTimer = 0
    void fetchRows()
  }, props.filterDebounce)
}

async function fetchRows(): Promise<void> {
  abortController?.abort()
  abortController = new AbortController()
  const request = buildRequest(abortController.signal)

  if (!props.dataSource) {
    emit("data-request", request)
    return
  }

  state.fetching = true
  try {
    const response = await props.dataSource(request)
    if (request.signal.aborted) return
    state.serverRows = response.rows as typeof state.serverRows
    state.serverTotal = response.total
  } catch (error) {
    if ((error as Error)?.name === "AbortError") return
    emit("data-error", { error, request })
    console.warn("[DataTable] Datenabruf fehlgeschlagen", error)
  } finally {
    if (!request.signal.aborted) state.fetching = false
  }
}

function reload(): void {
  scheduleFetch(false)
  // Without dataSource the caller replaces props.data itself (the watch above
  // kicks in then); we reset the lazy-load tree in any case.
  if (!props.dataSource) resetLazyTree()
}

// ── Copy & CSV ───────────────────────────────────────────────────────

interface ExportOptions {
  columnIds?: string[]
  includeHeaders?: boolean
  delimiter?: string
  escapeFormulas?: boolean
}

function exportColumns(columnIds?: string[]): ResolvedColumn<R>[] {
  const visible = (layout.state.visibleColumns as LayoutColumn<R>[]).map((col) => col.column)
  if (!columnIds) return visible
  const resolved: ResolvedColumn<R>[] = []
  for (const id of columnIds) {
    const column = cols().find((item) => item.id === id)
    if (column) resolved.push(column)
  }
  return resolved
}

function escapeCell(text: string, delimiter: string, escapeFormulas: boolean): string {
  let value = text
  if (escapeFormulas && /^[=+\-@]/.test(value) && Number.isNaN(Number(value))) value = `'${value}`
  return value.includes(delimiter) || value.includes('"') || value.includes("\n")
    ? `"${value.replace(/"/g, '""')}"`
    : value
}

function serializeRows(rows: R[], options: ExportOptions = {}): string {
  const delimiter = options.delimiter ?? ","
  const columns = exportColumns(options.columnIds)
  const lines: string[] = []
  if (options.includeHeaders !== false) {
    lines.push(columns.map((column) => escapeCell(column.label, delimiter, false)).join(delimiter))
  }
  for (const row of rows) {
    lines.push(
      columns.map((column) => escapeCell(column.text(row), delimiter, options.escapeFormulas ?? false)).join(delimiter)
    )
  }
  return lines.join("\n")
}

function getDataAsCsv(options: ExportOptions = {}): string {
  return serializeRows(dataRowsOf(), options)
}

function exportDataAsCsv(options: ExportOptions & { fileName?: string } = {}): void {
  const csv = getDataAsCsv(options)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = options.fileName ?? "export.csv"
  link.click()
  URL.revokeObjectURL(url)
}

async function copySelectedRows(options: ExportOptions & { format?: "tsv" | "csv" } = {}): Promise<number> {
  const selected = resolveSelectedRows(selectedKeys.value)
  const rows = selected.length ? selected : dataRowsOf()
  const text = serializeRows(rows, {
    ...options,
    delimiter: options.format === "csv" ? "," : "\t",
  })
  try {
    await navigator.clipboard?.writeText(text)
  } catch {
    // Clipboard may be denied (permission, insecure context).
  }
  state.announcement = t("dataTable.rowsCopied", { count: rows.length })
  return rows.length
}

// ── Save / load state ────────────────────────────────────────────────

function getState(): DataTableState {
  return {
    version: 1,
    columnOrder: layout.currentOrder(),
    columnWidths: { ...layout.state.widths },
    columnVisibility: Object.fromEntries(cols().map((column) => [column.id, layout.isVisible(column)])),
    columnPinning: {
      start: cols()
        .filter((column) => layout.pinOf(column) === "start")
        .map((column) => column.id),
      end: cols()
        .filter((column) => layout.pinOf(column) === "end")
        .map((column) => column.id),
    },
    sort: sort.value,
    filters: filters.value,
    search: search.value,
    selectedKeys: selectedKeys.value,
    expandedKeys: expandedKeys.value,
    page: page.value,
    pageSize: pageSize.value,
  }
}

function setState(next: Partial<DataTableState>): void {
  if (next.columnOrder) layout.state.order = [...next.columnOrder]
  if (next.columnWidths) layout.state.widths = { ...next.columnWidths }
  if (next.columnVisibility) layout.state.visibility = { ...next.columnVisibility }
  if (next.columnPinning) {
    const pinning: Record<string, PinSide | false> = {}
    for (const id of next.columnPinning.start) pinning[id] = "start"
    for (const id of next.columnPinning.end) pinning[id] = "end"
    layout.state.pinning = pinning
  }
  if (next.sort) sort.value = [...next.sort]
  if (next.filters) filters.value = [...next.filters]
  if (next.search !== undefined) search.value = next.search
  if (next.selectedKeys) selectedKeys.value = [...next.selectedKeys]
  if (next.expandedKeys) expandedKeys.value = [...next.expandedKeys]
  if (next.page !== undefined) page.value = next.page
  if (next.pageSize !== undefined) pageSize.value = next.pageSize
  layout.pruneUnknown()
}

function resetState(): void {
  layout.resetColumns()
  sort.value = []
  filters.value = []
  search.value = ""
  expandedKeys.value = []
}

defineExpose({
  // Rows
  getVisibleRows: (): R[] =>
    displayed()
      .filter((row) => row.kind === "data")
      .map((row) => row.row!),
  getProcessedRows: (): R[] => dataRowsOf(),
  getSelectedRows: (): R[] => resolveSelectedRows(selectedKeys.value),
  scrollToIndex: virtual.scrollToIndex,
  // Expanding
  expandRow: (key: RowKey) => {
    if (!expandedKeys.value.includes(key)) expandedKeys.value = [...expandedKeys.value, key]
  },
  collapseRow: (key: RowKey) => {
    expandedKeys.value = expandedKeys.value.filter((item) => item !== key)
  },
  expandAllRows: () => {
    expandedKeys.value = allExpandableKeys()
  },
  collapseAllRows: () => {
    expandedKeys.value = []
  },
  // Columns
  toggleColumn: (id: string, visible: boolean) => layout.toggleColumn(id, visible, true),
  pinColumn: (id: string, side: PinSide | false) => layout.pinColumn(id, side, true),
  getColumnPin: layout.getColumnPin,
  autoSizeColumn,
  autoSizeColumns,
  sizeColumnsToFit,
  resetColumns,
  getColumnFacets: (id: string): ColumnFacets => (state.facets as Record<string, ColumnFacets>)[id] ?? { values: [] },
  // Data
  reload,
  /** Reset the lazy-load tree: arrows collapsed, children cache empty (fresh on expand). */
  resetTree: resetLazyTree,
  /** Discard a row's lazy-loaded children and fetch them again. */
  reloadChildren: async (key: RowKey): Promise<void> => {
    const row = findRowByKey(key)
    if (!row) return
    delete state.loadedChildren[String(key)]
    return await fetchChildren(row, true)
  },
  /** A row's lazy-loaded children (undefined = not loaded yet). */
  getLoadedChildren: (key: RowKey): R[] | undefined => state.loadedChildren[String(key)] as R[] | undefined,
  getDataAsCsv,
  exportDataAsCsv,
  copySelectedRows,
  // State
  getState,
  setState,
  resetState,
  focus: () => void nav.focusActive(),
})

// ── Measure, observe, react ──────────────────────────────────────────

/** Measure header cells — the widths are the basis for the sticky offsets. */
function observeHeaderCells(): void {
  const scroller = scrollerEl.value
  if (!scroller || !headerObserver) return
  headerObserver.disconnect()
  for (const cell of scroller.querySelectorAll<HTMLElement>(".vi-dt-hcell[data-column]")) {
    headerObserver.observe(cell)
  }
}

/** Detail panels have free height → measure them for virtualization. */
function measureDetailRows(): void {
  const body = bodyEl.value
  if (!body || !detailObserver) return
  detailObserver.disconnect()
  for (const row of body.querySelectorAll<HTMLElement>("[data-detail]")) {
    virtual.measureRow(row.dataset.detail!, row.getBoundingClientRect().height)
    detailObserver.observe(row)
  }
}

/** Border-box size — contentRect lacks padding/border, but grid tracks and
 *  sticky offsets need the full box. */
function borderBox(entry: ResizeObserverEntry): { inlineSize: number; blockSize: number } {
  const box = entry.borderBoxSize?.[0]
  if (box) return box
  const rect = entry.target.getBoundingClientRect()
  return { inlineSize: rect.width, blockSize: rect.height }
}

onMounted(() => {
  headerObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.column
      if (id && !id.startsWith("__")) layout.setMeasured(id, borderBox(entry).inlineSize)
    }
  })
  detailObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const key = (entry.target as HTMLElement).dataset.detail
      if (key) virtual.measureRow(key, borderBox(entry).blockSize)
    }
  })
  virtual.syncViewport()
  void nextTick(() => {
    observeHeaderCells()
    measureDetailRows()
  })
  if (state.isServer) scheduleFetch(false)
})

onBeforeUnmount(() => {
  headerObserver?.disconnect()
  detailObserver?.disconnect()
  abortController?.abort()
  if (debounceTimer) window.clearTimeout(debounceTimer)
})

watch(
  () => layout.state.visibleColumns.length,
  () => void nextTick(observeHeaderCells)
)

watch(
  () => props.columns,
  () => {
    layout.pruneUnknown()
    void nextTick(observeHeaderCells)
  }
)

watch(
  () => state.displayRows.length,
  () => {
    nav.clamp()
    void nextTick(measureDetailRows)
  }
)

watch(
  () => expandedKeys.value.length,
  () => void nextTick(measureDetailRows)
)

// Data change: clamp the page into the valid range.
watch(
  () => state.filteredCount,
  () => {
    if (page.value > state.pageCount - 1) page.value = state.pageCount - 1
  }
)
</script>

<style scoped>
/* Sizes and colors mirror the CSS variables of <wa-data-grid>. */
.vi-dt {
  --dt-border-color: var(--wa-color-surface-border);
  --dt-border-width: var(--wa-border-width-s);
  --dt-header-background: var(--wa-color-surface-lowered);
  --dt-row-hover: var(--wa-color-neutral-fill-quiet);
  --dt-selected: var(--wa-color-brand-fill-quiet);
  --dt-stripe: color-mix(in oklab, var(--wa-color-neutral-fill-quiet) 55%, transparent);
  --dt-accent: var(--wa-color-brand-fill-loud);
  --dt-cell-padding: var(--wa-space-m);
  --dt-indent: 1.5em;
  --dt-toggle-size: 1.5rem;
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
  /* Containing block for absolutely positioned children — above all .vi-dt-live.
     Without it the live region hangs off the initial container (body) and escapes
     EVERY `overflow: hidden` of its ancestors: it then sits at the
     document position of its grid and stretches the scroll area of the whole
     page (several thousand pixels with eight grids stacked). */
  position: relative;
  color: var(--wa-color-text-normal);
  font-size: var(--wa-font-size-s);
}
.vi-dt.is-outlined {
  border: var(--dt-border-width) solid var(--dt-border-color);
  border-radius: var(--wa-border-radius-m);
  background-color: var(--wa-color-surface-default);
  overflow: hidden;
}

/* Sizes: row height, padding and text scale together. */
.vi-dt.is-size-xs {
  --dt-row-height: 2rem;
  --dt-cell-padding: var(--wa-space-xs);
  font-size: var(--wa-font-size-xs);
}
.vi-dt.is-size-s {
  --dt-row-height: 2.5rem;
  --dt-cell-padding: var(--wa-space-s);
  font-size: var(--wa-font-size-s);
}
.vi-dt.is-size-l {
  --dt-row-height: 3.5rem;
  --dt-cell-padding: var(--wa-space-l);
  font-size: var(--wa-font-size-m);
}
.vi-dt.is-size-xl {
  --dt-row-height: 4rem;
  --dt-cell-padding: var(--wa-space-xl);
  font-size: var(--wa-font-size-l);
}

.vi-dt-toolbar {
  padding: var(--wa-space-s);
  border-block-end: var(--dt-border-width) solid var(--dt-border-color);
}
.vi-dt-search {
  min-inline-size: 14rem;
}

/* One scroll area for header, body and footer — only this way do pinned
   columns and the header row stay aligned when scrolling in both directions. */
.vi-dt-scroller {
  position: relative;
  overflow: auto;
  /* Stretches when the table has a fixed height (e.g. in a
     filling view) — otherwise it stays content-sized. The cap still
     applies to content-sized tables; to fill, set
     `--dt-max-height: none` from outside. */
  flex: 1 1 auto;
  min-block-size: 0;
  max-block-size: var(--dt-max-height, 30rem);
}
.vi-dt-head {
  position: sticky;
  inset-block-start: 0;
  z-index: 3;
}
/* The row only provides the tint as a variable and lays out the cells —
   painting happens in the CELLS, which always cover the full width of the grid.
   The row box itself grows to the full width of its column tracks
   (`min-inline-size: max-content`). Without that it is only as wide as the
   visible area while the tracks extend beyond it — and cells pinned to the
   start, being `position: sticky` inside the row, scroll away with the row
   once the table is scrolled further than one visible width. */
.vi-dt-row {
  --dt-row-bg: var(--wa-color-surface-default);
  display: grid;
  align-items: stretch;
  min-inline-size: max-content;
  min-block-size: var(--dt-row-height, 2.75rem);
  background-color: transparent;
}
.vi-dt-headrow,
.vi-dt-footrow {
  --dt-row-bg: var(--dt-header-background);
  font-weight: 600;
}
.vi-dt.is-striped .vi-dt-row.is-odd {
  --dt-row-bg: var(--dt-stripe);
}
/* Precedence of the row color: selection > hover > stripe > base surface.
   The stripe rule needs `.is-striped` on the root element and thus weighs
   more than a plain `.vi-dt-row.is-data:hover` — without the following
   prefixes neither hover nor selection would be visible on odd rows. */
.vi-dt .vi-dt-row.is-data:hover {
  --dt-row-bg: var(--dt-row-hover);
}
/* Selection via row click: the row signals that it is clickable. */
.vi-dt.is-selectable .vi-dt-row.is-data {
  cursor: pointer;
}
.vi-dt .vi-dt-row.is-data.is-selected {
  --dt-row-bg: var(--dt-selected);
}
.vi-dt .vi-dt-row.is-data.is-selected:hover {
  --dt-row-bg: color-mix(in oklab, var(--dt-selected) 75%, var(--dt-row-hover));
}
.vi-dt-row.is-group {
  --dt-row-bg: var(--wa-color-surface-lowered);
  font-weight: 600;
}

.vi-dt-badges {
  display: inline-flex;
  gap: var(--wa-space-2xs, 0.25rem);
  flex-wrap: wrap;
  min-inline-size: 0;
}
.vi-dt-badge {
  --dt-badge-color: var(--wa-color-neutral-60, #71717a);
  display: inline-block;
  max-inline-size: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0.1em 0.55em;
  border-radius: var(--wa-border-radius-pill, 999px);
  font-size: 0.85em;
  font-weight: 600;
  line-height: 1.4;
  background: color-mix(in oklab, var(--dt-badge-color) 16%, var(--wa-color-surface-default, #fff));
  border: 1px solid color-mix(in oklab, var(--dt-badge-color) 45%, transparent);
  color: color-mix(in oklab, var(--dt-badge-color) 80%, var(--wa-color-text-normal, #222));
}
.vi-dt-cell {
  display: flex;
  align-items: center;
  gap: var(--wa-space-2xs);
  min-inline-size: 0;
  padding-inline: var(--dt-cell-padding);
  /* Each cell carries the tint and divider itself (see .vi-dt-row). */
  background-color: var(--dt-row-bg);
  border-block-end: var(--dt-border-width) solid var(--dt-border-color);
  overflow: hidden;
  /* Every row is its own grid, sized by `max-content` (see .vi-dt-row). If
     cell content counted towards that size, a row with a long text would
     size its flex columns differently from the others and the columns would
     no longer line up. Content still overflows and ellipsizes as before. */
  contain: inline-size;
}
.vi-dt-cell.is-lead {
  padding-inline: var(--wa-space-2xs);
  justify-content: center;
}
.vi-dt-cell.is-align-center {
  justify-content: center;
}
.vi-dt-cell.is-align-end {
  justify-content: flex-end;
}
.vi-dt-cell:focus-visible {
  outline: var(--wa-focus-ring);
  outline-offset: -2px;
}
/* Pinned cells lie ABOVE the horizontally scrolling content and must hide it
   opaquely. The row tints (stripe, hover, selection) are
   semi-transparent (color-mix with transparent), so a plain
   `background-color: var(--dt-row-bg)` would let the content show through.
   Hence: an opaque base surface as the color, the row tint as an overlay — the
   result is the same color value as for the freely scrolling cells. */
.vi-dt-cell.is-sticky {
  background-color: var(--wa-color-surface-default);
  background-image: linear-gradient(var(--dt-row-bg), var(--dt-row-bg));
}
.vi-dt-cell.is-pin-edge.is-pin-start {
  box-shadow: inset -1px 0 0 var(--dt-accent);
}
.vi-dt-cell.is-pin-edge.is-pin-end {
  box-shadow: inset 1px 0 0 var(--dt-accent);
}

.vi-dt-hcell.is-sortable {
  cursor: pointer;
  user-select: none;
}
.vi-dt-hcell.is-dragging {
  opacity: 0.5;
}
.vi-dt-hcell.is-drop-target {
  box-shadow: inset 2px 0 0 var(--dt-accent);
}
.vi-dt-hcell {
  padding-inline: var(--wa-space-s);
}
/* The label fills the free space — otherwise the filter and menu buttons
   slide into the middle of the cell and intercept the sort click. */
.vi-dt-hcell .vi-dt-hlabel {
  flex: 1 1 auto;
  min-inline-size: 0;
  align-self: center;
}
.vi-dt-hcell.is-align-end .vi-dt-hlabel {
  text-align: end;
}
.vi-dt-hcell.is-align-center .vi-dt-hlabel {
  text-align: center;
}
/* Only show the column menu when the column is focused/hovered — otherwise it eats
   the label. (wa-dropdown itself is display:contents, so style the trigger.)
   Active filters always stay visible. */
/* visibility instead of display: the button is invisible and NOT clickable
   (so it doesn't intercept the sort click in the middle of the cell), but keeps its
   place in the layout. Both matter:
   - With display:none the button leaves the layout. If its menu is open, the
     popup suddenly has no anchor anymore and jumps to the top left corner.
   - Also, the header row would reflow on every hover change and shift open
     filter popovers by the button width. */
.vi-dt-column-menu-button {
  visibility: hidden;
}
.vi-dt-hcell:hover .vi-dt-column-menu-button,
.vi-dt-hcell:focus-within .vi-dt-column-menu-button,
.vi-dt-column-menu[open] .vi-dt-column-menu-button {
  visibility: visible;
}
.vi-dt-filter-button {
  opacity: 0.55;
}
.vi-dt-hcell:hover .vi-dt-filter-button,
.vi-dt-hcell:focus-within .vi-dt-filter-button,
.vi-dt-filter-button.is-active {
  opacity: 1;
}
.vi-dt-sort,
.vi-dt-pin {
  flex: 0 0 auto;
  font-size: 0.75em;
  color: var(--dt-accent);
}
.vi-dt-pin {
  cursor: pointer;
}
.vi-dt-sortnum {
  flex: 0 0 auto;
  font-size: 0.7em;
  font-variant-numeric: tabular-nums;
  padding-inline: 0.25em;
  border-radius: var(--wa-border-radius-s);
  background-color: var(--wa-color-brand-fill-quiet);
  color: var(--wa-color-brand-on-quiet);
}
.vi-dt-filter-button,
.vi-dt-column-menu-button {
  flex: 0 0 auto;
  font-size: 0.75em;
}
.vi-dt-filter-button::part(base),
.vi-dt-column-menu-button::part(base) {
  min-inline-size: 1.4rem;
  min-block-size: 1.4rem;
  padding: 0;
}
.vi-dt-filter-button.is-active::part(base) {
  color: var(--dt-accent);
}
.vi-dt-resize {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  inline-size: 10px;
  z-index: 1;
  cursor: col-resize;
  touch-action: none;
}
.vi-dt-resize:hover {
  background-color: color-mix(in oklab, var(--dt-accent) 35%, transparent);
}
.vi-dt-hcell {
  position: relative;
}

/* ── Making the tree structure visible ─────────────────────────────── */
/* Indentation alone reads poorly. Hence one vertical guide line per level
   (as a background pattern over the indented area) and a
   short corner to the row itself — like in a file tree. */
.vi-dt {
  --dt-guide: var(--wa-color-surface-border);
}
.vi-dt-cell.is-tree-cell {
  position: relative;
}
/* One slot per level. The vertical line sits in the MIDDLE of the slot so
   it runs through the expand arrows of the respective level.
     is-line    → continuous line (ancestor still has siblings)
     is-tee     → "├" (this row still has siblings)
     is-corner  → "└" (last child: empty below)
     none       → empty slot (the subtree ends there)
   The arm ends at the edge of the slot — it does NOT run past the arrow or the
   leaf placeholder up to the text. */
.vi-dt-guide {
  position: relative;
  flex: 0 0 auto;
  inline-size: var(--dt-indent);
  align-self: stretch;
}
.vi-dt-guide.is-line::before,
.vi-dt-guide.is-tee::before,
.vi-dt-guide.is-corner::before {
  content: "";
  position: absolute;
  inset-block: 0;
  inset-inline-start: calc(50% - 0.5px);
  inline-size: 1px;
  background-color: var(--dt-guide);
}
/* Corner: the vertical line ends at half height. */
.vi-dt-guide.is-corner::before {
  inset-block: 0 50%;
}
/* Short arm from the middle to the edge of the slot. */
.vi-dt-guide.is-tee::after,
.vi-dt-guide.is-corner::after {
  content: "";
  position: absolute;
  inset-block-start: calc(50% - 0.5px);
  inset-inline: 50% 0;
  block-size: 1px;
  background-color: var(--dt-guide);
}

/* Arrow and leaf placeholder MUST be equally wide — otherwise the labels of a
   level don't line up and the indentation gets
   partially eaten up (the wa-button is wider by itself). */
.vi-dt-expand {
  flex: 0 0 auto;
  inline-size: var(--dt-toggle-size);
}
/* Loaded and empty: the arrow stays in place (no layout jump),
   but is visibly out of service. */
.vi-dt-expand.is-empty {
  opacity: 0.3;
  cursor: default;
}
.vi-dt-expand-spinner {
  font-size: 0.75em;
  --track-width: 2px;
}
/* Leaves: same spacing as between arrow and guide lines. */
.vi-dt-leaf-gap {
  flex: 0 0 auto;
  inline-size: var(--wa-space-2xs);
}

/* ── Fixed order: handle and insertion marker ──────────────────────── */
.vi-dt-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 100%;
  color: var(--wa-color-text-quiet);
  cursor: grab;
  opacity: 0.55;
  font-size: 0.85em;
}
.vi-dt-row:hover .vi-dt-grip {
  opacity: 1;
}
.vi-dt-grip.is-disabled {
  cursor: not-allowed;
  opacity: 0.25;
}
.vi-dt-row.is-dragging {
  opacity: 0.5;
}
/* Marker where the row would land. As an inset shadow so it costs no
   layout height and rows don't jump while dragging. */
.vi-dt-row.is-drop-before .vi-dt-cell {
  box-shadow: inset 0 2px 0 var(--dt-accent);
}
.vi-dt-row.is-drop-after .vi-dt-cell {
  box-shadow: inset 0 -2px 0 var(--dt-accent);
}
/* "Inside": the row becomes the parent — hence a frame around the whole row
   instead of a line at the edge. */
.vi-dt-row.is-drop-inside .vi-dt-cell {
  box-shadow:
    inset 0 2px 0 var(--dt-accent),
    inset 0 -2px 0 var(--dt-accent);
}
.vi-dt-row.is-drop-inside {
  --dt-row-bg: color-mix(in oklab, var(--dt-selected) 60%, transparent);
}

/* The expand column sits left of the tree cell — its line continues
   so arrow and structure connect. */
.vi-dt-cell.is-lead.is-expand-cell {
  position: relative;
}
.vi-dt-expand::part(base) {
  inline-size: var(--dt-toggle-size);
  min-inline-size: var(--dt-toggle-size);
  block-size: var(--dt-toggle-size);
  min-block-size: var(--dt-toggle-size);
  padding: 0;
}
.vi-dt-group-count {
  padding-inline: var(--wa-space-2xs);
  border-radius: var(--wa-border-radius-pill);
  background-color: var(--wa-color-neutral-fill-quiet);
  font-size: 0.8em;
  font-variant-numeric: tabular-nums;
}
.vi-dt-aggregate {
  color: var(--wa-color-text-quiet);
  font-variant-numeric: tabular-nums;
}

.vi-dt-detailrow {
  border-block-end: var(--dt-border-width) solid var(--dt-border-color);
  background-color: var(--wa-color-surface-lowered);
}
.vi-dt-detail {
  padding: var(--wa-space-m);
}

.vi-dt-foot {
  position: sticky;
  inset-block-end: 0;
  z-index: 3;
}
.vi-dt-footrow .vi-dt-cell {
  border-block-end: none;
  border-block-start: var(--dt-border-width) solid var(--dt-border-color);
}

.vi-dt-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-block: var(--wa-space-2xl);
  color: var(--wa-color-text-quiet);
}
.vi-dt-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: color-mix(in oklab, var(--wa-color-surface-default) 65%, transparent);
  z-index: 4;
}
.vi-dt-spinner {
  font-size: 2rem;
}

.vi-dt-pager,
.vi-dt-more {
  padding: var(--wa-space-s);
  border-block-start: var(--dt-border-width) solid var(--dt-border-color);
  font-size: var(--wa-font-size-s);
}
.vi-dt-more > * {
  flex: 0 0 auto;
}
.vi-dt-moreinfo {
  color: var(--wa-color-text-quiet);
  white-space: nowrap;
}
.vi-dt-pager > * {
  flex: 0 0 auto;
}
.vi-dt-pagesize,
.vi-dt-pageinfo {
  white-space: nowrap;
}
.vi-dt-pageinfo {
  color: var(--wa-color-text-quiet);
}
.vi-dt-pagesize {
  font: inherit;
  min-inline-size: 6.5rem;
  padding: 0.15rem 0.35rem;
  border: var(--dt-border-width) solid var(--dt-border-color);
  border-radius: var(--wa-border-radius-s);
  background-color: var(--wa-color-surface-default);
  color: inherit;
}

.vi-dt-checkbox {
  accent-color: var(--dt-accent);
  inline-size: 1rem;
  block-size: 1rem;
}
.vi-dt-colopt {
  font-size: var(--wa-font-size-s);
  cursor: pointer;
}
/* Screen readers only: invisible but present. The containing block is .vi-dt
   (position: relative) so the region stays clipped within the grid. */
.vi-dt-live {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
