import { describe, it, expect, afterEach, vi } from "vitest"
import { createApp, h, nextTick, reactive, ref } from "vue"
import { createPinia } from "pinia"

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))

const { default: ViForm } = await import("../../src/forms/ViForm.vue")

// `values` overrides the skel on load. A later skel update (an outer form writing
// back, dragging internal forms) must not lay it over a value the user edited.

let app = null

afterEach(() => {
  app?.unmount()
  app = null
})

describe("ViForm skel watcher", () => {
  it("keeps an edited value written back to the skel", async () => {
    const form = ref(null)
    const structure = {
      name: { type: "str", visible: true, params: {} },
      status: { type: "str", visible: true, params: {} },
    }
    const skel = reactive({ name: "a", status: "server" })
    app = createApp({
      setup: () => () => h(ViForm, { ref: form, structure, skel, values: { status: "preset" }, multistep: false }),
    })
    app.use(createPinia())
    app.config.globalProperties.$t = (key) => key
    app.config.globalProperties.$te = () => false
    app.mount(document.createElement("div"))
    await nextTick()
    expect(form.value.state.skel.status).toBe("preset")

    skel.status = "edited"
    await nextTick()

    expect(form.value.state.skel.status).toBe("edited")
  })
})
