import { describe, it, expect, afterEach, vi } from "vitest"
import { createApp, h, nextTick, reactive, ref } from "vue"
import { createPinia } from "pinia"

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))

const { default: ViForm } = await import("../../src/forms/ViForm.vue")
const { installViurForms } = await import("../../src/forms/install.js")

// A multiple record bone renders one nested form per row. A nested form reports
// its values at once, and ignores the echo of its own change, so the outer
// form never holds a stale row that could reset the nested form.

const STRUCTURE = {
  rows: {
    type: "record",
    multiple: true,
    visible: true,
    readonly: false,
    params: {},
    using: { a: { type: "str", visible: true, readonly: false, params: {} } },
  },
  title: { type: "str", visible: true, readonly: false, params: {} },
}

let app = null

/** All component instances below `vnode` that match `pred`. */
function findAll(vnode, pred, out = []) {
  if (!vnode) return out
  if (vnode.component) {
    if (pred(vnode.component)) out.push(vnode.component)
    findAll(vnode.component.subTree, pred, out)
  }
  if (Array.isArray(vnode.children)) for (const child of vnode.children) findAll(child, pred, out)
  return out
}

/** Mounts a form with a real record bone; `skel` is reactive like an app's own state. */
async function mountForm(rows) {
  const skel = reactive({ rows, title: "" })
  const outer = ref(null)
  const changes = []
  app = createApp({
    setup: () => () => h(ViForm, { ref: outer, structure: STRUCTURE, skel, onChange: (d) => changes.push(d) }),
  })
  app.config.globalProperties.$t = (key) => key
  app.config.globalProperties.$te = () => false
  app.use(createPinia())
  installViurForms(app)
  app.mount(document.createElement("div"))
  const nested = () => findAll(app._instance.subTree, (c) => c.type === ViForm && c.props.internal)
  await vi.waitFor(() => expect(nested()).toHaveLength(rows.length), { timeout: 5000 })
  const edit = (form, name, value) => form.setupState.formUpdate({ name, value, lang: null, index: null, valid: true })
  return { skel, outer, nested, changes, edit }
}

afterEach(() => {
  app?.unmount()
  app = null
})

describe("nested form sync", () => {
  it("hands a row edit to the outer form at once", async () => {
    const { outer, nested, edit } = await mountForm([{ a: "old" }])
    edit(nested()[0], "a", "new")
    expect(outer.value.state.skel.rows[0].a).toBe("new")
  })

  it("keeps the edit of a row when the app adds a row", async () => {
    const { skel, outer, nested, edit } = await mountForm([{ a: "old" }])
    const row = nested()[0]
    edit(row, "a", "new")
    // The app re-passes its skel with a new row (copy of the form's rows).
    skel.rows = [...JSON.parse(JSON.stringify(outer.value.state.skel.rows)), { a: "" }]
    await vi.waitFor(() => expect(nested()).toHaveLength(2), { timeout: 5000 })
    await nextTick()
    expect(nested()[0].exposed.state.skel.a).toBe("new")
    expect(outer.value.state.skel.rows[0].a).toBe("new")
  })

  it("takes a row that really changed outside (drag & drop, reset)", async () => {
    const { skel, nested } = await mountForm([{ a: "old" }])
    skel.rows = [{ a: "other" }]
    await nextTick()
    await nextTick()
    expect(nested()[0].exposed.state.skel.a).toBe("other")
  })

  it("flush emits the pending change of the outer form at once", async () => {
    const { outer, changes, edit } = await mountForm([{ a: "old" }])
    const outerForm = findAll(app._instance.subTree, (c) => c.type === ViForm && !c.props.internal)[0]
    changes.length = 0
    edit(outerForm, "title", "Hello")
    expect(changes).toHaveLength(0)
    outer.value.flush()
    expect(changes.map((d) => d.value)).toEqual(["Hello"])
    await new Promise((r) => setTimeout(r, 600))
    expect(changes).toHaveLength(1)
  })
})
