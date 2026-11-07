import { describe, it, expect, vi, afterEach } from "vitest"
import { createApp, h, nextTick } from "vue"

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))

const { default: DataTable } = await import("../../src/components/DataTable/DataTable.vue")

let app = null
let el = null

async function mountTable(props, slots) {
  el = document.createElement("div")
  document.body.appendChild(el)
  app = createApp({
    render: () =>
      h(DataTable, { columns: [{ field: "name", label: "Name" }], data: [], rowKey: "key", ...props }, slots),
  })
  app.mount(el)
  await nextTick()
  return el
}

afterEach(() => {
  app?.unmount()
  el?.remove()
})

describe("DataTable toolbar", () => {
  it("shows the toolbar slots without search and columns menu", async () => {
    const root = await mountTable(
      { withSearch: false, withColumnsMenu: false },
      {
        "toolbar-start": () => h("button", { class: "own-start" }, "New"),
        "toolbar-end": () => h("button", { class: "own-end" }, "Export"),
      }
    )
    expect(root.querySelector(".vi-dt-toolbar .own-start")).not.toBeNull()
    expect(root.querySelector(".vi-dt-toolbar .own-end")).not.toBeNull()
  })

  it("has no toolbar without search, columns menu and slots", async () => {
    const root = await mountTable({ withSearch: false, withColumnsMenu: false })
    expect(root.querySelector(".vi-dt-toolbar")).toBeNull()
  })

  it("marks the table aria-busy while loading", async () => {
    const root = await mountTable({ loading: true })
    expect(root.querySelector(".vi-dt").getAttribute("aria-busy")).toBe("true")
  })

  it("has no aria-busy when idle", async () => {
    const root = await mountTable({ loading: false })
    expect(root.querySelector(".vi-dt").hasAttribute("aria-busy")).toBe(false)
  })
})
