import { describe, it, expect, vi, afterEach } from "vitest"
import { createApp, h, nextTick } from "vue"

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))

const { default: DataTable } = await import("../../src/components/DataTable/DataTable.vue")

let app = null
let el = null

async function mountTable() {
  const onRowActivate = vi.fn()
  const onCellClick = vi.fn()
  el = document.createElement("div")
  document.body.appendChild(el)
  app = createApp({
    render: () =>
      h(DataTable, {
        columns: [{ field: "name", label: "Name" }],
        data: [{ key: "k1", name: "Ada" }],
        rowKey: "key",
        label: "items",
        onRowActivate,
        onCellClick,
      }),
  })
  app.mount(el)
  await nextTick()
  return { onRowActivate, onCellClick }
}

const dataCell = () =>
  [...el.querySelectorAll('[role="gridcell"][data-row="0"]')].find((cell) => cell.textContent.includes("Ada"))

afterEach(() => {
  app?.unmount()
  el?.remove()
})

describe("DataTable row-activate", () => {
  it("is emitted on Enter on a data cell, not on a single click", async () => {
    const { onRowActivate, onCellClick } = await mountTable()
    const cell = dataCell()
    cell.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(onCellClick).toHaveBeenCalledTimes(1)
    expect(onRowActivate).not.toHaveBeenCalled()

    cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    expect(onRowActivate).toHaveBeenCalledWith(expect.objectContaining({ key: "k1", row: { key: "k1", name: "Ada" } }))
  })

  it("is emitted on a double click on a data row", async () => {
    const { onRowActivate } = await mountTable()
    dataCell().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    expect(onRowActivate).toHaveBeenCalledWith(expect.objectContaining({ key: "k1" }))
  })
})
