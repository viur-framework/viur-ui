import { describe, it, expect, afterEach } from "vitest"
import { createApp, h, nextTick, ref } from "vue"
import { createI18n } from "vue-i18n"
import { createPinia } from "pinia"
import de from "../../../src/translations/de.js"
import en from "../../../src/translations/en.js"
import ViForm from "../../../src/forms/ViForm.vue"

// The duration widget inside a real ViForm: what reaches the form state (skel, valids, isValid).

// viur-core sends sys.maxsize as "no limit"
const NO_LIMIT = 9223372036854775807

let app = null

afterEach(() => {
  app?.unmount()
  app = null
})

async function mountForm(estimate, bone = {}) {
  const form = ref(null)
  const structure = {
    estimate: {
      type: "numeric.duration",
      descr: "Estimate",
      visible: true,
      readonly: false,
      required: false,
      multiple: false,
      languages: null,
      min: -NO_LIMIT,
      max: NO_LIMIT,
      params: {},
      ...bone,
    },
  }
  app = createApp({
    setup: () => () => h(ViForm, { ref: form, structure, skel: { estimate }, multistep: false }),
  })
  app.use(createPinia())
  app.use(createI18n({ legacy: false, locale: "de", fallbackLocale: "en", messages: { de, en } }))
  const el = document.createElement("div")
  app.mount(el)
  await nextTick()
  await nextTick()
  return { state: form.value.state, input: () => el.querySelector("wa-input.bone-widget-numeric-duration") }
}

async function type(input, text) {
  input.value = text
  input.dispatchEvent(new Event("input"))
  await nextTick()
}

describe("numericBoneDuration in a ViForm", () => {
  it("stores typed minutes and keeps the form valid", async () => {
    const { state, input } = await mountForm(30)
    expect(input()).not.toBeNull()
    expect(state.isValid).toBe(true)

    await type(input(), "1h 30m")
    expect(state.skel.estimate).toBe("90")
    expect(state.valids.estimate).toBe(true)
    expect(state.isValid).toBe(true)
  })

  it("makes the form invalid for unknown text and keeps the last good value", async () => {
    const { state, input } = await mountForm(30)
    await type(input(), "soon")
    expect(state.valids.estimate).toBe(false)
    expect(state.isValid).toBe(false)
    expect(state.skel.estimate).toBe("30")

    await type(input(), "2h")
    expect(state.isValid).toBe(true)
    expect(state.skel.estimate).toBe("120")
  })

  it("starts invalid with a setup error and stays invalid", async () => {
    const logged = []
    const original = console.error
    console.error = (...args) => logged.push(args)
    try {
      const { state } = await mountForm(30, { params: { hours_per_day: 0 } })
      expect(state.valids.estimate).toBe(false)
      expect(state.isValid).toBe(false)
    } finally {
      console.error = original
    }
  })

  it("starts invalid for a required bone without value", async () => {
    const { state, input } = await mountForm(null, { required: true })
    expect(state.isValid).toBe(false)
    await type(input(), "15")
    expect(state.isValid).toBe(true)
    expect(state.skel.estimate).toBe("15")
  })
})
