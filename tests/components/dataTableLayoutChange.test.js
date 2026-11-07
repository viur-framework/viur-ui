import { describe, it, expect, vi, afterEach } from "vitest"
import { createApp, h, nextTick } from "vue"

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))

const { default: DataTable } = await import("../../src/components/DataTable/DataTable.vue")

let app = null
let el = null

afterEach(() => {
  app?.unmount()
  el?.remove()
})

describe("DataTable layout-change", () => {
  it("fires once at resize end with the layout part of getState, not while dragging", async () => {
    const onLayoutChange = vi.fn()
    const onColumnResize = vi.fn()
    el = document.createElement("div")
    document.body.appendChild(el)
    app = createApp({
      render: () =>
        h(DataTable, {
          columns: [
            { field: "name", label: "Name", width: 100 },
            { field: "city", label: "City" },
          ],
          data: [{ key: "k1", name: "Ada", city: "Kassel" }],
          rowKey: "key",
          label: "items",
          resizable: true,
          onLayoutChange,
          onColumnResize,
        }),
    })
    app.mount(el)
    await nextTick()

    el.querySelector('.vi-dt-resize[data-column="name"]').dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 100, bubbles: true })
    )
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 130 }))
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 150 }))
    await nextTick()
    expect(onColumnResize).toHaveBeenCalledTimes(2)
    expect(onLayoutChange).not.toHaveBeenCalled()

    window.dispatchEvent(new PointerEvent("pointerup"))
    await nextTick()
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    const layout = onLayoutChange.mock.calls[0][0]
    expect(layout).toEqual({
      columnOrder: ["name", "city"],
      columnWidths: { name: 150 },
      columnVisibility: { name: true, city: true },
      columnPinning: { start: [], end: [] },
    })
  })
})
