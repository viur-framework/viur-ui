import { describe, it, expect, afterEach, vi } from "vitest"
import { createApp, h, nextTick, ref } from "vue"
import { createPinia } from "pinia"

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))

const { default: ViForm } = await import("../../src/forms/ViForm.vue")

// A multiple or multilingual bone reports the validity of each entry on its own. The form must stay
// invalid while any entry is invalid, not take whatever the last entry reported.

let app = null

afterEach(() => {
  app?.unmount()
  app = null
})

/** Mounts a ViForm with one numeric bone `amount` and returns the form state and its inputs. */
async function mountForm(amount, bone = {}) {
  const form = ref(null)
  const structure = {
    amount: {
      type: "numeric",
      descr: "Amount",
      visible: true,
      readonly: false,
      required: false,
      multiple: false,
      languages: null,
      params: {},
      ...bone,
    },
  }
  app = createApp({ setup: () => () => h(ViForm, { ref: form, structure, skel: { amount }, multistep: false }) })
  app.use(createPinia())
  app.config.globalProperties.$t = (key) => key
  app.config.globalProperties.$te = () => false
  const el = document.createElement("div")
  app.mount(el)
  await nextTick()
  await nextTick()
  return {
    form: form.value,
    state: form.value.state,
    inputs: () => [...el.querySelectorAll("wa-input.bone-widget-numeric")],
    el,
  }
}

/**
 * Types into a numeric widget. Without Web Awesome loaded the element has no native validity, so the
 * test decides what `reportValidity()` answers (as the browser would for a value below `min`).
 */
async function type(input, value, valid) {
  input.reportValidity = () => valid
  input.value = value
  input.dispatchEvent(new Event("keyup"))
  await nextTick()
}

describe("form validity per entry", () => {
  it("keeps the form invalid when a later entry of a multiple bone is valid", async () => {
    const { state, inputs } = await mountForm(["5", "30"], { multiple: true })
    expect(inputs()).toHaveLength(2)
    expect(state.isValid).toBe(true)

    await type(inputs()[0], "-1", false)
    expect(state.isValid).toBe(false)
    await type(inputs()[1], "40", true)
    expect(state.isValid).toBe(false)

    await type(inputs()[0], "5", true)
    expect(state.isValid).toBe(true)
  })

  it("keeps the form invalid when another language is valid", async () => {
    const { state, inputs } = await mountForm({ de: "5", en: "30" }, { languages: ["de", "en"] })
    expect(inputs()).toHaveLength(2)

    await type(inputs()[0], "-1", false)
    await type(inputs()[1], "40", true)
    expect(state.isValid).toBe(false)
  })

  it("forgets the invalid entry once it is removed", async () => {
    const { state, inputs, el } = await mountForm(["5", "30"], { multiple: true })
    await type(inputs()[0], "-1", false)
    expect(state.isValid).toBe(false)

    // the row's X: the required action "removeEntry"
    const remove = el.querySelector(".bone-multiple-wrapper wa-button[variant=danger]")
    remove.dispatchEvent(new Event("click"))
    await nextTick()
    await nextTick()
    expect(inputs()).toHaveLength(1)
    expect(state.skel.amount).toEqual(["30"])
    expect(state.isValid).toBe(true)
  })

  it("starts over for a bone whose entries were reordered", async () => {
    const { form, state, inputs } = await mountForm(["5", "30"], { multiple: true })
    await type(inputs()[0], "-1", false)
    expect(state.isValid).toBe(false)

    // what Bone emits for a drag in the multiple list: the whole array in its new order, no index
    form.updateSkel({ name: "amount", lang: null, index: null, value: ["30", "5"], valid: true })
    expect(state.isValid).toBe(true)
    await type(inputs()[1], "-2", false)
    expect(state.isValid).toBe(false)
  })

  it("keeps other languages when one language list is replaced", async () => {
    const { form, state } = await mountForm({ de: ["5"], en: ["30"] }, { multiple: true, languages: ["de", "en"] })
    form.updateSkel({ name: "amount", lang: "en", index: 0, value: "-1", valid: false })
    form.updateSkel({ name: "amount", lang: "de", index: null, value: ["7"], valid: true })
    expect(state.isValid).toBe(false)
    form.updateSkel({ name: "amount", lang: "en", index: null, value: [], valid: true })
    expect(state.isValid).toBe(true)
  })
})
