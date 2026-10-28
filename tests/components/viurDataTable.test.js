import { describe, it, expect, vi, beforeEach } from "vitest"
import { createApp, defineComponent, h, nextTick, ref } from "vue"

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))

// The table itself is stubbed: of interest is what the wrapper hands over and asks the server for.
const table = vi.hoisted(() => ({ props: null, emit: null }))
vi.mock("../../src/components/DataTable/DataTable.vue", () => ({
  default: defineComponent({
    props: ["columns", "maxMultiSort", "server"],
    emits: ["data-request", "row-activate", "cell-click"],
    setup(props, { emit }) {
      table.props = props
      table.emit = emit
      return () => h("div")
    },
  }),
}))

const list = vi.hoisted(() => ({ filter: null, complete: false }))
vi.mock("../../src/request/index.js", () => ({
  useListFetch: () => {
    list.filter = vi.fn(async () => {})
    return {
      data: ref([{ key: "k1", name: "A" }]),
      structure: ref({ name: { type: "str", descr: "Name", indexed: true } }),
      complete: ref(list.complete),
      cursor: ref("c1"),
      isFetching: ref(false),
      filter: list.filter,
      next: vi.fn(),
      nextAll: vi.fn(),
    }
  },
}))

const { default: ViurDataTable } = await import("../../src/components/DataTable/ViurDataTable.vue")

function mount(props = {}) {
  const exposed = ref(null)
  const app = createApp({ render: () => h(ViurDataTable, { ref: exposed, module: "items", ...props }) })
  app.mount(document.createElement("div"))
  return exposed
}

const request = (overrides) => ({ sort: [], filters: [], search: "", page: 0, pageSize: 50, ...overrides })

beforeEach(() => {
  localStorage.clear()
  list.complete = false
})

describe("ViurDataTable", () => {
  it("searches on the server with the table's own search box", () => {
    mount()
    table.emit("data-request", request({ search: " ada " }))
    expect(list.filter.mock.calls.at(-1)[0].search).toBe("ada")
  })

  it("keeps a search() term on a later sort request", async () => {
    const exposed = mount()
    exposed.value.search("ada")
    await nextTick()
    table.emit("data-request", request({ search: "ada", sort: [{ id: "name", desc: false }] }))
    expect(list.filter.mock.calls.at(-1)[0]).toMatchObject({ search: "ada", orderby: "name" })
  })

  it("allows one sorting in server mode, as ViUR orders by one bone", () => {
    mount()
    expect(table.props.maxMultiSort).toBe(1)
  })

  it("stays in server mode for a search given in params", () => {
    // a full text search answers without a cursor; the rows are still only the hits
    list.complete = true
    mount({ params: { search: "ada" } })
    expect(table.props.server).toBe(true)
  })

  it("switches to local mode once everything is loaded without a search", () => {
    list.complete = true
    mount()
    expect(table.props.server).toBe(false)
  })

  it("hides custom columns the user switched off", async () => {
    const exposed = mount({
      columns: [
        { field: "name", label: "Name" },
        { field: "nr", label: "Nr" },
      ],
    })
    exposed.value.columns.apply(["name"])
    await nextTick()
    expect(table.props.columns.map((column) => [column.field, column.hidden])).toEqual([
      ["name", false],
      ["nr", true],
    ])
  })

  it("keeps the own hidden flag of custom columns until the user chooses", () => {
    mount({ columns: [{ field: "secret", label: "Secret", hidden: true }] })
    expect(table.props.columns[0].hidden).toBe(true)
  })

  it("opens a row on row-activate (double click or Enter)", () => {
    const onOpen = vi.fn()
    mount({ onOpen })
    table.emit("row-activate", { key: "k1", row: { key: "k1" }, index: 0 })
    expect(onOpen).toHaveBeenCalledWith({ key: "k1", row: { key: "k1" } })
  })

  it("passes cell-click through", () => {
    const onCellClick = vi.fn()
    mount({ onCellClick })
    const payload = { column: "name", value: "A", row: { key: "k1" }, index: 0 }
    table.emit("cell-click", payload)
    expect(onCellClick).toHaveBeenCalledWith(payload)
  })
})
