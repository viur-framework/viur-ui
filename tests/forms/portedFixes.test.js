import { describe, it, expect, vi, afterEach } from "vitest"
import { createApp, defineComponent, h, nextTick, reactive } from "vue"

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))

const { default: ViForm } = await import("../../src/forms/ViForm.vue")
const { default: BoneNestedWrapper } = await import("../../src/forms/bones/BoneNestedWrapper.vue")
const { default: DateBone } = await import("../../src/forms/bones/widgets/dateBone.vue")

let apps = []

function mount(component, props, provides = {}) {
  const app = createApp(component, props)
  app.config.globalProperties.$t = (key) => key
  for (const [key, value] of Object.entries(provides)) app.provide(key, value)
  const el = document.createElement("div")
  app.mount(el)
  apps.push(app)
  return el
}

afterEach(() => {
  apps.forEach((app) => app.unmount())
  apps = []
})

describe("ViForm fallthrough attributes", () => {
  it("puts class and id set on <vi-form> on the <form>", async () => {
    const EmptyLayout = defineComponent({ setup: () => () => null })
    const el = mount(
      defineComponent({
        setup: () => () =>
          h(ViForm, {
            class: "form-group",
            id: "my-form",
            structure: { name: { type: "str", visible: true, params: {} } },
            layout: EmptyLayout,
          }),
      })
    )
    await nextTick()

    const form = el.querySelector("form")
    expect(form.classList.contains("form-group")).toBe(true)
    expect(form.id).toBe("my-form")
  })
})

describe("BoneNestedWrapper defaultvalue", () => {
  it("gives every new entry its own copy of an object defaultvalue", () => {
    const defaultvalue = reactive({ de: "Hallo", en: "Hello" })
    const bone = { multiple: true, params: {}, using: { title: { type: "str", defaultvalue } } }
    const entries = []
    const provides = { boneState: { bonestructure: bone }, mainformState: reactive({ skel: { items: [] } }) }

    for (const index of [0, 1]) {
      mount(
        BoneNestedWrapper,
        { name: "items", index, lang: null, bone, value: null, onChange: (...args) => entries.push(args[1]) },
        provides
      )
    }

    expect(entries).toHaveLength(2)
    expect(entries[0].title).toEqual({ de: "Hallo", en: "Hello" })
    expect(entries[0].title).not.toBe(entries[1].title)

    entries[0].title.de = "geändert"
    expect(entries[1].title.de).toBe("Hallo")
    expect(defaultvalue.de).toBe("Hallo")
  })
})

describe("BoneNestedWrapper readonly", () => {
  /** The ViForm component instance below `vnode`. */
  function findViForm(vnode) {
    if (!vnode) return null
    if (vnode.component) {
      if (vnode.type === ViForm) return vnode.component
      return findViForm(vnode.component.subTree)
    }
    for (const child of Array.isArray(vnode.children) ? vnode.children : []) {
      const found = findViForm(child)
      if (found) return found
    }
    return null
  }

  it.each([
    [{}, false],
    [{ form: true }, true],
    [{ bone: true }, true],
  ])("passes readonly %o on to the sub fields", async ({ form = false, bone = false }, expected) => {
    const app = createApp(BoneNestedWrapper, {
      name: "items",
      index: 0,
      lang: null,
      bone: { params: {}, using: {} },
      value: {},
    })
    app.config.globalProperties.$t = (key) => key
    app.component("Bone", defineComponent({ render: () => null }))
    app.provide("boneState", { readonly: bone, bonestructure: {} })
    app.provide("mainformState", reactive({ skel: {}, readonly: form }))
    const vm = app.mount(document.createElement("div"))
    apps.push(app)
    await nextTick()

    expect(findViForm(vm.$.subTree).props.readonly).toBe(expected)
  })

  // #27: use-categories="false" on the outer form must reach record bones too.
  it.each([
    [true, {}, true],
    [false, {}, false],
    [true, { categoryDefaultname: null }, false],
  ])("passes useCategories=%s (params %o) on to the sub form", async (useCategories, params, expected) => {
    const app = createApp(BoneNestedWrapper, { name: "items", bone: { params, using: {} }, value: {} })
    app.config.globalProperties.$t = (key) => key
    app.component("Bone", defineComponent({ render: () => null }))
    app.provide("boneState", { bonestructure: {} })
    app.provide("mainformState", reactive({ skel: {}, useCategories }))
    const vm = app.mount(document.createElement("div"))
    apps.push(app)
    await nextTick()

    expect(findViForm(vm.$.subTree).props.useCategories).toBe(expected)
  })
})

describe("dateBone min/max", () => {
  it("passes params.min and params.max to the input", () => {
    const bonestructure = { date: true, time: false, params: { min: "2026-01-01", max: "2026-12-31" } }
    const el = mount(
      DateBone,
      { name: "field", value: null },
      {
        boneState: { readonly: false, multiple: false, errorMessages: [], bonestructure, params: bonestructure.params },
      }
    )

    const input = el.querySelector("wa-input")
    expect(input.getAttribute("min") ?? input.min).toBe("2026-01-01")
    expect(input.getAttribute("max") ?? input.max).toBe("2026-12-31")
  })
})
